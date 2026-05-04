import { Body, Controller, Post } from '@nestjs/common';
import { CartService } from './cart.service';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

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
}
