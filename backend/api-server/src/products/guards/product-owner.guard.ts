import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductsService } from '../products.service';

@Injectable()
export class ProductOwnerGuard implements CanActivate {
  constructor(private readonly productsService: ProductsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user: { id: number; role: string };
      params: { id: string };
    }>();

    const user = request.user;
    const productId = Number(request.params.id);

    if (!user) {
      throw new ForbiddenException('사용자 정보를 찾을 수 없습니다.');
    }

    // ADMIN은 모든 상품 수정 가능
    if (user.role === 'ADMIN') {
      return true;
    }

    const product = await this.productsService.findRawById(productId);

    if (!product) {
      throw new NotFoundException('상품을 찾을 수 없습니다.');
    }

    if (product.sellerId !== user.id) {
      throw new ForbiddenException('본인의 상품만 수정/삭제할 수 있습니다.');
    }

    return true;
  }
}
