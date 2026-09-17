import { formatMoney } from '../../utils/formatters';

export function StatCardAvanzado({ label, cantidad, monto, subtitle, icon, color }: {
  label: string;
  cantidad: number;
  monto: number | null;
  subtitle?: string;
  icon: React.ReactNode;
  color: 'primary' | 'red' | 'green' | 'blue' | 'amber';
}) {
  const colorClasses = {
    primary: 'bg-primary/5',
    red: 'bg-red-50',
    green: 'bg-green-50',
    blue: 'bg-blue-50',
    amber: 'bg-amber-50',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
      <div className={`p-2 rounded-lg shrink-0 ${colorClasses[color]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-text-primary leading-tight">{Number(cantidad)}</div>
        <div className="text-[11px] text-text-muted truncate">{label}</div>
        {monto !== null && (
          <div className="text-[11px] font-semibold text-text-primary">{formatMoney(monto)}</div>
        )}
        {subtitle && (
          <div className="text-[10px] text-text-muted">{subtitle}</div>
        )}
      </div>
    </div>
  );
}
