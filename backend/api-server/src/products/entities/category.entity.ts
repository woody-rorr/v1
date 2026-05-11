import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProductEntity } from './product.entity';

@Entity('categories')
@Index(['parentId', 'isActive'])
export class CategoryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: bigint;

  @Column({ name: 'parent_id', type: 'bigint', nullable: true, default: null })
  parentId: bigint | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'int', default: 0 })
  depth: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ManyToOne(() => CategoryEntity, (category) => category.children, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: CategoryEntity | null;

  @OneToMany(() => CategoryEntity, (category) => category.parent)
  children: CategoryEntity[];

  @OneToMany(() => ProductEntity, (product) => product.category)
  products: ProductEntity[];
}
