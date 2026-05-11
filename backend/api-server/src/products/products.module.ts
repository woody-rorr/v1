import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductEntity } from './entities/product.entity';
import { ProductImageEntity } from './entities/product-image.entity';
import { CategoryEntity } from './entities/category.entity';
import { ProductsService } from './products.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductEntity, ProductImageEntity, CategoryEntity]),
  ],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
