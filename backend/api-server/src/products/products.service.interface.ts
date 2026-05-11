import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ChangeProductStatusDto } from './dto/change-product-status.dto';
import { ProductEntity } from './entities/product.entity';

export interface ProductsPage {
  data: ProductEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface IProductsService {
  createProduct(sellerId: bigint, dto: CreateProductDto): Promise<ProductEntity>;
  updateProduct(sellerId: bigint, productId: bigint, dto: UpdateProductDto): Promise<ProductEntity>;
  deleteProduct(sellerId: bigint, productId: bigint): Promise<void>;
  getProductById(productId: bigint): Promise<ProductEntity>;
  getProductsBySeller(
    sellerId: bigint,
    page: number,
    limit: number,
    status?: string,
  ): Promise<ProductsPage>;
  changeProductStatus(
    sellerId: bigint,
    productId: bigint,
    dto: ChangeProductStatusDto,
  ): Promise<ProductEntity>;
}

export const PRODUCTS_SERVICE = Symbol('IProductsService');
