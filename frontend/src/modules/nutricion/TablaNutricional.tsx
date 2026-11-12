import clsx from 'clsx';
import type { Valores } from './types';
import { NUTRIENTES, fmtNutriente } from './utils';

// Tabla tipo rotulo: una fila por nutriente y una columna por base
// (por porcion, cada 100 g...).
export default function TablaNutricional({ columnas }: { columnas: { titulo: string; valores: Valores }[] }) {
  return (
    <table className="w-full text-sm border border-gray-300 rounded-lg overflow-hidden">
      <thead>
        <tr className="bg-gray-50 text-xs text-text-muted">
          <th className="px-3 py-1.5 text-left font-medium">Cantidad</th>
          {columnas.map((c) => <th key={c.titulo} className="px-3 py-1.5 text-right font-medium whitespace-nowrap">{c.titulo}</th>)}
        </tr>
      </thead>
      <tbody>
        {NUTRIENTES.map((n) => (
          <tr key={n.key} className="border-t border-gray-200">
            <td className={clsx('px-3 py-1', n.sub ? 'pl-7 text-text-muted' : 'font-medium')}>{n.label}</td>
            {columnas.map((c) => (
              <td key={c.titulo} className="px-3 py-1 text-right tabular-nums whitespace-nowrap">
                {fmtNutriente(n.key, c.valores[n.key])} <span className="text-text-muted text-xs">{n.unidad}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
