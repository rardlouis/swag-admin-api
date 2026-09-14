import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SessionAuthGuard, requireOwnership, type SessionIdentity } from '../common/session-auth';

@Controller('notifications')
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('users/:userId/push-token')
  register(@Param('userId') userId: string, @Body('token') token: string, @Req() request: { user?: SessionIdentity }) { requireOwnership(request.user, userId); return this.notifications.register(userId, token); }

  @Delete('users/:userId/push-token')
  unregister(@Param('userId') userId: string, @Body('token') token: string, @Req() request: { user?: SessionIdentity }) { requireOwnership(request.user, userId); return this.notifications.unregister(userId, token); }

  @Get('users/:userId/preferences')
  preferences(@Param('userId') userId: string, @Req() request: { user?: SessionIdentity }) { requireOwnership(request.user, userId); return this.notifications.preferences(userId); }

  @Patch('users/:userId/preferences')
  updatePreferences(@Param('userId') userId: string, @Body() body: { emailNotificationsEnabled?: boolean; smsNotificationsEnabled?: boolean }, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.notifications.updatePreferences(userId, body);
  }
}
