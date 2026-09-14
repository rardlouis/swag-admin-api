import { Body, Controller, Delete, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CartService } from './cart.service';
import { EvaluateCheckoutShippingDto } from './dto/evaluate-checkout-shipping.dto';
import { SessionAuthGuard, requireOwnership, type SessionIdentity } from '../common/session-auth';

type UploadedReceiptFile = {
  filename: string;
  mimetype: string;
};

@Controller('cart')
@UseGuards(SessionAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('shipping/evaluate')
  evaluateShipping(@Body() body: EvaluateCheckoutShippingDto, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, body.userId);
    return this.cartService.evaluateCheckoutShipping(
      body.userId,
      body.addressId,
      body.selectedCartItemIds,
    );
  }

  @Get(':userId/items')
  items(@Param('userId') userId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
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
    @Req() request: { user?: SessionIdentity },
  ) {
    requireOwnership(request.user, body.userId);
    return this.cartService.addItem(body);
  }

  @Delete('items/:cartItemId')
  removeItem(@Param('cartItemId') cartItemId: string, @Body('userId') userId: string | undefined, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
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
  checkout(@Body() body: Record<string, string | undefined>, @UploadedFile() file: UploadedReceiptFile, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, body.userId);
    return this.cartService.checkout(body, file);
  }
}
