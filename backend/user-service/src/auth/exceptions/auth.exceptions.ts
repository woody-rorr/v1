import {
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  GoneException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('이메일 또는 패스워드가 올바르지 않습니다.');
  }
}

export class AccountLockedException extends HttpException {
  constructor(lockedUntil: Date) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: '로그인 시도 횟수 초과로 계정이 잠겼습니다.',
        lockedUntil: lockedUntil.toISOString(),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class AccountInactiveException extends ForbiddenException {
  constructor() {
    super('비활성화된 계정입니다.');
  }
}

export class AccountDeletedException extends GoneException {
  constructor() {
    super('삭제된 계정입니다.');
  }
}

export class EmailNotVerifiedException extends ForbiddenException {
  constructor() {
    super('이메일 인증이 완료되지 않았습니다.');
  }
}

export class TokenReusedException extends UnauthorizedException {
  constructor() {
    super('재사용된 Refresh Token이 감지되어 모든 세션이 폐기되었습니다.');
  }
}

export class InvalidTokenTypeException extends UnauthorizedException {
  constructor() {
    super('올바르지 않은 토큰 타입입니다.');
  }
}

export class UserNotFoundException extends NotFoundException {
  constructor(userId: string) {
    super(`유저를 찾을 수 없습니다: ${userId}`);
  }
}
