const fs = require('fs');
const path = require('path');

function updatePage(pagePath, importFind, importReplace, btnRegex, btnReplace, exportMethod) {
  const file = path.join(__dirname, 'src/pages', pagePath);
  let c = fs.readFileSync(file, 'utf8');

  if (!c.includes('apiDownload')) {
    c = c.replace(importFind, importReplace);
  }
  
  if (!c.includes('isExporting')) {
    const componentStartRegex = /export default function [^{]+\{\n/;
    const match = c.match(componentStartRegex);
    if (match) {
      c = c.replace(componentStartRegex, match[0] + exportMethod);
    }
    c = c.replace(btnRegex, btnReplace);
    fs.writeFileSync(file, c);
    console.log('Updated ' + pagePath);
  } else {
    console.log('Already updated ' + pagePath);
  }
}

// 1. Products
updatePage(
  'Products/Products.jsx',
  /import { apiGet, imageUrl, formatPeso, formatDate } from "\.\.\/\.\.\/api\.js";/,
  'import { apiGet, imageUrl, formatPeso, formatDate, apiDownload } from "../../api.js";',
  /<button className="btn-outline"><MdFileDownload size=\{16\} \/> Export<\/button>/,
  '<button className="btn-outline" onClick={handleExport} disabled={isExporting}><MdFileDownload size={16} /> {isExporting ? "Exporting..." : "Export"}</button>',
  `  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (activeTab) params.append("tab", activeTab);
      await apiDownload(\`/products/export/excel?\${params.toString()}\`, \`SWAG_Products_\${new Date().toISOString().split('T')[0]}.xlsx\`);
    } catch (err) {
      alert(err.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };
`
);

// 2. Orders
updatePage(
  'Orders/Orders.jsx',
  /import { apiGet, apiPatch, formatDate, formatPeso, imageUrl } from "\.\.\/\.\.\/api\.js";/,
  'import { apiGet, apiPatch, formatDate, formatPeso, imageUrl, apiDownload } from "../../api.js";',
  /<button className="btn-outline"><MdFileDownload size=\{16\} \/> Export<\/button>/,
  '<button className="btn-outline" onClick={handleExport} disabled={isExporting}><MdFileDownload size={16} /> {isExporting ? "Exporting..." : "Export"}</button>',
  `  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (activeTab) params.append("tab", activeTab);
      await apiDownload(\`/admin/export/orders?\${params.toString()}\`, \`SWAG_Orders_\${new Date().toISOString().split('T')[0]}.xlsx\`);
    } catch (err) {
      alert(err.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };
`
);

// 3. Customers
updatePage(
  'Customers/Customers.jsx',
  /import { apiDelete, apiGet } from "\.\.\/\.\.\/api\.js";/,
  'import { apiDelete, apiGet, apiDownload } from "../../api.js";',
  /<button className="btn-outline"><MdFileDownload size=\{15\} \/> Export<\/button>/,
  '<button className="btn-outline" onClick={handleExport} disabled={isExporting}><MdFileDownload size={15} /> {isExporting ? "Exporting..." : "Export"}</button>',
  `  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      await apiDownload(\`/admin/export/customers?\${params.toString()}\`, \`SWAG_Customers_\${new Date().toISOString().split('T')[0]}.xlsx\`);
    } catch (err) {
      alert(err.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };
`
);

// 4. Reviews
updatePage(
  'Reviews/Reviews.jsx',
  /import { apiDelete, apiGet, formatDate } from "\.\.\/\.\.\/api\.js";/,
  'import { apiDelete, apiGet, formatDate, apiDownload } from "../../api.js";',
  /<button className="reviews-btn-outline" type="button">\s*Export <MdFileDownload size=\{15\} \/>\s*<\/button>/,
  '<button className="reviews-btn-outline" type="button" onClick={handleExport} disabled={isExporting}> {isExporting ? "Exporting..." : "Export"} <MdFileDownload size={15} /></button>',
  `  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      await apiDownload(\`/admin/export/reviews?\${params.toString()}\`, \`SWAG_Reviews_\${new Date().toISOString().split('T')[0]}.xlsx\`);
    } catch (err) {
      alert(err.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };
`
);

// 5. Suppliers
let suppliersFile = path.join(__dirname, 'src/pages/Suppliers/Suppliers.jsx');
let s = fs.readFileSync(suppliersFile, 'utf8');
if (!s.includes('apiDownload')) {
  s = s.replace(/import { apiDelete, apiGet } from "\.\.\/\.\.\/api\.js";/, 'import { apiDelete, apiGet, apiDownload } from "../../api.js";');
  s = s.replace(/const exportSuppliers = \(\) => \{\s*const headers.*?URL\.revokeObjectURL\(url\);\s*\};/s, 
  `const [isExporting, setIsExporting] = useState(false);
  const exportSuppliers = async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (statusFilter) params.append("status", statusFilter);
      await apiDownload(\`/admin/export/suppliers?\${params.toString()}\`, \`SWAG_Suppliers_\${new Date().toISOString().split('T')[0]}.xlsx\`);
    } catch (err) {
      alert(err.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };`);
  
  s = s.replace(/<button className="supplier-btn-outline" onClick=\{exportSuppliers\} type="button">\s*Export <MdFileDownload size=\{16\} \/>\s*<\/button>/,
  '<button className="supplier-btn-outline" onClick={exportSuppliers} type="button" disabled={isExporting}> {isExporting ? "Exporting..." : "Export"} <MdFileDownload size={16} /></button>');
  
  fs.writeFileSync(suppliersFile, s);
  console.log('Updated Suppliers/Suppliers.jsx');
} else {
  console.log('Already updated Suppliers/Suppliers.jsx');
}

// 6. Sales Report
let reportFile = path.join(__dirname, 'src/pages/SalesReport/SalesReport.jsx');
let sr = fs.readFileSync(reportFile, 'utf8');
if (!sr.includes('apiDownload')) {
  sr = sr.replace(/import { apiGet, formatPeso } from "\.\.\/\.\.\/api\.js";/, 'import { apiGet, formatPeso, apiDownload } from "../../api.js";');
  
  const reportExport = `  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    try {
      setIsExporting(true);
      await apiDownload(\`/admin/export/sales-report\`, \`SWAG_Sales_Report_\${new Date().toISOString().split('T')[0]}.xlsx\`);
    } catch (err) {
      alert(err.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };
`;
  const componentStartRegex = /export default function [^{]+\{\n/;
  const match = sr.match(componentStartRegex);
  if (match) {
    sr = sr.replace(componentStartRegex, match[0] + reportExport);
  }
  
  sr = sr.replace(/<button className="sales-export-btn" type="button">\s*<MdDownload size=\{17\} \/> Export Report\s*<\/button>/,
  '<button className="sales-export-btn" type="button" onClick={handleExport} disabled={isExporting}><MdDownload size={17} /> {isExporting ? "Exporting..." : "Export Report"}</button>');
  
  fs.writeFileSync(reportFile, sr);
  console.log('Updated SalesReport/SalesReport.jsx');
} else {
  console.log('Already updated SalesReport/SalesReport.jsx');
}

