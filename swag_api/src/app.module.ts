import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductsModule } from './products/products.module';
import { DatabaseModule } from './database/database.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { SavedModule } from './saved/saved.module';
import { ProfileModule } from './profile/profile.module';
import { ChatModule } from './chat/chat.module';
import { TryonModule } from './tryon/tryon.module';

@Module({
  imports: [ProductsModule, DatabaseModule, AdminModule, AuthModule, CartModule, SavedModule, ProfileModule, ChatModule, TryonModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
