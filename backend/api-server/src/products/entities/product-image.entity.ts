import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProductEntity } from './product.entity';

@Entity('product_images')
@Index(['productId', 'sortOrder'], { unique: true })
export class ProductImageEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: bigint;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: bigint;

  @Column({ name: 'image_url', type: 'varchar', length: 500 })
  imageUrl: string;

  @Column({ name: 'sort_order', type: 'int' })
  sortOrder: number;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @ManyToOne(() => ProductEntity, (product) => product.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: ProductEntity;
}
