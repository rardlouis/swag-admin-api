import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlayReviewerAccountService } from './play-reviewer-account.service';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [AuthController],
  providers: [AuthService, PlayReviewerAccountService],
  exports: [AuthService],
})
export class AuthModule {}
