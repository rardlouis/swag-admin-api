const fs = require('fs');
const path = require('path');

function fixPage(pagePath, exportMethod) {
  const file = path.join(__dirname, 'src/pages', pagePath);
  let c = fs.readFileSync(file, 'utf8');

  if (!c.includes('apiDownload')) {
    c = 'import { apiDownload } from "../../api.js";\n' + c;
  }

  if (!c.includes('setIsExporting')) {
    const componentStartRegex = /export default function [^{]+\{\r?\n/;
    const match = c.match(componentStartRegex);
    if (match) {
      c = c.replace(componentStartRegex, match[0] + exportMethod);
      console.log('Fixed export method for ' + pagePath);
    } else {
      console.log('Failed to find component start for ' + pagePath);
    }
  } else {
    console.log('Method already exists for ' + pagePath);
  }

  fs.writeFileSync(file, c);
}

// 1. Products
fixPage('Products/Products.jsx',
"  const [isExporting, setIsExporting] = useState(false);\n" +
"  const handleExport = async () => {\n" +
"    try {\n" +
"      setIsExporting(true);\n" +
"      const params = new URLSearchParams();\n" +
"      if (typeof search !== 'undefined' && search) params.append('search', search);\n" +
"      if (typeof pathTab !== 'undefined' && pathTab) params.append('tab', pathTab);\n" +
"      await apiDownload(`/products/export/excel?${params.toString()}`, `SWAG_Products_${new Date().toISOString().split('T')[0]}.xlsx`);\n" +
"    } catch (err) {\n" +
"      alert(err.message || 'Export failed');\n" +
"    } finally {\n" +
"      setIsExporting(false);\n" +
"    }\n" +
"  };\n"
);

// 2. Orders
fixPage('Orders/Orders.jsx',
"  const [isExporting, setIsExporting] = useState(false);\n" +
"  const handleExport = async () => {\n" +
"    try {\n" +
"      setIsExporting(true);\n" +
"      const params = new URLSearchParams();\n" +
"      if (typeof search !== 'undefined' && search) params.append('search', search);\n" +
"      if (typeof activeTab !== 'undefined' && activeTab) params.append('tab', activeTab);\n" +
"      await apiDownload(`/admin/export/orders?${params.toString()}`, `SWAG_Orders_${new Date().toISOString().split('T')[0]}.xlsx`);\n" +
"    } catch (err) {\n" +
"      alert(err.message || 'Export failed');\n" +
"    } finally {\n" +
"      setIsExporting(false);\n" +
"    }\n" +
"  };\n"
);

// 3. Customers
fixPage('Customers/Customers.jsx',
"  const [isExporting, setIsExporting] = useState(false);\n" +
"  const handleExport = async () => {\n" +
"    try {\n" +
"      setIsExporting(true);\n" +
"      const params = new URLSearchParams();\n" +
"      if (typeof search !== 'undefined' && search) params.append('search', search);\n" +
"      await apiDownload(`/admin/export/customers?${params.toString()}`, `SWAG_Customers_${new Date().toISOString().split('T')[0]}.xlsx`);\n" +
"    } catch (err) {\n" +
"      alert(err.message || 'Export failed');\n" +
"    } finally {\n" +
"      setIsExporting(false);\n" +
"    }\n" +
"  };\n"
);

// 4. Reviews
fixPage('Reviews/Reviews.jsx',
"  const [isExporting, setIsExporting] = useState(false);\n" +
"  const handleExport = async () => {\n" +
"    try {\n" +
"      setIsExporting(true);\n" +
"      const params = new URLSearchParams();\n" +
"      if (typeof search !== 'undefined' && search) params.append('search', search);\n" +
"      await apiDownload(`/admin/export/reviews?${params.toString()}`, `SWAG_Reviews_${new Date().toISOString().split('T')[0]}.xlsx`);\n" +
"    } catch (err) {\n" +
"      alert(err.message || 'Export failed');\n" +
"    } finally {\n" +
"      setIsExporting(false);\n" +
"    }\n" +
"  };\n"
);

// 5. Sales Report
let reportFile = path.join(__dirname, 'src/pages/SalesReport/SalesReport.jsx');
let sr = fs.readFileSync(reportFile, 'utf8');

if (!sr.includes('apiDownload')) {
  sr = 'import { apiDownload } from "../../api.js";\n' + sr;
}

if (!sr.includes('setIsExporting')) {
  const componentStartRegex = /export default function [^{]+\{\r?\n/;
  const match = sr.match(componentStartRegex);
  if (match) {
    sr = sr.replace(componentStartRegex, match[0] + 
"  const [isExporting, setIsExporting] = useState(false);\n" +
"  const handleExport = async () => {\n" +
"    try {\n" +
"      setIsExporting(true);\n" +
"      await apiDownload(`/admin/export/sales-report`, `SWAG_Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`);\n" +
"    } catch (err) {\n" +
"      alert(err.message || 'Export failed');\n" +
"    } finally {\n" +
"      setIsExporting(false);\n" +
"    }\n" +
"  };\n"
    );
  }
}

// Fix Sales Report button correctly, matching multiline whitespace
const oldBtn = /<button className="sales-export-btn" type="button">[\s\S]*?Export Report[\s\S]*?<\/button>/;
if (oldBtn.test(sr)) {
  sr = sr.replace(oldBtn, '<button className="sales-export-btn" type="button" onClick={handleExport} disabled={isExporting}><MdDownload size={17} /> {isExporting ? "Exporting..." : "Export Report"}</button>');
  console.log('Fixed Sales Report button');
}

fs.writeFileSync(reportFile, sr);
console.log('Done');
