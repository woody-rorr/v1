/**
 * auth.service.interface.ts
 *
 * AuthService 인터페이스 — 테스트 용이성을 위해 구현체와 분리.
 * 모든 공개 메서드는 이 계약(contract)을 따른다.
 *
 * 처리 흐름 요약:
 *   login         → 자격증명 검증 → 잠금 확인 → 토큰 발급 → 시도 기록
 *   refresh       → RT 유효성 검증 → 블랙리스트 확인 → rotation → 구 RT 폐기
 *   logout        → AT 검증 → RT 블랙리스트 등록
 *   logoutAll     → AT 검증 → 해당 유저 RT 전체 폐기
 *   getMe         → AT 페이로드에서 유저 조회
 */

import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthTokensResult } from './types/auth-tokens.result';
import { UserProfileResult } from './types/user-profile.result';

export const AUTH_SERVICE = Symbol('AUTH_SERVICE');

export interface IAuthService {
  /**
   * 이메일/패스워드로 로그인.
   *
   * 처리 순서:
   *  1. email로 users 조회 → 없으면 UnauthorizedException (타이밍 어택 방지: 항상 bcrypt 수행)
   *  2. deleted_at IS NOT NULL → GoneException
   *  3. is_active = false → ForbiddenException
   *  4. login_attempts 조회 → locked_until > NOW() → TooManyRequestsException
   *  5. bcrypt.compare(password, password_hash) → 불일치 시 실패 기록 후 UnauthorizedException
   *     - failed_count >= 5 → locked_until = NOW() + 30분 설정
   *  6. is_verified = false → ForbiddenException ('이메일 미인증')
   *  7. Access Token(15분) + Refresh Token(7일) 발급
   *  8. 성공 login_attempt 기록 (failed_count 리셋)
   *  9. AuthTokensResult 반환
   */
  login(dto: LoginDto, ip: string, userAgent: string): Promise<AuthTokensResult>;

  /**
   * Refresh Token으로 Access Token + 새 Refresh Token 발급 (rotation).
   *
   * 처리 순서:
   *  1. RT JWT 서명/만료 검증 → 실패 시 UnauthorizedException
   *  2. payload.jti로 refresh_token_blacklist 조회
   *     - 존재 → 재사용 공격 감지 → 해당 user_id의 모든 RT 폐기 → UnauthorizedException
   *  3. payload.sub(user_id)로 users 조회 → 유저 유효성 재확인 (active, verified)
   *  4. 구 RT를 blacklist에 등록 (reason: 'rotated')
   *  5. 새 AT(15분) + 새 RT(7일, 새 jti) 발급
   *  6. AuthTokensResult 반환
   */
  refresh(dto: RefreshTokenDto): Promise<AuthTokensResult>;

  /**
   * 단일 세션 로그아웃.
   *
   * 처리 순서:
   *  1. dto.refreshToken JWT 서명/만료 검증
   *  2. payload.jti가 이미 blacklist에 있으면 no-op (멱등성 보장)
   *  3. refresh_token_blacklist에 등록 (reason: 'logout')
   */
  logout(dto: LogoutDto, userId: string): Promise<void>;

  /**
   * 전체 세션 로그아웃 (모든 기기).
   *
   * 처리 순서:
   *  1. userId로 유효한(expires_at > NOW(), revoked_at IS NULL) RT 전체 조회
   *  2. 일괄 revoked_at = NOW(), reason = 'logout_all' 업데이트
   *     → TypeORM QueryRunner 트랜잭션 처리
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
