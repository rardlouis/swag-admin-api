import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { SavedService } from './saved.service';

@Controller('saved')
export class SavedController {
  constructor(private readonly savedService: SavedService) {}

  @Get(':userId')
  findForUser(@Param('userId') userId: string) {
    return this.savedService.findForUser(userId);
  }

  @Get(':userId/ids')
  idsForUser(@Param('userId') userId: string) {
    return this.savedService.idsForUser(userId);
  }

  @Post('toggle')
  toggle(@Body() body: { userId?: string; productId?: string }) {
    return this.savedService.toggle(body.userId, body.productId);
  }

  @Delete(':userId/:productId')
  remove(@Param('userId') userId: string, @Param('productId') productId: string) {
    return this.savedService.remove(userId, productId);
  }
}
