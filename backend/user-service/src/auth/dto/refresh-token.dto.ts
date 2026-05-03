import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @IsJWT({ message: '올바른 JWT 형식의 Refresh Token을 입력해주세요.' })
  refreshToken!: string;
}
