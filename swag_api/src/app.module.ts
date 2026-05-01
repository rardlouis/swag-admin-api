import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductsModule } from './products/products.module';
import { DatabaseModule } from './database/database.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ProductsModule, DatabaseModule, AdminModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
