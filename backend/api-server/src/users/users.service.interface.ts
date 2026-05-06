import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResult } from './types/user-result.type';

export interface IUsersService {
  register(dto: RegisterDto): Promise<UserResult>;
  login(dto: LoginDto): Promise<UserResult>;
}

export const USERS_SERVICE = Symbol('IUsersService');
