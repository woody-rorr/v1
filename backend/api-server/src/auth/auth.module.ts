import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_SERVICE } from './auth.service.interface';
import { JwtStrategy } from './jwt.strategy';

import { UserEntity } from './entities/user.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { LoginAttemptEntity } from './entities/login-attempt.entity';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // secretOrPrivateKey는 JwtStrategy 및 AuthService에서
    // ConfigService를 통해 직접 주입하므로 여기서는 빈 설정으로 등록한다.
    JwtModule.register({}),
    TypeOrmModule.forFeature([
      UserEntity,
      RefreshTokenEntity,
      LoginAttemptEntity,
    ]),
  ],
  controllers: [AuthController],
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
