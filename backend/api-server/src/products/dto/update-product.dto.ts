import {
  IsString,
  IsInt,
  IsNumber,
  IsOptional,
  IsArray,
  IsUrl,
  ValidateNested,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProductImageDto } from './create-product-image.dto';

export class UpdateProductDto {
  @IsString({ message: '상품명은 문자열이어야 합니다' })
  @MaxLength(200, { message: '상품명은 200자 이하여야 합니다' })
  @IsOptional()
  name?: string;

  @IsString({ message: '설명은 문자열이어야 합니다' })
  @IsOptional()
  description?: string;

  @IsInt({ message: 'categoryId는 정수여야 합니다' })
  @Min(1)
  @IsOptional()
  categoryId?: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'price는 소수점 2자리까지 허용됩니다' })
  @Min(0)
  @Max(9999999999.99)
  @IsOptional()
  price?: number;

  @IsInt({ message: 'stockQuantity는 정수여야 합니다' })
  @Min(0)
  @IsOptional()
  stockQuantity?: number;

  @IsUrl({}, { message: '유효한 썸네일 URL이어야 합니다' })
  @IsOptional()
  thumbnailUrl?: string;

  @IsArray({ message: 'images는 배열이어야 합니다' })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  images?: CreateProductImageDto[];
}
