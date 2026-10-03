const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/products/products.service.ts');
let c = fs.readFileSync(file, 'utf8');
if (!c.includes("import * as XLSX")) {
  c = c.replace("import * as sql from 'mssql/msnodesqlv8';", "import * as sql from 'mssql/msnodesqlv8';\nimport * as XLSX from 'xlsx';");
  
  const methodToAdd = `
  async exportProducts(search?: string, tab?: string) {
    let data = await this.findAll();
    const activeTab = tab || 'All';
    data = data.filter((p: any) => {
      const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase());
      const matchesTab =
        activeTab === "All" ||
        (activeTab === "Active" && p.isActive) ||
        (activeTab === "Inactive" && !p.isActive) ||
        (activeTab === "Low Stock" && p.qty < 10);
      return matchesSearch && matchesTab;
    });
    
    const columns = ['Product ID', 'Name', 'Price', 'Stock', 'Brand', 'Category', 'Gender', 'Status', 'Date Added'];
    const rows = data.map((p: any) => [p.id, p.name, p.price, p.qty, p.brand || '-', p.category, p.gender || '-', p.isActive ? 'Active' : 'Inactive', p.createdAt]);
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
`;
  
  c = c.replace(/}\s*$/, methodToAdd + '\n}\n');
  fs.writeFileSync(file, c);
  console.log('Products export added');
} else {
  console.log('Products export already present');
}
