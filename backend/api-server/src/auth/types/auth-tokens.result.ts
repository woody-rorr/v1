export interface AuthTokensResult {
  accessToken: string;
  refreshToken: string;
  /** Access Token 만료 시각 (Unix epoch, seconds) */
  accessTokenExpiresAt: number;
  /** Refresh Token 만료 시각 (Unix epoch, seconds) */
  refreshTokenExpiresAt: number;
  /** 로그인한 유저의 기본 정보 */
  user: {
    id: string;
    email: string;
  };
}
