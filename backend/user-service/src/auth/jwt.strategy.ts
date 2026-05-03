import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { JwtAccessPayload } from './types/jwt-payload.type';
import { UserEntity } from './entities/user.entity';

/**
 * JWT Access Token 검증 전략.
 *
 * 처리 순서:
 *  1. Authorization: Bearer <token> 헤더에서 AT 추출
 *  2. JWT_ACCESS_SECRET으로 서명/만료 검증 (passport-jwt 자동 처리)
 *  3. validate(): payload.type === 'access' 타입 확인
 *  4. payload.sub로 유저 조회 — 삭제/비활성 계정이면 401
 *  5. req.user에 { userId, email } 주입
 *
 * Refresh Token은 별도 전략 없이 AuthService.refresh() 내부에서
 * refresh_tokens 테이블 조회로 직접 검증한다.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(
    payload: JwtAccessPayload,
  ): Promise<{ userId: string; email: string }> {
    // 1. 토큰 타입 검증 — RT를 AT 엔드포인트에 사용하는 것 방지
    if (payload.type !== 'access') {
      throw new UnauthorizedException('올바르지 않은 토큰 타입입니다.');
    }

    // 2. 유저 실시간 유효성 확인 (탈퇴/비활성화 즉시 반영)
    const user = await this.userRepo.findOne({
      where: {
        id: payload.sub,
        isActive: true,
        deletedAt: IsNull(),
      },
    });

    if (!user) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    // req.user에 주입될 객체
    return { userId: user.id, email: user.email };
  }
}
