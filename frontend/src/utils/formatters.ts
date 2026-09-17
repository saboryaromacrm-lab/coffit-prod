export function formatMoney(num: number | string | null | undefined): string {
  if (num === null || num === undefined) return '$0.00';
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return '$0.00';
  // Format: $1,234.56 (always exactly 2 decimals)
  const fixed = Math.round(n * 100) / 100;
  const parts = fixed.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '$' + parts.join('.');
}

export function formatNumber(num: number | string | null | undefined, decimals = 2): string {
  if (num === null || num === undefined) return '0';
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return '0';
  return n.toFixed(decimals);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const day = d.getUTCDate().toString().padStart(2, '0');
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export function formatPercent(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '0.0%';
  return `${num.toFixed(1)}%`;
}
