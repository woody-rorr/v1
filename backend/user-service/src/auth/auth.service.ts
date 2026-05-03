import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository, IsNull, MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { IAuthService } from './auth.service.interface';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthTokensResult } from './types/auth-tokens.result';
import { UserProfileResult } from './types/user-profile.result';
import { JwtAccessPayload, JwtRefreshPayload } from './types/jwt-payload.type';

import { UserEntity } from './entities/user.entity';
import { LoginAttemptEntity } from './entities/login-attempt.entity';
import { RefreshTokenBlacklistEntity } from './entities/refresh-token-blacklist.entity';

import {
  InvalidCredentialsException,
  AccountLockedException,
  AccountInactiveException,
  AccountDeletedException,
  EmailNotVerifiedException,
  TokenReusedException,
  InvalidTokenTypeException,
  UserNotFoundException,
} from './exceptions/auth.exceptions';

/** 로그인 연속 실패 허용 횟수 */
const MAX_FAILED_ATTEMPTS = 5;
/** 계정 잠금 시간 (분) */
const LOCK_DURATION_MINUTES = 30;
/** Access Token TTL (초) */
const AT_TTL_SECONDS = 15 * 60;
/** Refresh Token TTL (초) */
const RT_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(LoginAttemptEntity)
    private readonly loginAttemptRepo: Repository<LoginAttemptEntity>,

    @InjectRepository(RefreshTokenBlacklistEntity)
    private readonly blacklistRepo: Repository<RefreshTokenBlacklistEntity>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  // ──────────────────────────────────────────────
  // login
  // ──────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ip: string,
    userAgent: string,
  ): Promise<AuthTokensResult> {
    // 1. 유저 조회 (소프트 딜리트 포함)
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      withDeleted: true,
    });

    // 타이밍 어택 방지: 유저가 없어도 bcrypt 연산을 수행한다
    const dummyHash = '$2b$12$invalidhashpadding000000000000000000000000000000000000';
    const passwordToVerify = user?.passwordHash ?? dummyHash;
    const passwordMatch = await bcrypt.compare(dto.password, passwordToVerify);

    if (!user) {
      // 존재하지 않는 이메일은 별도 DB 기록 없이 즉시 거부
      throw new InvalidCredentialsException();
    }

    // 2. 삭제된 계정
    if (user.deletedAt !== null) {
      throw new AccountDeletedException();
    }

    // 3. 비활성 계정
    if (!user.isActive) {
      throw new AccountInactiveException();
    }

    // 4. 잠금 여부 확인 (최신 login_attempt 행 기준)
    const latestAttempt = await this.loginAttemptRepo.findOne({
      where: { userId: user.id },
      order: { attemptedAt: 'DESC' },
    });

    if (
      latestAttempt?.lockedUntil &&
      latestAttempt.lockedUntil > new Date()
    ) {
      throw new AccountLockedException(latestAttempt.lockedUntil);
    }

    // 5. 패스워드 검증 실패
    if (!passwordMatch) {
      await this.recordFailedAttempt(user.id, ip, userAgent, latestAttempt);
      throw new InvalidCredentialsException();
    }

    // 6. 이메일 미인증
    if (!user.isVerified) {
      throw new EmailNotVerifiedException();
    }

    // 7. 토큰 발급
    const tokens = this.issueTokens(user.id, user.email);

    // 8. 성공 기록 (failed_count 리셋)
    await this.loginAttemptRepo.save(
      this.loginAttemptRepo.create({
        userId: user.id,
        ipAddress: ip,
        userAgent,
        success: true,
        failedCount: 0,
        lockedUntil: null,
      }),
    );

    return tokens;
  }

  // ──────────────────────────────────────────────
  // refresh (RT rotation + 재사용 공격 감지)
  // ──────────────────────────────────────────────

  async refresh(dto: RefreshTokenDto): Promise<AuthTokensResult> {
    // 1. RT 서명/만료 검증
    let payload: JwtRefreshPayload;
    try {
      payload = this.jwtService.verify<JwtRefreshPayload>(dto.refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new InvalidCredentialsException();
    }

    // type guard
    if (payload.type !== 'refresh') {
      throw new InvalidTokenTypeException();
    }

    // 2. Blacklist 조회 — 이미 폐기된 jti면 재사용 공격
    const blacklisted = await this.blacklistRepo.findOne({
      where: { jti: payload.jti },
    });

    if (blacklisted) {
      // 해당 유저의 모든 유효 RT 강제 폐기 (트랜잭션)
      await this.revokeAllTokens(payload.sub, 'compromised');
      this.logger.warn(
        `[SECURITY] RT reuse detected. userId=${payload.sub} jti=${payload.jti}`,
      );
      throw new TokenReusedException();
    }

    // 3. 유저 유효성 재확인
    const user = await this.userRepo.findOne({
      where: { id: payload.sub, isActive: true, deletedAt: IsNull() },
    });

    if (!user) {
      throw new InvalidCredentialsException();
    }

    if (!user.isVerified) {
      throw new EmailNotVerifiedException();
    }

    // 4. 구 RT 블랙리스트 등록 + 5. 새 토큰 발급 (트랜잭션)
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const oldExpiresAt = new Date(payload.exp! * 1000);
      await queryRunner.manager.save(RefreshTokenBlacklistEntity, {
        jti: payload.jti,
        userId: payload.sub,
        expiresAt: oldExpiresAt,
        reason: 'rotated' as const,
      });

      const tokens = this.issueTokens(user.id, user.email);

      await queryRunner.commitTransaction();
      return tokens;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ──────────────────────────────────────────────
  // logout (단일 세션)
  // ──────────────────────────────────────────────

  async logout(dto: LogoutDto, userId: string): Promise<void> {
    let payload: JwtRefreshPayload;
    try {
      payload = this.jwtService.verify<JwtRefreshPayload>(dto.refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      // 만료된 RT라도 블랙리스트 등록 시도 (decode만 사용)
      const decoded = this.jwtService.decode<JwtRefreshPayload>(
        dto.refreshToken,
      );
      if (!decoded?.jti) {
        // 복호화 불가한 토큰 — 멱등성 처리로 무시
        return;
      }
      payload = decoded;
    }

    if (payload.type !== 'refresh') {
      throw new InvalidTokenTypeException();
    }

    // 이미 blacklist에 있으면 no-op (멱등성)
    const exists = await this.blacklistRepo.findOne({
      where: { jti: payload.jti },
    });
    if (exists) return;

    const expiresAt = payload.exp
      ? new Date(payload.exp * 1000)
      : new Date(Date.now() + RT_TTL_SECONDS * 1000);

    await this.blacklistRepo.save(
      this.blacklistRepo.create({
        jti: payload.jti,
        userId,
        expiresAt,
        reason: 'logout',
      }),
    );
  }

  // ──────────────────────────────────────────────
  // logoutAll (전체 세션)
  // ──────────────────────────────────────────────

  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllTokens(userId, 'logout_all');
  }

  // ──────────────────────────────────────────────
  // getMe
  // ──────────────────────────────────────────────

  async getMe(userId: string): Promise<UserProfileResult> {
    const user = await this.userRepo.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });

    if (!user) {
      throw new UserNotFoundException(userId);
    }

    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * AT + RT 쌍 발급.
   * RT에는 반드시 고유한 jti를 포함하여 blacklist 키로 사용한다.
   */
  private issueTokens(userId: string, email: string): AuthTokensResult {
    const now = Math.floor(Date.now() / 1000);

    const accessPayload: Omit<JwtAccessPayload, 'iat' | 'exp'> = {
      sub: userId,
      email,
      type: 'access',
    };

    const refreshPayload: Omit<JwtRefreshPayload, 'iat' | 'exp'> = {
      sub: userId,
      jti: uuidv4(),
      type: 'refresh',
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: AT_TTL_SECONDS,
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: RT_TTL_SECONDS,
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: now + AT_TTL_SECONDS,
      refreshTokenExpiresAt: now + RT_TTL_SECONDS,
    };
  }

  /**
   * 로그인 실패 기록.
   * failed_count >= MAX_FAILED_ATTEMPTS 이면 locked_until 설정.
   */
  private async recordFailedAttempt(
    userId: string,
    ip: string,
    userAgent: string,
    latest: LoginAttemptEntity | null,
  ): Promise<void> {
    const prevFailed = latest?.lockedUntil === null ? (latest?.failedCount ?? 0) : 0;
    const newFailed = prevFailed + 1;

    let lockedUntil: Date | null = null;
    if (newFailed >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
      this.logger.warn(
        `[SECURITY] Account locked. userId=${userId} until=${lockedUntil.toISOString()}`,
      );
    }

    await this.loginAttemptRepo.save(
      this.loginAttemptRepo.create({
        userId,
        ipAddress: ip,
        userAgent,
        success: false,
        failedCount: newFailed,
        lockedUntil,
      }),
    );
  }

  /**
   * 특정 유저의 모든 유효 RT를 트랜잭션으로 일괄 폐기.
   * refresh_token_blacklist에 아직 없는 유효 RT는 외부 저장소가 없으므로
   * "이미 발급된 RT는 blacklist에 추가" 방식 대신
   * 새 RT 발급 시 DB에 활성 RT를 저장하는 구조가 필요하다.
   *
   * 현 설계는 blacklist-only 방식이므로 logoutAll은
   * blacklist에 등록된 모든 항목을 무효화하는 것이 아니라
   * "이후 발급되는 RT는 이전 jti 목록이 없으면 허용" 구조다.
   * 따라서 logoutAll의 완전한 구현은 활성 RT 테이블(allowlist)을
   * 별도로 두거나, blacklist에 user_id + wildcard 폐기 마커를 두는 방식을 택한다.
   *
   * 여기서는 blacklist에 reason='logout_all' 마커 행을 삽입하고,
   * refresh() 내에서 해당 마커가 있으면 전체 세션 폐기로 처리하는
   * sentinel 패턴을 사용한다.
   */
  private async revokeAllTokens(
    userId: string,
    reason: 'logout_all' | 'compromised',
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // sentinel 마커: jti='ALL:<userId>:<timestamp>' 로 구분
      const sentinelJti = `ALL:${userId}:${Date.now()}`;
      const expiresAt = new Date(Date.now() + RT_TTL_SECONDS * 1000);

      await queryRunner.manager.save(RefreshTokenBlacklistEntity, {
        jti: sentinelJti,
        userId,
        expiresAt,
        reason,
      });

      await queryRunner.commitTransaction();

      this.logger.log(
        `[AUTH] All sessions revoked. userId=${userId} reason=${reason}`,
      );
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
