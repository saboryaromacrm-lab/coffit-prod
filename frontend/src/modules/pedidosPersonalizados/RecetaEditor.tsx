import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { ingredientesApi } from '../../api/ingredientes';
import { subrecetasApi } from '../../api/subrecetas';
import { productosApi } from '../../api/productos';
import NumericInput from '../../components/common/NumericInput';
import { formatMoney } from '../../utils/formatters';
import { normalizarTexto } from '../../utils/normalizers';
import { costoReceta, textoUnitario } from './utils';
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
  // Para la masa (subreceta en gramos) de una opcion: cuanto lleva por defecto.
  // gramos = el peso de la opcion (harina de 700 g -> 700 g de masa);
  // porKg = la opcion va por kg (version de torta): 1000 g por kg del tamano.
  sugerencia?: { gramos?: number; porKg?: boolean };
  // El producto no tiene ninguna opcion con peso: una linea "x kg" multiplica por
  // 0 kg y da $0 (error tipico en un producto unico). Se avisa en la linea.
  sinPeso?: boolean;
}

export default function RecetaEditor({ lineas, onChange, sugerencia, sinPeso }: Props) {
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
              <Resultado key={`i${i.id}`} clase="hover:bg-gray-50" tipo={<span className="text-text-muted">ingrediente</span>} onElegir={agregar}
                linea={{ ingrediente_id: i.id, cantidad: 0, por_kg: false, nombre: i.nombre, unidad: i.unidad_abrev || 'g', costo_unitario: Number(i.costo_con_desperdicio) }} />
            ))}
            {subs.map((s) => (
              <Resultado key={`s${s.id}`} clase="hover:bg-blue-50" tipo={<span className="text-blue-600">subreceta</span>} onElegir={agregar}
                linea={{
                  subreceta_id: s.id,
                  ...(s.tipo_rendimiento === 'porciones'
                    ? { cantidad: 1, por_kg: false }
                    : { cantidad: sugerencia?.porKg ? 1000 : (sugerencia?.gramos ?? 0), por_kg: !!sugerencia?.porKg }),
                  nombre: s.nombre,
                  unidad: s.tipo_rendimiento === 'porciones' ? 'porc' : 'g',
                  costo_unitario: s.tipo_rendimiento === 'porciones'
                    ? (s.rendimiento_gramos > 0 ? Number(s.costo_total) / s.rendimiento_gramos : 0)
                    : Number(s.costo_por_100g) / 100,
                }} />
            ))}
            {prods.map((p) => (
              <Resultado key={`p${p.id}`} clase="hover:bg-green-50" tipo={<span className="text-green-700">producto</span>} onElegir={agregar}
                linea={{ cc_producto_id: p.id, cantidad: 1, por_kg: false, nombre: p.nombre, unidad: 'porc', costo_unitario: Number(p.costo_total) }} />
            ))}
            <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 border-t border-gray-100"
              onClick={() => agregar({ nombre_manual: buscar.trim(), costo_manual: 0, cantidad: 1, por_kg: false, nombre: buscar.trim(), unidad: 'u', costo_unitario: 0 })}>
              <Plus size={11} className="inline" /> Usar "<strong>{buscar.trim()}</strong>" <span className="text-xs text-amber-700">como costo manual</span>
            </button>
          </div>
        )}
      </div>

      {/* Una fila por linea. Manda el ancho de la caja, no el de la pantalla
          (container query): angosta (celular, columna del editor) el item va
          arriba y cantidad, x kg y costo abajo; con lugar, todo en una fila. */}
      {lineas.length > 0 && (
        <div className="@container border border-gray-200 rounded-lg text-sm">
          <div className="hidden @lg:flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-t-lg text-text-muted text-xs font-medium">
            <span className="flex-1">Item</span>
            <span className="w-24 text-right">Cant.</span>
            <span className="w-10">U.</span>
            <span className="w-10 text-center" title="La cantidad es por kg del producto: se multiplica por el peso (tamaño)">x kg</span>
            <span className="w-24 text-right">Costo</span>
            <span className="w-7"></span>
          </div>
          {lineas.map((l, i) => {
            const manual = l.ingrediente_id == null && l.subreceta_id == null && l.cc_producto_id == null;
            const sinFuente = !manual && l.costo_unitario == null;
            const alertaPeso = sinPeso && l.por_kg;
            return (
              <div key={i} className="flex flex-wrap @lg:flex-nowrap items-center gap-x-2 gap-y-1.5 px-2 py-2 @lg:py-1 border-t border-gray-100 @max-lg:nth-2:border-t-0">
                <div className="basis-full @lg:basis-auto @lg:flex-1 min-w-0">
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
                    <span className={clsx('break-words', sinFuente && 'text-red-600')}>
                      {sinFuente && <AlertTriangle size={12} className="inline mr-1" />}
                      {l.nombre || 'Sin nombre'}
                      {sinFuente
                        ? <span className="text-xs"> (ya no existe)</span>
                        : <span className="ml-1.5 text-xs text-text-muted font-mono whitespace-nowrap">{textoUnitario(l.costo_unitario, l.unidad)}</span>}
                    </span>
                  )}
                </div>
                <NumericInput value={l.cantidad} onChange={(v) => cambiar(i, { cantidad: v })}
                  className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded" />
                <span className="w-10 text-xs text-text-muted">{l.unidad}</span>
                <label className={clsx('w-auto @lg:w-10 flex items-center justify-center gap-1 text-xs text-text-muted rounded px-1 py-0.5 cursor-pointer', alertaPeso && 'bg-red-50')}
                  title={alertaPeso ? 'Este producto no tiene peso (ninguna opción de tamaño): x kg da $0. Desmarcalo.' : 'La cantidad es por kg del producto'}>
                  <input type="checkbox" checked={l.por_kg} onChange={(e) => cambiar(i, { por_kg: e.target.checked })} />
                  <span className="@lg:hidden">x kg</span>
                </label>
                <span className="ml-auto @lg:ml-0 @lg:w-24 text-right font-mono text-xs">
                  {formatMoney(l.cantidad * (l.costo_unitario ?? 0))}{l.por_kg ? '/kg' : ''}
                </span>
                <button type="button" onClick={() => onChange(lineas.filter((_, j) => j !== i))}
                  className="w-7 p-1 text-text-muted hover:text-danger" title="Quitar">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 px-2 py-1.5 border-t border-gray-200 bg-gray-50 rounded-b-lg text-xs">
            {incompleto && <span className="text-red-600">Costo incompleto</span>}
            {sinPeso && lineas.some((l) => l.por_kg) && (
              <span className="text-red-600">Hay líneas x kg y el producto no tiene peso: dan $0</span>
            )}
            <span className="text-text-muted">Costo de la receta</span>
            <span className="font-mono font-semibold @lg:w-24 text-right">
              {[fijo || !porKg ? formatMoney(fijo) : null, porKg ? `${formatMoney(porKg)}/kg` : null].filter(Boolean).join(' + ')}
            </span>
            <span className="hidden @lg:block w-7"></span>
          </div>
        </div>
      )}
    </div>
  );
}

// Un resultado del buscador: nombre y tipo a la izquierda, costo unitario a la derecha.
function Resultado({ linea, tipo, clase, onElegir }: {
  linea: LineaReceta;
  tipo: React.ReactNode;
  clase: string;
  onElegir: (l: LineaReceta) => void;
}) {
  return (
    <button type="button" onClick={() => onElegir(linea)}
      className={clsx('w-full flex items-baseline gap-2 text-left px-3 py-2 text-sm', clase)}>
      <span className="flex-1 min-w-0">{linea.nombre} <span className="text-xs">({tipo})</span></span>
      <span className="text-xs font-mono text-text-muted whitespace-nowrap">{textoUnitario(linea.costo_unitario, linea.unidad)}</span>
    </button>
  );
}
