import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

/**
 * login_attempts 테이블
 * 로그인 시도 이력을 누적 기록한다.
 * 5회 연속 실패 시 15분 잠금 여부를 판단하는 데 사용된다.
 */
@Entity('login_attempts')
export class LoginAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 유저가 특정되지 않은 경우(존재하지 않는 이메일 등) null 허용 */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => UserEntity, (user) => user.loginAttempts, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity | null;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'ip_address', type: 'inet' })
  ipAddress!: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'is_success', type: 'boolean' })
  isSuccess!: boolean;

  @Column({ name: 'fail_reason', type: 'varchar', length: 100, nullable: true })
  failReason!: string | null;

  @Column({
    name: 'attempted_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  attemptedAt!: Date;
}
