import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
