import clsx from 'clsx';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { LineaCalculo } from './types';
import { fmtNutriente, fmtGramos } from './utils';
import SeccionColapsable from './SeccionColapsable';

// "Receta completa": cada linea con sus gramos y nutrientes. Con
// onAbrirSubreceta, las subrecetas se tocan para ver su propia info.
export default function LineasReceta({ lineas, onAbrirSubreceta }: {
  lineas: LineaCalculo[];
  onAbrirSubreceta?: (l: LineaCalculo) => void;
}) {
  const incompletas = lineas.filter((l) => !l.completa).length;
  const abrible = (l: LineaCalculo) => !!onAbrirSubreceta && l.tipo === 'subreceta' && l.ref_id != null;

  return (
    <SeccionColapsable
      titulo="Receta completa"
      resumen={<>
        <span>{lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'}</span>
        {lineas.some(abrible) && <span>tocá una subreceta para ver su info</span>}
        {incompletas > 0 && <span className="text-amber-700">{incompletas} sin datos completos</span>}
        {lineas.some((l) => l.alerta) && <span className="text-red-600">revisar cantidades</span>}
      </>}
    >
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="bg-gray-50 text-text-muted">
            <th className="px-3 py-1.5 text-left font-medium sticky left-0 bg-gray-50">Ingrediente</th>
            <th className="px-3 py-1.5 text-right font-medium">Cantidad</th>
            <th className="px-3 py-1.5 text-right font-medium">Gramos</th>
            <th className="px-3 py-1.5 text-right font-medium">Kcal</th>
            <th className="px-3 py-1.5 text-right font-medium">Prot.</th>
            <th className="px-3 py-1.5 text-right font-medium">Carbs</th>
            <th className="px-3 py-1.5 text-right font-medium">Grasas</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => (
            <tr key={`${l.tipo}-${l.linea_id}`} className={clsx('border-t border-gray-100', !l.completa && 'bg-amber-50')}>
              {/* Nombre fijo al desplazar de costado (celular) */}
              <td className={clsx('px-3 py-1.5 sticky left-0 min-w-[130px]', l.completa ? 'bg-white' : 'bg-amber-50')}>
                {abrible(l) ? (
                  <button type="button" onClick={() => onAbrirSubreceta!(l)}
                    className="inline-flex items-center gap-0.5 text-left text-primary font-medium hover:underline">
                    {l.nombre} <ChevronRight size={12} className="shrink-0" />
                  </button>
                ) : l.nombre}
                {(l.tipo === 'subreceta' || l.tipo === 'producto') && <span className="ml-1 text-[10px] text-text-muted">({l.tipo})</span>}
                {l.tipo === 'manual' && <span className="ml-1 text-[10px] text-text-muted">(item manual: no suma)</span>}
                {!l.completa && <span className="ml-1 text-[10px] text-amber-700">{l.valores ? 'incompleta' : 'sin datos'}</span>}
                {l.alerta && <AlertTriangle size={11} className="inline ml-1 text-red-600" />}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{l.cantidad.toLocaleString('es-AR')} {l.unidad}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{l.gramos != null ? fmtGramos(l.gramos) : '—'}</td>
              {(['energia_kcal', 'proteinas_g', 'carbohidratos_g', 'grasas_g'] as const).map((k) => (
                <td key={k} className="px-3 py-1.5 text-right tabular-nums">{l.valores ? fmtNutriente(k, l.valores[k]) : '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </SeccionColapsable>
  );
}
