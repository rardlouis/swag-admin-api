import { Body, Controller, Delete, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CartService } from './cart.service';

type UploadedReceiptFile = {
  filename: string;
  mimetype: string;
};

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get(':userId/items')
  items(@Param('userId') userId: string) {
    return this.cartService.items(userId);
  }

  @Post('items')
  addItem(
    @Body()
    body: {
      userId?: string;
      productId?: string;
      sizeId?: number | string;
      quantity?: number | string;
    },
  ) {
    return this.cartService.addItem(body);
  }

  @Delete('items/:cartItemId')
  removeItem(@Param('cartItemId') cartItemId: string, @Body('userId') userId?: string) {
    return this.cartService.removeItem(cartItemId, userId);
  }

  @Post('checkout')
  @UseInterceptors(
    FileInterceptor('receipt', {
      storage: diskStorage({
        destination: './uploads/receipts',
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
        callback(null, /^image\/(png|jpe?g|webp|heic|heif)$/i.test(file.mimetype));
      },
      limits: {
        fileSize: 6 * 1024 * 1024,
      },
    }),
  )
  checkout(@Body() body: Record<string, string | undefined>, @UploadedFile() file: UploadedReceiptFile) {
    return this.cartService.checkout(body, file);
  }
}
