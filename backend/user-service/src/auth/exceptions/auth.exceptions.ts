import {
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * 이메일 또는 패스워드 불일치.
 * 타이밍 어택 방지를 위해 구체적인 실패 사유를 노출하지 않는다.
 */
export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('이메일 또는 패스워드가 올바르지 않습니다.');
  }
}

/**
 * 5회 연속 로그인 실패로 계정이 15분 잠금된 경우.
 */
export class AccountLockedException extends HttpException {
  constructor(lockedUntil: Date) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: '로그인 시도 횟수 초과로 계정이 잠겼습니다.',
        lockedUntil: lockedUntil.toISOString(),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * is_active = false 인 계정.
 */
export class AccountInactiveException extends ForbiddenException {
  constructor() {
    super('비활성화된 계정입니다.');
  }
}

/**
 * soft-delete된 계정.
 */
export class AccountDeletedException extends GoneException {
  constructor() {
    super('삭제된 계정입니다.');
  }
}

/**
 * 이메일 인증이 완료되지 않은 계정.
 */
export class EmailNotVerifiedException extends ForbiddenException {
  constructor() {
    super('이메일 인증이 완료되지 않았습니다.');
  }
}

/**
 * 이미 사용된 Refresh Token 재사용 시도.
 * 감지 즉시 해당 유저의 모든 세션이 폐기된다.
 */
export class TokenReusedException extends UnauthorizedException {
  constructor() {
    super('재사용된 Refresh Token이 감지되어 모든 세션이 폐기되었습니다.');
  }
}

/**
 * Access Token 엔드포인트에 Refresh Token을 사용하는 등 타입 불일치.
 */
export class InvalidTokenTypeException extends UnauthorizedException {
  constructor() {
    super('올바르지 않은 토큰 타입입니다.');
  }
}

/**
 * Refresh Token이 이미 폐기(revoked)된 경우.
 */
export class TokenRevokedException extends UnauthorizedException {
  constructor() {
    super('폐기된 Refresh Token입니다. 다시 로그인해주세요.');
  }
}

/**
 * Refresh Token이 만료된 경우.
 */
export class TokenExpiredException extends UnauthorizedException {
  constructor() {
    super('Refresh Token이 만료되었습니다. 다시 로그인해주세요.');
  }
}

/**
 * 요청한 유저 ID를 찾을 수 없는 경우.
 */
export class UserNotFoundException extends NotFoundException {
  constructor(userId: string) {
    super(`유저를 찾을 수 없습니다: ${userId}`);
  }
}

/**
 * 이미 가입된 이메일로 회원가입 시도.
 */
export class EmailAlreadyExistsException extends ConflictException {
  constructor() {
    super('이미 사용 중인 이메일 주소입니다.');
  }
}
