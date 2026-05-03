export interface AuthTokensResult {
  accessToken: string;
  refreshToken: string;
  /** Access Token 만료 시각 (Unix epoch, seconds) */
  accessTokenExpiresAt: number;
  /** Refresh Token 만료 시각 (Unix epoch, seconds) */
  refreshTokenExpiresAt: number;
}
