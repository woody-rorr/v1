import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ChangeProductStatusDto } from './dto/change-product-status.dto';
import { ProductEntity, ProductStatus } from './entities/product.entity';
import { ProductImageEntity } from './entities/product-image.entity';
import { CategoryEntity } from './entities/category.entity';
import { IProductsService, ProductsPage } from './products.service.interface';
import {
  ProductNotFoundException,
  ProductForbiddenException,
  CategoryNotFoundException,
  CategoryNotLeafException,
  DuplicateSortOrderException,
  InvalidPrimaryImageException,
  InvalidStatusTransitionException,
  InsufficientStockForActivationException,
} from './exceptions/products.exceptions';

/** 허용된 상태 전이 맵 */
const STATUS_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  [ProductStatus.ACTIVE]: [ProductStatus.SOLD_OUT, ProductStatus.DELETED],
  [ProductStatus.SOLD_OUT]: [ProductStatus.ACTIVE, ProductStatus.DELETED],
  [ProductStatus.DELETED]: [],
};

@Injectable()
export class ProductsService implements IProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(ProductImageEntity)
    private readonly imageRepo: Repository<ProductImageEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // createProduct
  // ---------------------------------------------------------------------------
  async createProduct(sellerId: bigint, dto: CreateProductDto): Promise<ProductEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1) 카테고리 존재 + 활성 검증
      const category = await queryRunner.manager.findOne(CategoryEntity, {
        where: { id: BigInt(dto.categoryId), isActive: true },
        relations: ['children'],
      });
      if (!category) {
        throw new CategoryNotFoundException(dto.categoryId);
      }

      // 2) 리프 카테고리 검증 (자식 없어야 함)
      if (category.children && category.children.length > 0) {
        throw new CategoryNotLeafException(dto.categoryId);
      }

      // 3) 이미지 검증
      if (dto.images && dto.images.length > 0) {
        this.validateImages(dto.images);
      }

      // 4) 상품 INSERT
      const product = queryRunner.manager.create(ProductEntity, {
        sellerId,
        categoryId: BigInt(dto.categoryId),
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        price: dto.price,
        stockQuantity: dto.stockQuantity,
        status: ProductStatus.ACTIVE,
        thumbnailUrl: dto.thumbnailUrl ?? null,
      });
      const saved = await queryRunner.manager.save(ProductEntity, product);

      // 5) 이미지 INSERT
      if (dto.images && dto.images.length > 0) {
        const images = dto.images.map((img) =>
          queryRunner.manager.create(ProductImageEntity, {
            productId: saved.id,
            imageUrl: img.imageUrl,
            sortOrder: img.sortOrder,
            isPrimary: img.isPrimary ?? false,
          }),
        );
        await queryRunner.manager.save(ProductImageEntity, images);
      }

      await queryRunner.commitTransaction();
      this.logger.log(`상품 생성 완료: id=${saved.id}, seller=${sellerId}`);

      return this.getProductById(saved.id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ---------------------------------------------------------------------------
  // updateProduct
  // ---------------------------------------------------------------------------
  async updateProduct(
    sellerId: bigint,
    productId: bigint,
    dto: UpdateProductDto,
  ): Promise<ProductEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1) 상품 조회 (비관적 잠금)
      const product = await queryRunner.manager.findOne(ProductEntity, {
        where: { id: productId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) {
        throw new ProductNotFoundException(productId);
      }

      // 2) 소프트 삭제된 상품은 수정 불가
      if (product.deletedAt !== null) {
        throw new ProductNotFoundException(productId);
      }

      // 3) 소유자 검증
      if (product.sellerId.toString() !== sellerId.toString()) {
        throw new ProductForbiddenException();
      }

      // 4) 카테고리 변경 시 검증
      if (dto.categoryId !== undefined) {
        const category = await queryRunner.manager.findOne(CategoryEntity, {
          where: { id: BigInt(dto.categoryId), isActive: true },
          relations: ['children'],
        });
        if (!category) {
          throw new CategoryNotFoundException(dto.categoryId);
        }
        if (category.children && category.children.length > 0) {
          throw new CategoryNotLeafException(dto.categoryId);
        }
        product.categoryId = BigInt(dto.categoryId);
      }

      // 5) 이미지 교체 (제공 시)
      if (dto.images !== undefined) {
        this.validateImages(dto.images);
        await queryRunner.manager.delete(ProductImageEntity, { productId });
        if (dto.images.length > 0) {
          const images = dto.images.map((img) =>
            queryRunner.manager.create(ProductImageEntity, {
              productId,
              imageUrl: img.imageUrl,
              sortOrder: img.sortOrder,
              isPrimary: img.isPrimary ?? false,
            }),
          );
          await queryRunner.manager.save(ProductImageEntity, images);
        }
      }

      // 6) 상품 필드 업데이트
      if (dto.name !== undefined) product.name = dto.name.trim();
      if (dto.description !== undefined) product.description = dto.description.trim();
      if (dto.price !== undefined) product.price = dto.price;
      if (dto.stockQuantity !== undefined) product.stockQuantity = dto.stockQuantity;
      if (dto.thumbnailUrl !== undefined) product.thumbnailUrl = dto.thumbnailUrl;

      await queryRunner.manager.save(ProductEntity, product);
      await queryRunner.commitTransaction();
      this.logger.log(`상품 수정 완료: id=${productId}`);

      return this.getProductById(productId);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ---------------------------------------------------------------------------
  // deleteProduct (soft delete)
  // ---------------------------------------------------------------------------
  async deleteProduct(sellerId: bigint, productId: bigint): Promise<void> {
    const product = await this.productRepo.findOne({
      where: { id: productId, deletedAt: IsNull() },
    });
    if (!product) {
      throw new ProductNotFoundException(productId);
    }
    if (product.sellerId.toString() !== sellerId.toString()) {
      throw new ProductForbiddenException();
    }

    product.deletedAt = new Date();
    await this.productRepo.save(product);
    this.logger.log(`상품 소프트 삭제: id=${productId}`);
  }

  // ---------------------------------------------------------------------------
  // getProductById
  // ---------------------------------------------------------------------------
  async getProductById(productId: bigint): Promise<ProductEntity> {
    const product = await this.productRepo.findOne({
      where: { id: productId, deletedAt: IsNull() },
      relations: ['images', 'category'],
      order: { images: { sortOrder: 'ASC' } },
    });
    if (!product) {
      throw new ProductNotFoundException(productId);
    }
    return product;
  }

  // ---------------------------------------------------------------------------
  // getProductsBySeller
  // ---------------------------------------------------------------------------
  async getProductsBySeller(
    sellerId: bigint,
    page: number,
    limit: number,
    status?: string,
  ): Promise<ProductsPage> {
    const where: Record<string, unknown> = { sellerId, deletedAt: IsNull() };
    if (status) {
      where.status = status;
    }

    const [data, total] = await this.productRepo.findAndCount({
      where,
      relations: ['images'],
      order: { createdAt: 'DESC', images: { sortOrder: 'ASC' } },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  // ---------------------------------------------------------------------------
  // changeProductStatus
  // ---------------------------------------------------------------------------
  async changeProductStatus(
    sellerId: bigint,
    productId: bigint,
    dto: ChangeProductStatusDto,
  ): Promise<ProductEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const product = await queryRunner.manager.findOne(ProductEntity, {
        where: { id: productId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product || product.deletedAt !== null) {
        throw new ProductNotFoundException(productId);
      }
      if (product.sellerId.toString() !== sellerId.toString()) {
        throw new ProductForbiddenException();
      }

      // 상태 전이 규칙 검증
      const allowed = STATUS_TRANSITIONS[product.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new InvalidStatusTransitionException(product.status, dto.status);
      }

      // ACTIVE 전환 시 재고 > 0 필수
      if (dto.status === ProductStatus.ACTIVE && product.stockQuantity === 0) {
        throw new InsufficientStockForActivationException();
      }

      product.status = dto.status;
      await queryRunner.manager.save(ProductEntity, product);
      await queryRunner.commitTransaction();
      this.logger.log(`상태 변경: id=${productId}, ${product.status} → ${dto.status}`);

      return this.getProductById(productId);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ---------------------------------------------------------------------------
  // 내부 헬퍼: 이미지 배열 검증
  // ---------------------------------------------------------------------------
  private validateImages(images: Array<{ sortOrder: number; isPrimary?: boolean }>): void {
    // sort_order 중복 검사
    const orders = images.map((i) => i.sortOrder);
    const seen = new Set<number>();
    for (const o of orders) {
      if (seen.has(o)) {
        throw new DuplicateSortOrderException(o);
      }
      seen.add(o);
    }

    // isPrimary 정확히 1개
    const primaryCount = images.filter((i) => i.isPrimary === true).length;
    if (primaryCount !== 1) {
      throw new InvalidPrimaryImageException(primaryCount);
    }
  }
}
