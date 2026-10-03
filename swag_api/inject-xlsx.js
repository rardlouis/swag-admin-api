const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/admin/admin.service.ts');
let c = fs.readFileSync(file, 'utf8');
if (!c.includes("import * as XLSX")) {
  c = c.replace("import * as sql from 'mssql/msnodesqlv8';", "import * as sql from 'mssql/msnodesqlv8';\nimport * as XLSX from 'xlsx';");
  fs.writeFileSync(file, c);
  console.log('XLSX import injected');
} else {
  console.log('XLSX import already present');
}
