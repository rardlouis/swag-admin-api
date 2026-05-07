import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AdminService } from './admin.service';

type UploadedProfileFile = {
  filename: string;
  mimetype: string;
};

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.adminService.dashboard();
  }

  @Get('customers')
  customers() {
    return this.adminService.customers();
  }

  @Get('orders')
  orders() {
    return this.adminService.orders();
  }

  @Get('reviews')
  reviews() {
    return this.adminService.reviews();
  }

  @Get('suppliers')
  suppliers() {
    return this.adminService.suppliers();
  }

  @Get('suppliers/:id')
  supplier(@Param('id') id: string) {
    return this.adminService.supplier(id);
  }

  @Post('suppliers')
  createSupplier(@Body() body: unknown) {
    return this.adminService.createSupplier(body);
  }

  @Patch('suppliers/:id')
  updateSupplier(@Param('id') id: string, @Body() body: unknown) {
    return this.adminService.updateSupplier(id, body);
  }

  @Delete('suppliers/:id')
  deleteSupplier(@Param('id') id: string) {
    return this.adminService.deleteSupplier(id);
  }

  @Get('chats')
  chats() {
    return this.adminService.chats();
  }

  @Post('chats/:id/messages')
  sendChatMessage(@Param('id') id: string, @Body('text') text: string) {
    return this.adminService.sendChatMessage(id, text);
  }

  @Post('chats/:id/read')
  markChatRead(@Param('id') id: string) {
    return this.adminService.markChatRead(id);
  }

  @Get('notifications')
  notifications() {
    return this.adminService.notifications();
  }

  @Patch('profile/:id')
  updateProfile(@Param('id') id: string, @Body() body: unknown) {
    return this.adminService.updateProfile(id, body);
  }

  @Post('profile/:id/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: './uploads/profiles',
        filename: (_request, file, callback) => {
          const safeName = file.originalname
            .replace(extname(file.originalname), '')
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase();
          callback(null, `${Date.now()}-${safeName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_request, file, callback) => {
        callback(null, /^image\/(png|jpe?g|webp)$/i.test(file.mimetype));
      },
      limits: {
        fileSize: 4 * 1024 * 1024,
      },
    }),
  )
  updateProfilePhoto(@Param('id') id: string, @UploadedFile() file: UploadedProfileFile) {
    return this.adminService.updateProfilePhoto(id, file);
  }
}
