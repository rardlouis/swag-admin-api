import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AdminService } from './admin.service';
import { AdminGuard, type SessionIdentity } from '../common/session-auth';
import { Res, StreamableFile, Query } from '@nestjs/common';
import type { Response } from 'express';


type UploadedProfileFile = {
  filename: string;
  mimetype: string;
};

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.adminService.dashboard();
  }

  @Get('sales-report')
  salesReport() {
    return this.adminService.salesReport();
  }

  @Get('customers')
  customers() {
    return this.adminService.customers();
  }

  @Delete('customers/:id')
  deleteCustomer(@Param('id') id: string) {
    return this.adminService.deleteCustomer(id);
  }

  @Get('orders')
  orders() {
    return this.adminService.orders();
  }

  @Patch('orders/:id/status')
  updateOrderStatus(@Param('id') id: string, @Body() body: { status?: string; paymentVerification?: string; trackingNumber?: string; trackingUrl?: string; cancellationReason?: string }) {
    return this.adminService.updateOrderStatus(id, body);
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

  @Patch('chats/:id/mode')
  updateChatMode(@Param('id') id: string, @Body('mode') mode: string) {
    return this.adminService.updateChatMode(id, mode);
  }

  @Delete('chats/:id')
  deleteChat(@Param('id') id: string) {
    return this.adminService.deleteChat(id);
  }

  @Get('notifications')
  notifications() {
    return this.adminService.notifications();
  }

  @Get('vouchers')
  vouchers() {
    return this.adminService.vouchers();
  }

  @Post('vouchers')
  createVoucher(@Body() body: unknown) {
    return this.adminService.createVoucher(body);
  }

  @Patch('vouchers/:id')
  updateVoucher(@Param('id') id: string, @Body() body: unknown) {
    return this.adminService.updateVoucher(id, body);
  }

  @Delete('vouchers/:id')
  deleteVoucher(@Param('id') id: string) {
    return this.adminService.deleteVoucher(id);
  }

  @Get('id-types')
  idTypes() {
    return this.adminService.idTypes();
  }

  @Post('admins')
  createAdmin(@Body() body: unknown) {
    return this.adminService.createAdmin(body);
  }

  @Patch('notifications/:id/read')
  markNotificationRead(@Param('id') id: string) {
    return this.adminService.markNotificationRead(id);
  }

  @Patch('profile/:id')
  updateProfile(@Param('id') id: string, @Body() body: unknown) {
    return this.adminService.updateProfile(id, body);
  }

  @Post('password/change')
  changePassword(@Body() body: { currentPassword?: string; password?: string; confirmPassword?: string }, @Req() request: { user: SessionIdentity }) {
    return this.adminService.changePassword(request.user.sub, body);
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

  @Get('export/customers')
  async exportCustomers(@Query('search') search: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.adminService.exportCustomers(search);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="SWAG_Customers_${new Date().toISOString().split('T')[0]}.xlsx"`
    });
    return new StreamableFile(buffer as Uint8Array);
  }

  @Get('export/orders')
  async exportOrders(@Query('search') search: string, @Query('tab') tab: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.adminService.exportOrders(search, tab);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="SWAG_Orders_${new Date().toISOString().split('T')[0]}.xlsx"`
    });
    return new StreamableFile(buffer as Uint8Array);
  }

  @Get('export/reviews')
  async exportReviews(@Query('search') search: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.adminService.exportReviews(search);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="SWAG_Reviews_${new Date().toISOString().split('T')[0]}.xlsx"`
    });
    return new StreamableFile(buffer as Uint8Array);
  }

  @Get('export/suppliers')
  async exportSuppliers(@Query('search') search: string, @Query('status') status: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.adminService.exportSuppliers(search, status);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="SWAG_Suppliers_${new Date().toISOString().split('T')[0]}.xlsx"`
    });
    return new StreamableFile(buffer as Uint8Array);
  }

  @Get('export/sales-report')
  async exportSalesReport(@Res({ passthrough: true }) res: Response) {
    const buffer = await this.adminService.exportSalesReport();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="SWAG_Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx"`
    });
    return new StreamableFile(buffer as Uint8Array);
  }

}
