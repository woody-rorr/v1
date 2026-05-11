import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ProductImageEntity } from './product-image.entity';
import { CategoryEntity } from './category.entity';
import { UserEntity } from '../../users/entities/user.entity';

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  SOLD_OUT = 'SOLD_OUT',
  DELETED = 'DELETED',
}

@Entity('products')
@Index(['seller_id', 'status'])
@Index(['category_id', 'status'])
export class ProductEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: bigint;

  @Column({ name: 'seller_id', type: 'bigint' })
  sellerId: bigint;

  @Column({ name: 'category_id', type: 'bigint' })
  categoryId: bigint;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price: number;

  @Column({ name: 'stock_quantity', type: 'int' })
  stockQuantity: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 500, nullable: true })
  thumbnailUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true, default: null })
  deletedAt: Date | null;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'seller_id' })
  seller: UserEntity;

  @ManyToOne(() => CategoryEntity, (category) => category.products)
  @JoinColumn({ name: 'category_id' })
  category: CategoryEntity;

  @OneToMany(() => ProductImageEntity, (image) => image.product, { cascade: true })
  images: ProductImageEntity[];
}
