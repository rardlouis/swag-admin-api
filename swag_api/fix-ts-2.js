const fs = require('fs');
const path = require('path');

const adminFile = path.join(__dirname, 'src/admin/admin.service.ts');
let admin = fs.readFileSync(adminFile, 'utf8');

admin = admin.replace(/report\.summary\.totalSales/g, '(report.summary as any).totalSales');
admin = admin.replace(/report\.summary\.totalCustomers/g, '(report.summary as any).totalCustomers');
admin = admin.replace(/report\.summary\.totalTransactions/g, '(report.summary as any).totalTransactions');
admin = admin.replace(/report\.summary\.totalProducts/g, '(report.summary as any).totalProducts');

fs.writeFileSync(adminFile, admin);
console.log('Fixed sales report summary type');
