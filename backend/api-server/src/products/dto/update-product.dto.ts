import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateProductDto, ProductStatus } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiProperty({
    description: '상품 상태 (ACTIVE, SOLD_OUT, DELETED)',
    enum: ['ACTIVE', 'SOLD_OUT', 'DELETED'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'SOLD_OUT', 'DELETED'], {
    message: 'status는 ACTIVE, SOLD_OUT, DELETED 중 하나여야 합니다.',
  })
  override status?: 'ACTIVE' | 'SOLD_OUT' | 'DELETED';
}
