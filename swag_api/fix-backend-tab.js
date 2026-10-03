const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/products/products.service.ts');
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/activeTab === "All" \|\|/g, "activeTab.toLowerCase() === 'all' || activeTab.toLowerCase() === 'all products' ||");
c = c.replace(/activeTab === "Active"/g, "activeTab.toLowerCase() === 'active'");
c = c.replace(/activeTab === "Inactive"/g, "activeTab.toLowerCase() === 'inactive'");
c = c.replace(/activeTab === "Low Stock"/g, "activeTab.toLowerCase().replace(' ', '-') === 'low-stock'");

fs.writeFileSync(file, c);
console.log('Backend Products filter fixed');
