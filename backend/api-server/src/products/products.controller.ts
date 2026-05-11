import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { ProductsService } from './products.service';
import { ProductOwnerGuard } from './guards/product-owner.guard';

// NOTE: JwtAuthGuard와 RolesGuard는 auth 모듈 구현 후 아래 주석을 해제하세요.
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../auth/decorators/roles.decorator';

interface AuthRequest extends Request {
  user: { id: number; role: string };
}

@ApiTags('products')
@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * POST /api/v1/products
   * 상품 등록 — JWT 필요, SELLER 또는 ADMIN
   */
  @Post()
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('SELLER', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: '상품 등록', description: 'SELLER 또는 ADMIN 권한으로 새 상품을 등록합니다.' })
  @ApiResponse({ status: 201, description: '상품 등록 성공' })
  @ApiResponse({ status: 400, description: '유효하지 않은 요청 데이터' })
  @ApiResponse({ status: 401, description: '인증되지 않은 사용자' })
  @ApiResponse({ status: 403, description: '권한 없음 (SELLER/ADMIN 필요)' })
  async createProduct(
    @Body() dto: CreateProductDto,
    @Request() req: AuthRequest,
  ): Promise<unknown> {
    return this.productsService.create(dto, req.user.id);
  }

  /**
   * GET /api/v1/products
   * 상품 목록 조회 — 공개, 페이지네이션 지원
   */
  @Get()
  @ApiOperation({
    summary: '상품 목록 조회',
    description: '페이지네이션, 카테고리/상태 필터, 검색 키워드를 지원합니다.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'categoryId', required: false, type: Number, example: 1 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'SOLD_OUT', 'DELETED'],
    example: 'ACTIVE',
  })
  @ApiQuery({ name: 'search', required: false, type: String, example: '이어폰' })
  @ApiResponse({ status: 200, description: '상품 목록 조회 성공' })
  async getProducts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('categoryId') categoryId?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<unknown> {
    return this.productsService.findAll({ page, limit, categoryId, status, search });
  }

  /**
   * GET /api/v1/products/seller/my-products
   * 판매자 본인 상품 목록 — JWT 필요
   * NOTE: :id 라우트보다 앞에 위치해야 라우팅 충돌 방지
   */
  @Get('seller/my-products')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('SELLER', 'ADMIN')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: '판매자 상품 목록 조회', description: '로그인한 판매자의 상품 목록을 반환합니다.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: '판매자 상품 목록 조회 성공' })
  @ApiResponse({ status: 401, description: '인증되지 않은 사용자' })
  async getSellerProducts(
    @Request() req: AuthRequest,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<unknown> {
    return this.productsService.findBySellerId(req.user.id, { page, limit });
  }

  /**
   * GET /api/v1/products/:id
   * 상품 상세 조회 — 공개
   */
  @Get(':id')
  @ApiParam({ name: 'id', type: Number, example: 1, description: '상품 ID' })
  @ApiOperation({ summary: '상품 상세 조회', description: '인증 없이 누구나 조회할 수 있습니다.' })
  @ApiResponse({ status: 200, description: '상품 상세 조회 성공' })
  @ApiResponse({ status: 404, description: '상품을 찾을 수 없음' })
  async getProduct(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return this.productsService.findById(id);
  }

  /**
   * PATCH /api/v1/products/:id
   * 상품 수정 — JWT 필요, 소유자 또는 ADMIN
   */
  @Patch(':id')
  // @UseGuards(JwtAuthGuard, ProductOwnerGuard)
  @UseGuards(ProductOwnerGuard)
  @ApiBearerAuth('JWT')
  @ApiParam({ name: 'id', type: Number, example: 1, description: '상품 ID' })
  @ApiOperation({ summary: '상품 수정', description: '상품 소유자 또는 ADMIN만 수정할 수 있습니다.' })
  @ApiResponse({ status: 200, description: '상품 수정 성공' })
  @ApiResponse({ status: 400, description: '유효하지 않은 요청 데이터' })
  @ApiResponse({ status: 401, description: '인증되지 않은 사용자' })
  @ApiResponse({ status: 403, description: '권한 없음 (소유자/ADMIN 필요)' })
  @ApiResponse({ status: 404, description: '상품을 찾을 수 없음' })
  async updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @Request() req: AuthRequest,
  ): Promise<unknown> {
    return this.productsService.update(id, dto, req.user.id, req.user.role);
  }

  /**
   * DELETE /api/v1/products/:id
   * 상품 삭제 (소프트 삭제) — JWT 필요, 소유자 또는 ADMIN
   */
  @Delete(':id')
  // @UseGuards(JwtAuthGuard, ProductOwnerGuard)
  @UseGuards(ProductOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT')
  @ApiParam({ name: 'id', type: Number, example: 1, description: '상품 ID' })
  @ApiOperation({
    summary: '상품 삭제',
    description: 'deleted_at 타임스탬프를 기록하는 소프트 삭제입니다. 소유자 또는 ADMIN만 가능합니다.',
  })
  @ApiResponse({ status: 204, description: '상품 삭제 성공' })
  @ApiResponse({ status: 401, description: '인증되지 않은 사용자' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 404, description: '상품을 찾을 수 없음' })
  async deleteProduct(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthRequest,
  ): Promise<void> {
    await this.productsService.delete(id, req.user.id, req.user.role);
  }

  /**
   * POST /api/v1/products/:id/images
   * 상품 이미지 추가 — JWT 필요, 소유자 또는 ADMIN
   */
  @Post(':id/images')
  // @UseGuards(JwtAuthGuard, ProductOwnerGuard)
  @UseGuards(ProductOwnerGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT')
  @ApiParam({ name: 'id', type: Number, example: 1, description: '상품 ID' })
  @ApiOperation({ summary: '상품 이미지 추가', description: '상품에 새 이미지를 추가합니다.' })
  @ApiResponse({ status: 201, description: '이미지 추가 성공' })
  @ApiResponse({ status: 400, description: '유효하지 않은 이미지 URL' })
  @ApiResponse({ status: 401, description: '인증되지 않은 사용자' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 404, description: '상품을 찾을 수 없음' })
  async addProductImage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProductImageDto,
    @Request() req: AuthRequest,
  ): Promise<unknown> {
    return this.productsService.addImage(id, dto, req.user.id, req.user.role);
  }

  /**
   * DELETE /api/v1/products/:id/images/:imageId
   * 상품 이미지 삭제 — JWT 필요, 소유자 또는 ADMIN
   */
  @Delete(':id/images/:imageId')
  // @UseGuards(JwtAuthGuard, ProductOwnerGuard)
  @UseGuards(ProductOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT')
  @ApiParam({ name: 'id', type: Number, example: 1, description: '상품 ID' })
  @ApiParam({ name: 'imageId', type: Number, example: 1, description: '이미지 ID' })
  @ApiOperation({ summary: '상품 이미지 삭제', description: '특정 이미지를 삭제합니다.' })
  @ApiResponse({ status: 204, description: '이미지 삭제 성공' })
  @ApiResponse({ status: 401, description: '인증되지 않은 사용자' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 404, description: '상품 또는 이미지를 찾을 수 없음' })
  async deleteProductImage(
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @Request() req: AuthRequest,
  ): Promise<void> {
    await this.productsService.deleteImage(id, imageId, req.user.id, req.user.role);
  }
}
