const fs = require('fs');
const path = require('path');

const adminFile = path.join(__dirname, 'src/admin/admin.service.ts');
let admin = fs.readFileSync(adminFile, 'utf8');

admin = admin.replace(/let data = await this\.customers\(\);/g, 'let data: any[] = Array.from(await this.customers());');
admin = admin.replace(/let data = await this\.orders\(\);/g, 'let data: any[] = Array.from(await this.orders());');
admin = admin.replace(/let data = await this\.reviews\(\);/g, 'let data: any[] = Array.from(await this.reviews());');
admin = admin.replace(/let data = await this\.suppliers\(\);/g, 'let data: any[] = Array.from(await this.suppliers());');

fs.writeFileSync(adminFile, admin);

const productFile = path.join(__dirname, 'src/products/products.service.ts');
let product = fs.readFileSync(productFile, 'utf8');
product = product.replace(/let data = await this\.findAll\(\);/g, 'let data: any[] = Array.from(await this.findAll());');
fs.writeFileSync(productFile, product);
console.log('TypeScript fixes applied');
