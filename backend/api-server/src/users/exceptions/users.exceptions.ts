import { ConflictException, UnauthorizedException } from '@nestjs/common';

export class UsernameAlreadyExistsException extends ConflictException {
  constructor() {
    super('이미 사용 중인 사용자 이름입니다');
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('사용자 이름 또는 비밀번호가 올바르지 않습니다');
  }
}
