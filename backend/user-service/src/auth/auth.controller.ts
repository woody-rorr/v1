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
import { Request } from 'express';

import { AUTH_SERVICE, IAuthService } from './auth.service.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthTokensResult } from './types/auth-tokens.result';
import { UserProfileResult } from './types/user-profile.result';

/** req.user에 주입되는 JWT 페이로드 */
interface JwtUser {
  userId: string;
  email: string;
}

/** Express Request + JWT user 확장 타입 */
type AuthenticatedRequest = Request & { user: JwtUser };

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_SERVICE)
    private readonly authService: IAuthService,
  ) {}

  /**
   * POST /auth/register
   * 공개 엔드포인트 — 신규 회원가입
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<UserProfileResult> {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/login
   * 공개 엔드포인트 — 이메일/패스워드 로그인
   */
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

  /**
   * POST /auth/refresh
   * Refresh Token으로 새 AT + RT 발급 (rotation)
   */
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

  /**
   * POST /auth/logout
   * Access Token 인증 필요 — 단일 세션 로그아웃
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.authService.logout(dto, req.user.userId);
  }

  /**
   * GET /auth/me
   * Access Token 인증 필요 — 현재 유저 프로필 조회
   */
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async getMe(@Req() req: AuthenticatedRequest): Promise<UserProfileResult> {
    return this.authService.getMe(req.user.userId);
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * X-Forwarded-For 헤더 또는 소켓 주소에서 클라이언트 IP를 추출한다.
   */
  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '';
    }
    return req.socket.remoteAddress ?? '';
  }
}
