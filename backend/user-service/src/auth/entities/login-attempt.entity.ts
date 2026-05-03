import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('login_attempts')
export class LoginAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'ip_address', type: 'inet' })
  ipAddress!: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'boolean' })
  success!: boolean;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount!: number;

  @CreateDateColumn({ name: 'attempted_at' })
  attemptedAt!: Date;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;
}
