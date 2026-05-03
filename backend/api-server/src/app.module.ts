import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { Controller, Get } from '@nestjs/common';

@Controller()
class HealthController {
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
    }),
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
