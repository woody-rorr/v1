import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';

export class ProductNotFoundException extends NotFoundException {
  constructor(productId: bigint | number) {
    super(`상품(ID: ${productId})을 찾을 수 없습니다`);
  }
}

export class ProductForbiddenException extends ForbiddenException {
  constructor() {
    super('해당 상품에 대한 접근 권한이 없습니다');
  }
}

export class CategoryNotFoundException extends NotFoundException {
  constructor(categoryId: bigint | number) {
    super(`카테고리(ID: ${categoryId})를 찾을 수 없거나 비활성 상태입니다`);
  }
}

export class CategoryNotLeafException extends BadRequestException {
  constructor(categoryId: bigint | number) {
    super(`카테고리(ID: ${categoryId})는 리프 카테고리가 아닙니다. 자식 카테고리가 없는 카테고리만 선택 가능합니다`);
  }
}

export class DuplicateSortOrderException extends BadRequestException {
  constructor(sortOrder: number) {
    super(`이미지 sort_order(${sortOrder})가 중복되었습니다`);
  }
}

export class InvalidPrimaryImageException extends BadRequestException {
  constructor(count: number) {
    super(`대표 이미지(isPrimary)는 정확히 1개여야 합니다. 현재: ${count}개`);
  }
}

export class InvalidStatusTransitionException extends BadRequestException {
  constructor(from: string, to: string) {
    super(`상태 전이 불가: ${from} → ${to}`);
  }
}

export class InsufficientStockForActivationException extends UnprocessableEntityException {
  constructor() {
    super('ACTIVE 상태로 전환하려면 재고(stock_quantity)가 1 이상이어야 합니다');
  }
}
