import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'woody@rorr.club' })
  @IsEmail({}, { message: '올바른 이메일 형식을 입력해주세요.' })
  email!: string;

  @ApiProperty({ example: 'Password1!' })
  @IsString()
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다.' })
  @MaxLength(128, { message: '비밀번호는 최대 128자 이하여야 합니다.' })
  password!: string;
}
