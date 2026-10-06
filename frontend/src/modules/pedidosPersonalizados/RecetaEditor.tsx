import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { ingredientesApi } from '../../api/ingredientes';
import { subrecetasApi } from '../../api/subrecetas';
import { productosApi } from '../../api/productos';
import NumericInput from '../../components/common/NumericInput';
import { formatMoney } from '../../utils/formatters';
import { normalizarTexto } from '../../utils/normalizers';
import { costoReceta } from './utils';
import type { LineaReceta } from './types';

// ============================================================================
// Receta de un producto base o de una opcion. Mismo buscador que el modal de
// Productos (ingrediente, subreceta o costo manual) + productos ya costeados
// de CoffitCost. Una linea "por kg" se multiplica por el peso del item (la
// receta de una torta va por kg y el tamano define cuanto lleva).
// ============================================================================


interface Props {
  lineas: LineaReceta[];
  onChange: (lineas: LineaReceta[]) => void;
}

export default function RecetaEditor({ lineas, onChange }: Props) {
  const [buscar, setBuscar] = useState('');

  // Mismas claves que la pagina de Productos: se comparte el cache.
  const { data: ingData } = useQuery({ queryKey: ['ingredientes', {}], queryFn: () => ingredientesApi.getAll() });
  const { data: subData } = useQuery({ queryKey: ['subrecetas'], queryFn: () => subrecetasApi.getAll() });
  const { data: prodData } = useQuery({ queryKey: ['productos', {}], queryFn: () => productosApi.getAll() });

  const q = normalizarTexto(buscar.trim());
  const coincide = (nombre: string) => q.length >= 2 && normalizarTexto(nombre).includes(q);
  const ings = (ingData?.data || []).filter((i) => coincide(i.nombre)).slice(0, 5);
  const subs = (subData?.data || []).filter((s) => coincide(s.nombre)).slice(0, 3);
  const prods = (prodData?.data || []).filter((p) => coincide(p.nombre)).slice(0, 3);

  const agregar = (l: LineaReceta) => {
    onChange([...lineas, l]);
    setBuscar('');
  };
  const cambiar = (i: number, cambios: Partial<LineaReceta>) =>
    onChange(lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)));

  const { fijo, porKg, incompleto } = costoReceta(lineas);

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Agregar ingrediente, subreceta o producto..."
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {q.length >= 2 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {ings.map((i) => (
              <button key={`i${i.id}`} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                onClick={() => agregar({ ingrediente_id: i.id, cantidad: 0, por_kg: false, nombre: i.nombre, unidad: i.unidad_abrev || 'g', costo_unitario: Number(i.costo_con_desperdicio) })}>
                {i.nombre} <span className="text-xs text-text-muted">(ingrediente · {i.unidad_abrev})</span>
              </button>
            ))}
            {subs.map((s) => (
              <button key={`s${s.id}`} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                onClick={() => agregar({
                  subreceta_id: s.id, cantidad: 0, por_kg: false, nombre: s.nombre,
                  unidad: s.tipo_rendimiento === 'porciones' ? 'porc' : 'g',
                  costo_unitario: s.tipo_rendimiento === 'porciones'
                    ? (s.rendimiento_gramos > 0 ? Number(s.costo_total) / s.rendimiento_gramos : 0)
                    : Number(s.costo_por_100g) / 100,
                })}>
                {s.nombre} <span className="text-xs text-blue-600">(subreceta)</span>
              </button>
            ))}
            {prods.map((p) => (
              <button key={`p${p.id}`} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-green-50"
                onClick={() => agregar({ cc_producto_id: p.id, cantidad: 1, por_kg: false, nombre: p.nombre, unidad: 'porc', costo_unitario: Number(p.costo_total) })}>
                {p.nombre} <span className="text-xs text-green-700">(producto · costo por porción)</span>
              </button>
            ))}
            <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 border-t border-gray-100"
              onClick={() => agregar({ nombre_manual: buscar.trim(), costo_manual: 0, cantidad: 1, por_kg: false, nombre: buscar.trim(), unidad: 'u', costo_unitario: 0 })}>
              <Plus size={11} className="inline" /> Usar "<strong>{buscar.trim()}</strong>" <span className="text-xs text-amber-700">como costo manual</span>
            </button>
          </div>
        )}
      </div>

      {lineas.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-text-muted text-xs">
                <th className="px-2 py-1.5 text-left font-medium">Item</th>
                <th className="px-2 py-1.5 text-right font-medium w-24">Cant.</th>
                <th className="px-2 py-1.5 text-left font-medium w-12">U.</th>
                <th className="px-2 py-1.5 text-center font-medium w-16" title="La cantidad es por kg del producto: se multiplica por el peso (tamaño)">x kg</th>
                <th className="px-2 py-1.5 text-right font-medium w-24">Costo</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => {
                const manual = l.ingrediente_id == null && l.subreceta_id == null && l.cc_producto_id == null;
                const sinFuente = !manual && l.costo_unitario == null;
                return (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1">
                      {manual ? (
                        <div className="flex gap-1">
                          <input value={l.nombre_manual || ''} placeholder="Nombre"
                            onChange={(e) => cambiar(i, { nombre_manual: e.target.value, nombre: e.target.value })}
                            className="flex-1 min-w-0 px-2 py-1 text-sm border border-amber-300 rounded bg-amber-50/40" />
                          <NumericInput value={l.costo_manual || 0}
                            onChange={(v) => cambiar(i, { costo_manual: v, costo_unitario: v })}
                            placeholder="$ c/u"
                            className="w-20 px-2 py-1 text-sm text-right border border-amber-300 rounded bg-amber-50/40" />
                        </div>
                      ) : (
                        <span className={sinFuente ? 'text-red-600' : ''}>
                          {sinFuente && <AlertTriangle size={12} className="inline mr-1" />}
                          {l.nombre || 'Sin nombre'}
                          {sinFuente && <span className="text-xs"> (ya no existe)</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <NumericInput value={l.cantidad} onChange={(v) => cambiar(i, { cantidad: v })}
                        className="w-full px-2 py-1 text-sm text-right border border-gray-300 rounded" />
                    </td>
                    <td className="px-2 py-1 text-xs text-text-muted">{l.unidad}</td>
                    <td className="px-2 py-1 text-center">
                      <input type="checkbox" checked={l.por_kg} onChange={(e) => cambiar(i, { por_kg: e.target.checked })} />
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-xs">
                      {formatMoney(l.cantidad * (l.costo_unitario ?? 0))}{l.por_kg ? '/kg' : ''}
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button type="button" onClick={() => onChange(lineas.filter((_, j) => j !== i))}
                        className="p-1 text-text-muted hover:text-danger" title="Quitar">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 text-xs">
                <td colSpan={4} className="px-2 py-1.5 text-right text-text-muted">
                  {incompleto && <span className="text-red-600 mr-2">Costo incompleto</span>}
                  Costo de la receta
                </td>
                <td className="px-2 py-1.5 text-right font-mono font-semibold">
                  {[fijo || !porKg ? formatMoney(fijo) : null, porKg ? `${formatMoney(porKg)}/kg` : null].filter(Boolean).join(' + ')}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
