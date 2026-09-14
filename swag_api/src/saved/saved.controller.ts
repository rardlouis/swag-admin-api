import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { SavedService } from './saved.service';
import { SessionAuthGuard, requireOwnership, type SessionIdentity } from '../common/session-auth';

@Controller('saved')
@UseGuards(SessionAuthGuard)
export class SavedController {
  constructor(private readonly savedService: SavedService) {}

  @Get(':userId')
  findForUser(@Param('userId') userId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.savedService.findForUser(userId);
  }

  @Get(':userId/ids')
  idsForUser(@Param('userId') userId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.savedService.idsForUser(userId);
  }

  @Post('toggle')
  toggle(@Body() body: { userId?: string; productId?: string }, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, body.userId);
    return this.savedService.toggle(body.userId, body.productId);
  }

  @Delete(':userId/:productId')
  remove(@Param('userId') userId: string, @Param('productId') productId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.savedService.remove(userId, productId);
  }
}
