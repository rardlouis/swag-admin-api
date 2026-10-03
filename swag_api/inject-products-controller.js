const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/products/products.controller.ts');
let c = fs.readFileSync(file, 'utf8');
if (!c.includes("exportExcel(")) {
  c = c.replace("import { AdminGuard } from '../common/session-auth';", "import { AdminGuard } from '../common/session-auth';\nimport { Res, StreamableFile } from '@nestjs/common';\nimport type { Response } from 'express';");
  
  const methodToAdd = `
  @Get('export/excel')
  @UseGuards(AdminGuard)
  async exportExcel(
    @Query('search') search: string,
    @Query('tab') tab: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const buffer = await this.productsService.exportProducts(search, tab);
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': \`attachment; filename="SWAG_Products_\${date}.xlsx"\`
    });
    return new StreamableFile(buffer as Uint8Array);
  }
`;
  
  c = c.replace(/}\s*$/, methodToAdd + '\n}\n');
  fs.writeFileSync(file, c);
  console.log('Products controller export added');
} else {
  console.log('Products controller export already present');
}
