import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

type UploadedProductFile = {
  filename: string;
  originalname: string;
  mimetype: string;
};

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Post('uploads')
  @UseInterceptors(
    FilesInterceptor('images', 4, {
      storage: diskStorage({
        destination: './uploads/products',
        filename: (_request, file, callback) => {
          const safeName = file.originalname
            .replace(extname(file.originalname), '')
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase();
          callback(null, `${Date.now()}-${safeName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_request, file, callback) => {
        callback(null, /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype));
      },
      limits: {
        files: 4,
        fileSize: 4 * 1024 * 1024,
      },
    }),
  )
  uploadImages(@UploadedFiles() files: UploadedProductFile[]) {
    return this.productsService.uploadedImages(files);
  }

  @Get('meta/lookups')
  lookups() {
    return this.productsService.lookups();
  }

  @Get('meta/measurement-defaults')
  measurementDefaults(
    @Query('sizeId') sizeId: string,
    @Query('garmentTypeId') garmentTypeId: string,
  ) {
    return this.productsService.measurementDefaults(Number(sizeId), Number(garmentTypeId));
  }

  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
