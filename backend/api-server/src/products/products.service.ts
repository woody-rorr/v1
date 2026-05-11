import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';

// 비즈니스 로직 에이전트에서 구현할 인터페이스 기반 스텁
// 실제 TypeORM Repository 주입은 products.module.ts에서 처리

export interface ProductRaw {
  id: number;
  sellerId: number;
  categoryId: number;
  name: string;
  description: string | null;
  price: number;
  stockQuantity: number;
  status: 'ACTIVE' | 'SOLD_OUT' | 'DELETED';
  thumbnailUrl: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductImageRaw {
  id: number;
  productId: number;
  imageUrl: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: Date;
}

@Injectable()
export class ProductsService {
  /**
   * 상품 원시 데이터 조회 (Guard 전용)
   * TODO: 비즈니스 로직 에이전트에서 TypeORM Repository로 구현
   */
  async findRawById(id: number): Promise<ProductRaw | null> {
    throw new Error(`findRawById(${id}) — 비즈니스 로직 에이전트에서 구현 필요`);
  }

  /**
   * 상품 생성 (POST /api/v1/products)
   */
  async create(dto: CreateProductDto, sellerId: number): Promise<unknown> {
    throw new Error('ProductsService.create — 비즈니스 로직 에이전트에서 구현 필요');
  }

  /**
   * 상품 목록 조회 (GET /api/v1/products)
   */
  async findAll(query: {
    page?: number;
    limit?: number;
    categoryId?: number;
    status?: string;
    search?: string;
  }): Promise<unknown> {
    throw new Error('ProductsService.findAll — 비즈니스 로직 에이전트에서 구현 필요');
  }

  /**
   * 판매자 상품 목록 조회 (GET /api/v1/products/seller/my-products)
   */
  async findBySellerId(
    sellerId: number,
    query: { page?: number; limit?: number },
  ): Promise<unknown> {
    throw new Error('ProductsService.findBySellerId — 비즈니스 로직 에이전트에서 구현 필요');
  }

  /**
   * 상품 상세 조회 (GET /api/v1/products/:id)
   */
  async findById(id: number): Promise<unknown> {
    throw new Error('ProductsService.findById — 비즈니스 로직 에이전트에서 구현 필요');
  }

  /**
   * 상품 수정 (PATCH /api/v1/products/:id)
   */
  async update(
    id: number,
    dto: UpdateProductDto,
    userId: number,
    userRole: string,
  ): Promise<unknown> {
    throw new Error('ProductsService.update — 비즈니스 로직 에이전트에서 구현 필요');
  }

  /**
   * 상품 삭제 - 소프트 삭제 (DELETE /api/v1/products/:id)
   */
  async delete(id: number, userId: number, userRole: string): Promise<void> {
    throw new Error('ProductsService.delete — 비즈니스 로직 에이전트에서 구현 필요');
  }

  /**
   * 상품 이미지 추가 (POST /api/v1/products/:id/images)
   */
  async addImage(
    productId: number,
    dto: CreateProductImageDto,
    userId: number,
    userRole: string,
  ): Promise<unknown> {
    throw new Error('ProductsService.addImage — 비즈니스 로직 에이전트에서 구현 필요');
  }

  /**
   * 상품 이미지 삭제 (DELETE /api/v1/products/:id/images/:imageId)
   */
  async deleteImage(
    productId: number,
    imageId: number,
    userId: number,
    userRole: string,
  ): Promise<void> {
    throw new Error('ProductsService.deleteImage — 비즈니스 로직 에이전트에서 구현 필요');
  }
}
