import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  DataSource,
  IsNull,
  LessThan,
  MoreThan,
  Repository,
} from 'typeorm';
import * as bcrypt from 'bcrypt';

import { IAuthService } from './auth.service.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthTokensResult } from './types/auth-tokens.result';
import { UserProfileResult } from './types/user-profile.result';
import { JwtAccessPayload } from './types/jwt-payload.type';

import { UserEntity } from './entities/user.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { LoginAttemptEntity } from './entities/login-attempt.entity';

import {
  AccountDeletedException,
  AccountInactiveException,
  AccountLockedException,
  EmailAlreadyExistsException,
  EmailNotVerifiedException,
  InvalidCredentialsException,
  TokenExpiredException,
  TokenRevokedException,
  UserNotFoundException,
} from './exceptions/auth.exceptions';

/** bcrypt salt rounds */
const SALT_ROUNDS = 12;
/** 연속 실패 허용 횟수 */
const MAX_FAILED_ATTEMPTS = 5;
/** 잠금 지속 시간 (분) */
const LOCK_DURATION_MINUTES = 15;
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

    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepo: Repository<RefreshTokenEntity>,

    @InjectRepository(LoginAttemptEntity)
    private readonly loginAttemptRepo: Repository<LoginAttemptEntity>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  // ──────────────────────────────────────────────
  // register
  // ──────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<UserProfileResult> {
    // 1. 이메일 중복 확인
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
      withDeleted: true,
    });
    if (existing) {
      throw new EmailAlreadyExistsException();
    }

    // 2. 패스워드 해시 (saltRounds=12)
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    // 3. 유저 생성
    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      nickname: dto.nickname ?? null,
      isActive: true,
      isVerified: false,
      lastLoginAt: null,
    });
    const saved = await this.userRepo.save(user);

    this.logger.log(`[AUTH] New user registered. userId=${saved.id}`);

    return this.toUserProfile(saved);
  }

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

    // 타이밍 어택 방지: 유저가 없어도 bcrypt 연산 수행
    const dummyHash =
      '$2b$12$invalidhashpaddinginvalidhashpaddinginvalidhash00000000';
    const passwordMatch = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? dummyHash,
    );

    if (!user) {
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

    // 4. 잠금 여부 확인 (최근 15분 이내 연속 실패 횟수)
    await this.checkLoginLock(user.id, dto.email);

    // 5. 패스워드 검증 실패
    if (!passwordMatch) {
      await this.recordLoginAttempt({
        userId: user.id,
        email: dto.email,
        ip,
        userAgent,
        isSuccess: false,
        failReason: 'INVALID_PASSWORD',
      });
      throw new InvalidCredentialsException();
    }

    // 6. 이메일 미인증
    if (!user.isVerified) {
      throw new EmailNotVerifiedException();
    }

    // 7. 토큰 발급 + 저장 (트랜잭션)
    const tokens = await this.generateTokenPair(user.id, ip, userAgent);

    // 8. 성공 기록 + last_login_at 업데이트
    await Promise.all([
      this.recordLoginAttempt({
        userId: user.id,
        email: dto.email,
        ip,
        userAgent,
        isSuccess: true,
        failReason: null,
      }),
      this.userRepo.update(user.id, { lastLoginAt: new Date() }),
    ]);

    return tokens;
  }

  // ──────────────────────────────────────────────
  // refresh (RT rotation)
  // ──────────────────────────────────────────────

  async refresh(
    dto: RefreshTokenDto,
    ip: string,
    userAgent: string,
  ): Promise<AuthTokensResult> {
    // 1. refresh_tokens 테이블에서 token 조회
    const existingToken = await this.refreshTokenRepo.findOne({
      where: { token: dto.refreshToken },
      relations: ['user'],
    });

    if (!existingToken) {
      throw new InvalidCredentialsException();
    }

    // 2. 이미 revoked된 토큰
    if (existingToken.revokedAt !== null) {
      // 재사용 공격 감지 시 전체 세션 폐기
      this.logger.warn(
        `[SECURITY] RT reuse detected. userId=${existingToken.userId} tokenId=${existingToken.id}`,
      );
      await this.logoutAll(existingToken.userId);
      throw new TokenRevokedException();
    }

    // 3. 만료된 토큰
    if (existingToken.expiresAt < new Date()) {
      throw new TokenExpiredException();
    }

    // 4. 유저 유효성 재확인
    const user = await this.userRepo.findOne({
      where: {
        id: existingToken.userId,
        isActive: true,
        deletedAt: IsNull(),
      },
    });

    if (!user) {
      throw new InvalidCredentialsException();
    }

    if (!user.isVerified) {
      throw new EmailNotVerifiedException();
    }

    // 5. 구 RT 폐기 + 새 토큰 발급 (트랜잭션)
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 구 RT revoked 처리
      await queryRunner.manager.update(
        RefreshTokenEntity,
        { id: existingToken.id },
        { revokedAt: new Date() },
      );

      // 새 RT 생성
      const tokens = this.issueTokens(user.id, user.email);
      const expiresAt = new Date(
        Date.now() + RT_TTL_SECONDS * 1000,
      );
      const newToken = queryRunner.manager.create(RefreshTokenEntity, {
        userId: user.id,
        token: tokens.refreshToken,
        deviceInfo: userAgent ?? null,
        ipAddress: ip ?? null,
        expiresAt,
        revokedAt: null,
      });
      await queryRunner.manager.save(RefreshTokenEntity, newToken);

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
    const existingToken = await this.refreshTokenRepo.findOne({
      where: { token: dto.refreshToken, userId },
    });

    if (!existingToken || existingToken.revokedAt !== null) {
      // 이미 폐기됐거나 없으면 멱등성 보장 — no-op
      return;
    }

    await this.refreshTokenRepo.update(
      { id: existingToken.id },
      { revokedAt: new Date() },
    );

    this.logger.log(`[AUTH] Single session logout. userId=${userId}`);
  }

  // ──────────────────────────────────────────────
  // logoutAll (전체 세션)
  // ──────────────────────────────────────────────

  async logoutAll(userId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 유효한(미폐기 + 미만료) RT 전체 revoked 처리
      await queryRunner.manager.update(
        RefreshTokenEntity,
        {
          userId,
          revokedAt: IsNull(),
        },
        { revokedAt: new Date() },
      );

      await queryRunner.commitTransaction();
      this.logger.log(`[AUTH] All sessions revoked. userId=${userId}`);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
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

    return this.toUserProfile(user);
  }

  // ──────────────────────────────────────────────
  // Public helpers (인터페이스 명세용)
  // ──────────────────────────────────────────────

  /**
   * 로그인 시도를 login_attempts 테이블에 기록한다.
   */
  async recordLoginAttempt(params: {
    userId: string | null;
    email: string;
    ip: string;
    userAgent: string;
    isSuccess: boolean;
    failReason: string | null;
  }): Promise<void> {
    const attempt = this.loginAttemptRepo.create({
      userId: params.userId,
      email: params.email,
      ipAddress: params.ip,
      userAgent: params.userAgent,
      isSuccess: params.isSuccess,
      failReason: params.failReason,
      attemptedAt: new Date(),
    });
    await this.loginAttemptRepo.save(attempt);
  }

  /**
   * 최근 LOCK_DURATION_MINUTES 이내 연속 실패 횟수가
   * MAX_FAILED_ATTEMPTS 이상이면 AccountLockedException을 던진다.
   */
  async checkLoginLock(userId: string, email: string): Promise<void> {
    const lockWindowStart = new Date(
      Date.now() - LOCK_DURATION_MINUTES * 60 * 1000,
    );

    const failCount = await this.loginAttemptRepo.count({
      where: {
        userId,
        isSuccess: false,
        attemptedAt: MoreThan(lockWindowStart),
      },
    });

    if (failCount >= MAX_FAILED_ATTEMPTS) {
      // 마지막 실패 시각 기준으로 잠금 해제 시각 계산
      const lastFail = await this.loginAttemptRepo.findOne({
        where: { userId, isSuccess: false },
        order: { attemptedAt: 'DESC' },
      });

      const lockedUntil = lastFail
        ? new Date(
            lastFail.attemptedAt.getTime() + LOCK_DURATION_MINUTES * 60 * 1000,
          )
        : new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);

      this.logger.warn(
        `[SECURITY] Account locked. userId=${userId} email=${email} until=${lockedUntil.toISOString()}`,
      );
      throw new AccountLockedException(lockedUntil);
    }
  }

  /**
   * AT + RT 쌍 발급 후 refresh_tokens 테이블에 저장.
   */
  async generateTokenPair(
    userId: string,
    ip: string,
    userAgent: string,
  ): Promise<AuthTokensResult> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UserNotFoundException(userId);
    }

    const tokens = this.issueTokens(userId, user.email);
    const expiresAt = new Date(Date.now() + RT_TTL_SECONDS * 1000);

    const rtEntity = this.refreshTokenRepo.create({
      userId,
      token: tokens.refreshToken,
      deviceInfo: userAgent ?? null,
      ipAddress: ip ?? null,
      expiresAt,
      revokedAt: null,
    });
    await this.refreshTokenRepo.save(rtEntity);

    return tokens;
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * JWT AT + RT 서명 발급 (DB 저장 없음).
   */
  private issueTokens(userId: string, email: string): AuthTokensResult {
    const now = Math.floor(Date.now() / 1000);

    const accessPayload: Omit<JwtAccessPayload, 'iat' | 'exp'> = {
      sub: userId,
      email,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: AT_TTL_SECONDS,
    });

    const refreshToken = this.jwtService.sign(
      { sub: userId, type: 'refresh' },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: RT_TTL_SECONDS,
      },
    );

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: now + AT_TTL_SECONDS,
      refreshTokenExpiresAt: now + RT_TTL_SECONDS,
    };
  }

  private toUserProfile(user: UserEntity): UserProfileResult {
    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
