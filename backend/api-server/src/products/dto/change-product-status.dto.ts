import { IsEnum } from 'class-validator';
import { ProductStatus } from '../entities/product.entity';

export class ChangeProductStatusDto {
  @IsEnum(ProductStatus, {
    message: `status는 ${Object.values(ProductStatus).join(', ')} 중 하나여야 합니다`,
  })
  status: ProductStatus;
}
