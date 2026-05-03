import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AUTH_SERVICE } from './auth.service.interface';
import { JwtStrategy } from './jwt.strategy';

import { UserEntity } from './entities/user.entity';
import { LoginAttemptEntity } from './entities/login-attempt.entity';
import { RefreshTokenBlacklistEntity } from './entities/refresh-token-blacklist.entity';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // secretOrPrivateKey는 JwtStrategy에서 ConfigService로 주입하므로
    // 여기서는 기본 옵션만 등록한다.
    JwtModule.register({}),
    TypeOrmModule.forFeature([
      UserEntity,
      LoginAttemptEntity,
      RefreshTokenBlacklistEntity,
    ]),
  ],
  providers: [
    {
      provide: AUTH_SERVICE,
      useClass: AuthService,
    },
    JwtStrategy,
  ],
  exports: [AUTH_SERVICE],
})
export class AuthModule {}
