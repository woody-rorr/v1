import { IsJWT } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh Token (JWT)' })
  @IsJWT({ message: '올바른 JWT 형식의 Refresh Token을 입력해주세요.' })
  refreshToken!: string;
}
