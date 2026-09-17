const fs = require("fs");
const base = "C:/Users/USER/Downloads/coffitcostnew/frontend/src";

const files = {};

files["utils/formatters.ts"] = [
  "export function formatMoney(num: number | null | undefined): string {",
  "  if (num === null || num === undefined || isNaN(num)) return '$0,00';",
  "  return '$' + num.toLocaleString('es-AR', {",
  "    minimumFractionDigits: 2,",
  "    maximumFractionDigits: 2,",
  "  });",
  "}",
  "",
  "export function formatNumber(num: number | null | undefined, decimals = 2): string {",
  "  if (num === null || num === undefined || isNaN(num)) return '0';",
  "  return num.toLocaleString('es-AR', {",
  "    minimumFractionDigits: decimals,",
  "    maximumFractionDigits: decimals,",
  "  });",
  "}",
  "",
  "export function formatDate(dateStr: string | null | undefined): string {",
  "  if (!dateStr) return '-';",
  "  return new Date(dateStr).toLocaleDateString('es-AR');",
  "}",
  "",
  "export function formatPercent(num: number | null | undefined): string {",
  "  if (num === null || num === undefined || isNaN(num)) return '0,0%';",
  "  return `${num.toFixed(1).replace('.', ',')}%`;",
  "}",
].join("
") + "
";

for (const [relPath, content] of Object.entries(files)) {
  const fullPath = base + "/" + relPath;
  fs.writeFileSync(fullPath, content);
  console.log("Created:", fullPath);
}
