/**
 * Access Token payload
 */
export interface JwtAccessPayload {
  /** user UUID */
  sub: string;
  email: string;
  /** 'access' 고정 — RT를 AT로 오용하는 것을 방지 */
  type: 'access';
  iat?: number;
  exp?: number;
}

/**
 * Refresh Token payload
 */
export interface JwtRefreshPayload {
  sub: string;
  /** JWT ID — blacklist 조회 키 */
  jti: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
}
