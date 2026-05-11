import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProductImageDto } from './create-product-image.dto';

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  SOLD_OUT = 'SOLD_OUT',
}

export class CreateProductDto {
  @ApiProperty({
    description: '카테고리 ID',
    example: 1,
  })
  @IsNumber()
  categoryId!: number;

  @ApiProperty({
    description: '상품명 (2~200자)',
    example: '무선 블루투스 이어폰',
    minLength: 2,
    maxLength: 200,
  })
  @IsString()
  @MinLength(2, { message: '상품명은 최소 2자 이상이어야 합니다.' })
  @MaxLength(200, { message: '상품명은 최대 200자 이하여야 합니다.' })
  name!: string;

  @ApiProperty({
    description: '상품 설명 (최대 1000자)',
    example: '고음질 사운드와 편안한 착용감을 제공하는 무선 이어폰입니다.',
    maxLength: 1000,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: '상품 설명은 최대 1000자 이하여야 합니다.' })
  description?: string;

  @ApiProperty({
    description: '판매 가격 (0 이상)',
    example: 59900,
    minimum: 0,
  })
  @IsNumber()
  @Min(0, { message: '가격은 0 이상이어야 합니다.' })
  price!: number;

  @ApiProperty({
    description: '재고 수량 (0 이상)',
    example: 100,
    minimum: 0,
  })
  @IsNumber()
  @Min(0, { message: '재고 수량은 0 이상이어야 합니다.' })
  stockQuantity!: number;

  @ApiProperty({
    description: '상품 상태',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
    required: false,
  })
  @IsOptional()
  @IsEnum(ProductStatus, { message: 'status는 ACTIVE 또는 SOLD_OUT이어야 합니다.' })
  status?: ProductStatus = ProductStatus.ACTIVE;

  @ApiProperty({
    description: '썸네일 이미지 URL',
    example: 'https://example.com/thumbnail.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl({}, { message: '유효한 URL을 입력해주세요.' })
  thumbnailUrl?: string;

  @ApiProperty({
    description: '상품 이미지 목록',
    type: [CreateProductImageDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  images?: CreateProductImageDto[];
}
