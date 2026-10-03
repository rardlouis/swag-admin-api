const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/admin/admin.controller.ts');
let c = fs.readFileSync(file, 'utf8');

const importsToAdd = `import { Res, StreamableFile, Query } from '@nestjs/common';\nimport type { Response } from 'express';\n`;

if (!c.includes("StreamableFile")) {
  c = c.replace("import { AdminGuard, type SessionIdentity } from '../common/session-auth';", "import { AdminGuard, type SessionIdentity } from '../common/session-auth';\n" + importsToAdd);
  
  const methodsToAdd = `
  @Get('export/customers')
  async exportCustomers(@Query('search') search: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.adminService.exportCustomers(search);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': \`attachment; filename="SWAG_Customers_\${new Date().toISOString().split('T')[0]}.xlsx"\`
    });
    return new StreamableFile(buffer as Uint8Array);
  }

  @Get('export/orders')
  async exportOrders(@Query('search') search: string, @Query('tab') tab: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.adminService.exportOrders(search, tab);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': \`attachment; filename="SWAG_Orders_\${new Date().toISOString().split('T')[0]}.xlsx"\`
    });
    return new StreamableFile(buffer as Uint8Array);
  }

  @Get('export/reviews')
  async exportReviews(@Query('search') search: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.adminService.exportReviews(search);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': \`attachment; filename="SWAG_Reviews_\${new Date().toISOString().split('T')[0]}.xlsx"\`
    });
    return new StreamableFile(buffer as Uint8Array);
  }

  @Get('export/suppliers')
  async exportSuppliers(@Query('search') search: string, @Query('status') status: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.adminService.exportSuppliers(search, status);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': \`attachment; filename="SWAG_Suppliers_\${new Date().toISOString().split('T')[0]}.xlsx"\`
    });
    return new StreamableFile(buffer as Uint8Array);
  }

  @Get('export/sales-report')
  async exportSalesReport(@Res({ passthrough: true }) res: Response) {
    const buffer = await this.adminService.exportSalesReport();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': \`attachment; filename="SWAG_Sales_Report_\${new Date().toISOString().split('T')[0]}.xlsx"\`
    });
    return new StreamableFile(buffer as Uint8Array);
  }
`;

  c = c.replace(/}\s*$/, methodsToAdd + '\n}\n');
  fs.writeFileSync(file, c);
  console.log('Admin controller exports added');
} else {
  console.log('Admin controller exports already present');
}
