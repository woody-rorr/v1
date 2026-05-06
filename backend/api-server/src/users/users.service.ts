import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserEntity } from './entities/user.entity';
import {
  InvalidCredentialsException,
  UsernameAlreadyExistsException,
} from './exceptions/users.exceptions';
import { UserResult } from './types/user-result.type';
import { IUsersService } from './users.service.interface';

@Injectable()
export class UsersService implements IUsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async register(dto: RegisterDto): Promise<UserResult> {
    const existing = await this.userRepository.findOne({
      where: { username: dto.username },
    });

    if (existing !== null) {
      throw new UsernameAlreadyExistsException();
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      username: dto.username,
      passwordHash,
    });

    const saved = await this.userRepository.save(user);

    this.logger.log(`User registered: ${saved.id}`);

    return this.toResult(saved);
  }

  async login(dto: LoginDto): Promise<UserResult> {
    const user = await this.userRepository.findOne({
      where: { username: dto.username },
    });

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    let isMatch: boolean;
    try {
      isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    } catch (err) {
      this.logger.error(`bcrypt.compare failed for user ${user.id}`, err);
      throw new InvalidCredentialsException();
    }

    if (!isMatch) {
      throw new InvalidCredentialsException();
    }

    this.logger.log(`User logged in: ${user.id}`);

    return this.toResult(user);
  }

  private toResult(user: UserEntity): UserResult {
    return {
      id: user.id,
      username: user.username,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}
