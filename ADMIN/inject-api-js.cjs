const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/api.js');
let c = fs.readFileSync(file, 'utf8');

const downloadMethod = `
export async function apiDownload(path, filename) {
  const response = await fetchApi(path, { headers: authHeaders() });

  if (!response.ok) {
    await throwApiError(response, path);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
`;

if (!c.includes('apiDownload')) {
  c += downloadMethod;
  fs.writeFileSync(file, c);
  console.log('apiDownload added');
} else {
  console.log('apiDownload already exists');
}
