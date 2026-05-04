import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'woody@rorr.club' })
  @IsEmail({}, { message: '올바른 이메일 형식을 입력해주세요.' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'Password1!' })
  @IsString()
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다.' })
  @MaxLength(128, { message: '비밀번호는 최대 128자 이하여야 합니다.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]/, {
    message: '비밀번호는 영문, 숫자, 특수문자를 각각 최소 1자 포함해야 합니다.',
  })
  password!: string;

  @ApiPropertyOptional({ example: 'woody' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: '닉네임은 최소 2자 이상이어야 합니다.' })
  @MaxLength(100, { message: '닉네임은 최대 100자 이하여야 합니다.' })
  nickname?: string;
}
