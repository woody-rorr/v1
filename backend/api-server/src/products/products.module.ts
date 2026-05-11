import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductOwnerGuard } from './guards/product-owner.guard';

// TODO: TypeORM 엔티티 구현 후 아래 주석을 해제하세요.
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { Product } from './entities/product.entity';
// import { ProductImage } from './entities/product-image.entity';

@Module({
  // imports: [TypeOrmModule.forFeature([Product, ProductImage])],
  controllers: [ProductsController],
  providers: [ProductsService, ProductOwnerGuard],
  exports: [ProductsService],
})
export class ProductsModule {}
