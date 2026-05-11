import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { AUTH_SERVICE, IAuthService } from './auth.service.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthTokensResult } from './types/auth-tokens.result';
import { UserProfileResult } from './types/user-profile.result';

interface JwtUser {
  userId: string;
  email: string;
}

type AuthenticatedRequest = Request & { user: JwtUser };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_SERVICE)
    private readonly authService: IAuthService,
  ) {}

  @ApiOperation({ summary: '회원가입' })
  @ApiResponse({ status: 201, description: '회원가입 성공' })
  @ApiResponse({ status: 409, description: '이미 사용 중인 이메일' })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<UserProfileResult> {
    return this.authService.register(dto);
  }

  @ApiOperation({ summary: '로그인' })
  @ApiResponse({
    status: 200,
    description: '로그인 성공 — accessToken, refreshToken, user(id, email) 반환',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        accessTokenExpiresAt: 1715000100,
        refreshTokenExpiresAt: 1715604900,
        user: {
          id: 'uuid-v4-string',
          email: 'woody@rorr.club',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: '잘못된 이메일 또는 비밀번호 — UnauthorizedException',
    schema: {
      example: {
        statusCode: 401,
        message: '이메일 또는 패스워드가 올바르지 않습니다.',
        error: 'Unauthorized',
      },
    },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthTokensResult> {
    const ip = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? '';
    return this.authService.login(dto, ip, userAgent);
  }

  @ApiOperation({ summary: '토큰 갱신' })
  @ApiResponse({ status: 200, description: '새 토큰 쌍 반환' })
  @ApiResponse({ status: 401, description: '유효하지 않은 Refresh Token' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<AuthTokensResult> {
    const ip = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? '';
    return this.authService.refresh(dto, ip, userAgent);
  }

  @ApiOperation({ summary: '로그아웃' })
  @ApiBearerAuth()
  @ApiResponse({ status: 204, description: '로그아웃 성공' })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.authService.logout(dto, req.user.userId);
  }

  @ApiOperation({ summary: '내 정보 조회' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '유저 정보 반환' })
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async getMe(@Req() req: AuthenticatedRequest): Promise<UserProfileResult> {
    return this.authService.getMe(req.user.userId);
  }

  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '';
    }
    return req.socket.remoteAddress ?? '';
  }
}
