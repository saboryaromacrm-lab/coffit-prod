import { Loader2, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { formatMoney, formatPercent } from '../../utils/formatters';
import { calcularMarkup, getFoodCostColor, getMCColor } from '../../utils/calculators';
import type { Simulando } from './useSimulacion';

// ============================================================================
// Precio, costo y rentabilidad de lo armado en el simulador (o del precio base
// si es un producto simple), con el desglose de donde sale cada peso.
// ============================================================================

function Dato({ etiqueta, valor, detalle, color, grande }: {
  etiqueta: string; valor: string; detalle?: string; color?: string; grande?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-text-muted">{etiqueta}</div>
      <div className={clsx('font-bold truncate', grande ? 'text-lg' : 'text-base')} style={color ? { color } : undefined}>{valor}</div>
      {detalle && <div className="text-[11px] text-text-muted truncate">{detalle}</div>}
    </div>
  );
}

export default function ResumenRentabilidad({ simulando, precioBase }: { simulando: Simulando; precioBase: number }) {
  const { sim, isFetching } = simulando;
  if (!sim) return null;

  const listo = sim.errores.length === 0;
  const precio = sim.precio_unitario;
  const costo = sim.costo_unitario;
  const margen = precio - costo;
  // Margen % y food cost suman 100 (el food cost viene redondeado a 1 decimal)
  const margenPct = sim.food_cost != null ? 100 - sim.food_cost : null;
  const conCosto = listo && costo > 0;
  const nada = '—';

  return (
    <div className={clsx('rounded-xl border p-3 space-y-3', listo ? 'bg-gray-50 border-gray-200' : 'bg-amber-50/50 border-amber-200')}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          Rentabilidad {isFetching && <Loader2 size={13} className="animate-spin text-text-muted" />}
        </h4>
        <span className="text-xs text-text-muted text-right">
          {sim.pasos.length === 0 ? 'Producto simple' : listo ? 'Con lo elegido en el simulador' : 'Elegí las opciones en el simulador'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-2">
        <Dato etiqueta="Precio" valor={listo ? formatMoney(precio) : nada} grande />
        <Dato etiqueta="Costo" valor={listo ? formatMoney(costo) : nada} grande />
        <Dato etiqueta="Margen" valor={listo ? formatMoney(margen) : nada} grande />
        <Dato etiqueta="Margen %" valor={margenPct != null ? formatPercent(margenPct) : nada}
          detalle="sobre el precio" color={margenPct != null && conCosto ? getMCColor(margenPct) : undefined} />
        <Dato etiqueta="Markup" valor={conCosto ? formatPercent(calcularMarkup(precio, costo)) : nada}
          detalle={conCosto ? `precio = costo × ${(precio / costo).toFixed(2)}` : 'sobre el costo'} />
        <Dato etiqueta="Food cost" valor={sim.food_cost != null ? formatPercent(sim.food_cost) : nada}
          detalle="costo / precio" color={sim.food_cost != null && conCosto ? getFoodCostColor(sim.food_cost) : undefined} />
      </div>

      {listo && sim.opciones.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-muted">
              <th className="py-1 text-left font-medium">Desglose</th>
              <th className="py-1 text-right font-medium">Precio</th>
              <th className="py-1 text-right font-medium">Costo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-200">
              <td className="py-1">Base</td>
              <td className="py-1 text-right font-mono">{formatMoney(precioBase)}</td>
              <td className="py-1 text-right font-mono text-text-muted">{formatMoney(sim.costo_base)}</td>
            </tr>
            {sim.opciones.map((o) => (
              <tr key={String(o.opcion_id)} className="border-t border-gray-200">
                <td className="py-1"><span className="text-text-muted">{o.paso_nombre}:</span> {o.nombre}</td>
                <td className="py-1 text-right font-mono">{formatMoney(o.precio)}</td>
                <td className="py-1 text-right font-mono text-text-muted">{formatMoney(o.costo)}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-300 font-semibold">
              <td className="py-1">Total</td>
              <td className="py-1 text-right font-mono">{formatMoney(precio)}</td>
              <td className="py-1 text-right font-mono">{formatMoney(costo)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {(sim.peso_kg != null || sim.costo_incompleto || (listo && costo === 0)) && (
        <div className="space-y-1 text-xs">
          {sim.peso_kg != null && <p className="text-text-muted">Peso: {sim.peso_kg.toLocaleString('es-AR')} kg</p>}
          {sim.costo_incompleto && (
            <p className="text-red-600 flex items-center gap-1">
              <AlertTriangle size={12} /> Hay recetas con ingredientes que ya no existen: el costo está incompleto.
            </p>
          )}
          {listo && costo === 0 && <p className="text-amber-700">Sin recetas cargadas: el costo da $0.</p>}
        </div>
      )}
    </div>
  );
}
