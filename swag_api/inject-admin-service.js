const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/admin/admin.service.ts');
let c = fs.readFileSync(file, 'utf8');

const methodsToAdd = `
  private exportExcelBuffer(columns: string[], rows: any[][], sheetName = 'Data'): Buffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async exportCustomers(search?: string) {
    let data = await this.customers();
    if (search) {
      const lowerSearch = search.toLowerCase();
      data = data.filter(c => c.name.toLowerCase().includes(lowerSearch) || c.id.toLowerCase().includes(lowerSearch));
    }
    const columns = ['Customer ID', 'Name', 'Email', 'Phone', 'Status', 'Orders', 'Address', 'Date Registered'];
    const rows = data.map(c => [c.id, c.name, c.email, c.phone, c.status, c.orders, c.address, c.createdAt]);
    return this.exportExcelBuffer(columns, rows, 'Customers');
  }

  async exportOrders(search?: string, tab?: string) {
    let data = await this.orders();
    const activeTab = tab || 'All Orders';
    const SHIPPING_STATUSES = ["order placed", "order confirmed", "order processed", "ready to ship", "in transit", "out for delivery", "confirmed", "shipped", "shipping"];
    
    data = data.filter(o => {
      const normalizedStatus = o.status?.toLowerCase() || '';
      const matchesTab =
        activeTab === "All Orders" ||
        (activeTab === "Shipping" && SHIPPING_STATUSES.includes(normalizedStatus)) ||
        (activeTab === "Completed" && ["delivered", "completed"].includes(normalizedStatus)) ||
        (activeTab === "Cancel" && ["cancelled", "cancel"].includes(normalizedStatus));
      
      const matchesSearch = !search || (
        (o.name?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (o.id?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (o.customer?.toLowerCase() || '').includes(search.toLowerCase())
      );
      return matchesTab && matchesSearch;
    });

    const columns = ['Order ID', 'Product', 'Color', 'Price', 'Date', 'Customer', 'Payment Status', 'Order Status', 'Tracking Number', 'Tracking URL'];
    const rows = data.map(o => [o.id, o.name, o.color, o.price, o.date, o.customer, o.payment, o.status, o.trackingNumber, o.trackingUrl]);
    return this.exportExcelBuffer(columns, rows, 'Orders');
  }

  async exportReviews(search?: string) {
    let data = await this.reviews();
    if (search) {
      const lowerSearch = search.toLowerCase();
      data = data.filter(r => \`\${r.customer} \${r.orderNumber} \${r.product}\`.toLowerCase().includes(lowerSearch));
    }
    const columns = ['Review ID', 'Customer', 'Product', 'Order Number', 'Rating', 'Comment', 'Date'];
    const rows = data.map(r => [r.id, r.customer, r.product, r.orderNumber, r.rating, r.comment, r.date]);
    return this.exportExcelBuffer(columns, rows, 'Reviews');
  }

  async exportSuppliers(search?: string, status?: string) {
    let data = await this.suppliers();
    const statusFilter = status || 'All';
    data = data.filter(s => {
      const matchesSearch = !search || \`\${s.id} \${s.name} \${s.email} \${s.store} \${s.address}\`.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'All' || s.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    const columns = ['Supplier ID', 'Supplier Name', 'Email', 'Phone', 'Status', 'Store Name', 'Address', 'Date Added'];
    const rows = data.map(s => [s.id, s.name, s.email, s.phone, s.status, s.store, s.address, s.createdAt]);
    return this.exportExcelBuffer(columns, rows, 'Suppliers');
  }

  async exportSalesReport() {
    const report = await this.salesReport();
    const wb = XLSX.utils.book_new();
    
    const summaryCols = ['Total Sales', 'Total Customers', 'Total Transactions', 'Total Products'];
    const summaryRows = [[report.summary.totalSales, report.summary.totalCustomers, report.summary.totalTransactions, report.summary.totalProducts]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([summaryCols, ...summaryRows]), 'Summary');

    const monthlyCols = ['Month', 'Sales', 'Previous Year'];
    const monthlyRows = report.monthlySales.map((m: any) => [m.month, m.sales, m.previous]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([monthlyCols, ...monthlyRows]), 'Monthly Sales');

    const txnCols = ['ID', 'Client', 'Product', 'Amount', 'Status', 'Date'];
    const txnRows = report.recentTransactions.map((t: any) => [t.id, t.client, t.product, t.amount, t.status, t.placedAt]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([txnCols, ...txnRows]), 'Recent Transactions');

    const topCols = ['Product', 'Units Sold', 'Revenue'];
    const topRows = report.topProducts.map((p: any) => [p.name, p.sold, p.revenue]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([topCols, ...topRows]), 'Top Products');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
`;

if (!c.includes("exportExcelBuffer(")) {
  c = c.replace(/}\s*$/, methodsToAdd + '\n}\n');
  fs.writeFileSync(file, c);
  console.log('Admin service export methods added');
} else {
  console.log('Admin service export methods already present');
}
