import { Controller, Get, Param } from '@nestjs/common';
import { ProfileService } from './profile.service';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get(':userId/summary')
  summary(@Param('userId') userId: string) {
    return this.profileService.summary(userId);
  }

  @Get(':userId/orders')
  orders(@Param('userId') userId: string) {
    return this.profileService.orders(userId);
  }
}
