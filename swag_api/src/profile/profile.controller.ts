import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { SessionAuthGuard, requireOwnership, type SessionIdentity } from '../common/session-auth';

@Controller('profile')
@UseGuards(SessionAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get(':userId/summary')
  summary(@Param('userId') userId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.profileService.summary(userId);
  }

  @Get(':userId/orders')
  orders(@Param('userId') userId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.profileService.orders(userId);
  }
}
