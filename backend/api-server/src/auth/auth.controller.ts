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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<UserProfileResult> {
    return this.authService.register(dto);
  }

  @ApiOperation({ summary: '로그인' })
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

  @ApiOperation({ summary: 'Access Token 재발급' })
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
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.authService.logout(dto, req.user.userId);
  }

  @ApiOperation({ summary: '내 프로필 조회' })
  @ApiBearerAuth()
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
