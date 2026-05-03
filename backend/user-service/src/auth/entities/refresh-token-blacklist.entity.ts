import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('refresh_token_blacklist')
export class RefreshTokenBlacklistEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  jti!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'revoked_at' })
  revokedAt!: Date;

  /**
   * 폐기 사유
   * - 'rotated'    : Refresh Token rotation
   * - 'logout'     : 단일 세션 로그아웃
   * - 'logout_all' : 전체 세션 로그아웃
   * - 'compromised': 재사용 공격 감지
   */
  @Column({ type: 'varchar', length: 20 })
  reason!: 'rotated' | 'logout' | 'logout_all' | 'compromised';
}
