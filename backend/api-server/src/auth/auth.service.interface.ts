/**
 * auth.service.interface.ts
 *
 * AuthService 인터페이스 — 테스트 용이성을 위해 구현체와 분리.
 * 모든 공개 메서드는 이 계약(contract)을 따른다.
 *
 * 처리 흐름 요약:
 *   register      → 중복 이메일 확인 → 패스워드 해시 → 유저 생성
 *   login         → 자격증명 검증 → 잠금 확인 → 토큰 발급 → 시도 기록
 *   refresh       → RT 유효성 검증 → revoked 확인 → rotation → 구 RT 폐기
 *   logout        → RT를 revoked 처리
 *   logoutAll     → 해당 유저 RT 전체 revoked 처리
 *   getMe         → AT 페이로드에서 유저 조회
 */

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthTokensResult } from './types/auth-tokens.result';
import { UserProfileResult } from './types/user-profile.result';

export const AUTH_SERVICE = Symbol('AUTH_SERVICE');

export interface IAuthService {
  /**
   * 신규 회원가입.
   *
   * 처리 순서:
   *  1. email 중복 확인 → ConflictException
   *  2. bcrypt(saltRounds=12)로 패스워드 해시
   *  3. users 테이블에 신규 레코드 생성 (is_active=true, is_verified=false)
   *  4. UserProfileResult 반환
   */
  register(dto: RegisterDto): Promise<UserProfileResult>;

  /**
   * 이메일/패스워드로 로그인.
   *
   * 처리 순서:
   *  1. email로 users 조회 → 없으면 UnauthorizedException (타이밍 어택 방지: 항상 bcrypt 수행)
   *  2. deleted_at IS NOT NULL → GoneException
   *  3. is_active = false → ForbiddenException
   *  4. login_attempts 조회 → 최근 15분 이내 5회 이상 실패 → TooManyRequestsException
   *  5. bcrypt.compare(password, password_hash) → 불일치 시 실패 기록 후 UnauthorizedException
   *  6. is_verified = false → ForbiddenException ('이메일 미인증')
   *  7. Access Token(15분) + Refresh Token(7일) 발급 → refresh_tokens 저장
   *  8. 성공 login_attempt 기록
   *  9. last_login_at 업데이트
   * 10. AuthTokensResult 반환
   */
  login(dto: LoginDto, ip: string, userAgent: string): Promise<AuthTokensResult>;

  /**
   * Refresh Token으로 Access Token + 새 Refresh Token 발급 (rotation).
   *
   * 처리 순서:
   *  1. refresh_tokens 테이블에서 token으로 조회 → 없으면 UnauthorizedException
   *  2. revoked_at IS NOT NULL → TokenRevokedException
   *  3. expires_at < NOW() → TokenExpiredException
   *  4. payload.sub(user_id)로 users 조회 → 유저 유효성 재확인 (active, verified, not deleted)
   *  5. 구 RT revoked_at = NOW() 업데이트 (트랜잭션)
   *  6. 새 AT(15분) + 새 RT(7일) 발급 → refresh_tokens 저장
   *  7. AuthTokensResult 반환
   */
  refresh(dto: RefreshTokenDto, ip: string, userAgent: string): Promise<AuthTokensResult>;

  /**
   * 단일 세션 로그아웃.
   *
   * 처리 순서:
   *  1. refresh_tokens 테이블에서 token으로 조회
   *  2. userId 소유권 확인
   *  3. revoked_at = NOW() 업데이트 (멱등성 보장: 이미 revoked면 no-op)
   */
  logout(dto: LogoutDto, userId: string): Promise<void>;

  /**
   * 전체 세션 로그아웃 (모든 기기).
   *
   * 처리 순서:
   *  1. userId로 유효한(expires_at > NOW(), revoked_at IS NULL) RT 전체 조회
   *  2. 일괄 revoked_at = NOW() 업데이트 (QueryRunner 트랜잭션)
   */
  logoutAll(userId: string): Promise<void>;

  /**
   * 현재 인증된 유저 프로필 반환.
   *
   * 처리 순서:
   *  1. userId로 users 조회 → 없으면 NotFoundException
   *  2. password_hash, deleted_at 제외하고 UserProfileResult 반환
   */
  getMe(userId: string): Promise<UserProfileResult>;
}
