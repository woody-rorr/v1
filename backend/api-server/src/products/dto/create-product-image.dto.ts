import { IsString, IsInt, IsBoolean, IsOptional, IsUrl, Min } from 'class-validator';

export class CreateProductImageDto {
  @IsUrl({}, { message: '유효한 이미지 URL이어야 합니다' })
  imageUrl: string;

  @IsInt({ message: 'sort_order는 정수여야 합니다' })
  @Min(0, { message: 'sort_order는 0 이상이어야 합니다' })
  sortOrder: number;

  @IsBoolean({ message: 'isPrimary는 boolean이어야 합니다' })
  @IsOptional()
  isPrimary?: boolean;
}
