import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Loader2, RotateCcw, ListOrdered, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useDebounce } from '../../hooks/useDebounce';
import { formatMoney, formatPercent } from '../../utils/formatters';
import { getFoodCostColor } from '../../utils/calculators';
import Modal from '../../components/common/Modal';
import { ppApi } from './api';
import { refOpcion } from './utils';
import type { Grupo, IdOpcion, ProductoEditor } from './types';

// ============================================================================
// SIMULADOR: recorre el producto que se esta editando (sin guardar) como lo
// haria el cliente en el POS. Todo lo calcula el MISMO motor del servidor que
// cotiza y crea los pedidos, asi que lo que se ve aca es lo que se va a cobrar.
// ============================================================================

interface InfoOpcion {
  nombre: string;
  precio: number;
  porKg: boolean;
  pesoKg: number | null;
  dependeDe: string | null;
}

// Nombre, precio y dependencia de cada opcion del borrador (propias y de
// grupo, con el ajuste de precio del paso), para dibujar los botones.
function indexarOpciones(producto: ProductoEditor, grupos: Grupo[]) {
  const info = new Map<string, InfoOpcion>();
  for (const paso of producto.pasos) {
    for (const o of paso.opciones) {
      info.set(refOpcion(o), {
        nombre: o.nombre, precio: o.precio, porKg: o.precio_modo === 'por_kg', pesoKg: o.peso_kg,
        dependeDe: o.depende_de == null || o.depende_de === '' ? null : String(o.depende_de),
      });
    }
    const grupo = grupos.find((g) => g.id === paso.grupo_id);
    for (const o of grupo?.opciones || []) {
      const aj = paso.ajustes.find((a) => a.opcion_id === o.id);
      info.set(String(o.id), { nombre: o.nombre, precio: aj?.precio ?? o.precio, porKg: false, pesoKg: null, dependeDe: null });
    }
  }
  return info;
}

export default function Simulador({ producto, grupos }: { producto: ProductoEditor; grupos: Grupo[] }) {
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [verCombinaciones, setVerCombinaciones] = useState(false);
  const info = useMemo(() => indexarOpciones(producto, grupos), [producto, grupos]);

  // Se manda el borrador entero; el debounce evita una consulta por tecla.
  const borradorJson = useDebounce(JSON.stringify(producto), 350);
  const { data, isFetching, error } = useQuery({
    queryKey: ['pp-simular', borradorJson, elegidas],
    queryFn: () => ppApi.simular({ borrador: JSON.parse(borradorJson) }, elegidas),
    placeholderData: keepPreviousData,
  });
  const sim = data?.data;

  const combis = useQuery({
    queryKey: ['pp-combinaciones', borradorJson],
    queryFn: () => ppApi.combinaciones({ borrador: JSON.parse(borradorJson) }),
    enabled: verCombinaciones,
  });

  const tocar = (pasoVisibles: IdOpcion[], maxSel: number, id: string) => {
    let nueva: string[];
    if (elegidas.includes(id)) {
      nueva = elegidas.filter((e) => e !== id);
    } else {
      const delPaso = new Set(pasoVisibles.map(String));
      const enPaso = elegidas.filter((e) => delPaso.has(e));
      if (maxSel === 1) nueva = [...elegidas.filter((e) => !delPaso.has(e)), id];
      else if (enPaso.length >= maxSel) return; // tope del paso
      else nueva = [...elegidas, id];
    }
    // Lo que dependia de una opcion que se saco tambien se va (cambiar de
    // version borra el tamano y los toppings de la version anterior).
    let cambio = true;
    while (cambio) {
      const antes = nueva.length;
      nueva = nueva.filter((e) => {
        const padre = info.get(e)?.dependeDe;
        return padre == null || nueva.includes(padre);
      });
      cambio = nueva.length !== antes;
    }
    setElegidas(nueva);
  };

  const listo = sim && sim.errores.length === 0;
  const margen = sim ? sim.precio_unitario - sim.costo_unitario : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-text-primary flex items-center gap-2">
          Simulador {isFetching && <Loader2 size={14} className="animate-spin text-text-muted" />}
        </h3>
        <div className="flex gap-1">
          <button type="button" onClick={() => setVerCombinaciones(true)}
            className="text-xs px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center gap-1"
            title="Precio, costo y food cost de todas las combinaciones obligatorias">
            <ListOrdered size={13} /> Márgenes
          </button>
          <button type="button" onClick={() => setElegidas([])}
            className="text-xs px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center gap-1">
            <RotateCcw size={13} /> Limpiar
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{(error as Error).message}</p>}

      {sim?.pasos.filter((p) => p.opciones_visibles.length > 0).map((paso) => {
        const errorPaso = sim.errores.find((e) => e.paso_id != null && String(e.paso_id) === String(paso.paso_id));
        return (
          <div key={String(paso.paso_id)}>
            <div className="text-xs font-semibold text-text-muted mb-1.5">
              {paso.nombre}
              <span className="font-normal">
                {' · '}{paso.min_sel > 0 ? 'obligatorio' : 'opcional'}{paso.max_sel > 1 ? `, hasta ${paso.max_sel}` : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {paso.opciones_visibles.map((id) => {
                const o = info.get(String(id));
                const sel = elegidas.includes(String(id));
                return (
                  <button key={String(id)} type="button" onClick={() => tocar(paso.opciones_visibles, paso.max_sel, String(id))}
                    className={clsx('text-xs px-2.5 py-1.5 rounded-lg border transition-colors text-left',
                      sel ? 'bg-primary text-white border-primary' : 'bg-white border-gray-300 hover:border-primary')}>
                    {o?.nombre || 'Opción'}
                    {o?.pesoKg ? <span className={clsx('ml-1', sel ? 'text-white/80' : 'text-text-muted')}>· {o.pesoKg} kg</span> : null}
                    {o && o.precio > 0 && (
                      <span className={clsx('ml-1', sel ? 'text-white/80' : 'text-text-muted')}>
                        {o.porKg ? `${formatMoney(o.precio)}/kg` : `+${formatMoney(o.precio)}`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {errorPaso && elegidas.length > 0 && <p className="text-xs text-amber-700 mt-1">{errorPaso.mensaje}</p>}
          </div>
        );
      })}

      {sim && sim.pasos.length === 0 && (
        <p className="text-sm text-text-muted">Producto simple: se vende al precio base.</p>
      )}

      {sim && (
        <div className={clsx('rounded-lg p-3 border', listo ? 'bg-gray-50 border-gray-200' : 'bg-amber-50/50 border-amber-200')}>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-text-muted">Precio</div>
              <div className="font-bold text-lg">{listo ? formatMoney(sim.precio_unitario) : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Costo</div>
              <div className="font-bold text-lg">{listo ? formatMoney(sim.costo_unitario) : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Margen</div>
              <div className="font-semibold">{listo ? formatMoney(margen) : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Food cost</div>
              <div className="font-semibold" style={{ color: sim.food_cost != null ? getFoodCostColor(sim.food_cost) : undefined }}>
                {sim.food_cost != null ? formatPercent(sim.food_cost) : '—'}
              </div>
            </div>
          </div>
          {sim.peso_kg != null && <p className="text-xs text-text-muted mt-2">Peso: {sim.peso_kg} kg</p>}
          {sim.costo_incompleto && (
            <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
              <AlertTriangle size={12} /> Hay recetas con ingredientes que ya no existen: el costo está incompleto.
            </p>
          )}
          {!listo && elegidas.length === 0 && <p className="text-xs text-text-muted mt-2">Elegí las opciones para ver el precio final.</p>}
          {sim.costo_unitario === 0 && listo && (
            <p className="text-xs text-amber-700 mt-2">Sin recetas cargadas: el costo da $0.</p>
          )}
          {sim.opciones.length > 0 && (
            <table className="w-full text-xs mt-3">
              <tbody>
                {sim.opciones.map((o) => (
                  <tr key={String(o.opcion_id)} className="border-t border-gray-200">
                    <td className="py-1 text-text-muted">{o.paso_nombre}</td>
                    <td className="py-1">{o.nombre}</td>
                    <td className="py-1 text-right font-mono">{formatMoney(o.precio)}</td>
                    <td className="py-1 text-right font-mono text-text-muted">{formatMoney(o.costo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal isOpen={verCombinaciones} onClose={() => setVerCombinaciones(false)} title={`Márgenes de ${producto.nombre || 'el producto'}`} size="xl">
        {combis.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
        ) : combis.data?.data ? (
          <>
            <p className="text-xs text-text-muted mb-3">
              Todas las combinaciones de los pasos obligatorios (sin extras opcionales), de la que menos deja a la que más.
              {combis.data.data.truncado && ' Hay demasiadas: se muestran las primeras 500.'}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-text-muted">
                    <th className="px-2 py-1.5 text-left font-medium">Combinación</th>
                    <th className="px-2 py-1.5 text-right font-medium">Precio</th>
                    <th className="px-2 py-1.5 text-right font-medium">Costo</th>
                    <th className="px-2 py-1.5 text-right font-medium">Margen</th>
                    <th className="px-2 py-1.5 text-right font-medium">Food cost</th>
                  </tr>
                </thead>
                <tbody>
                  {combis.data.data.combinaciones.map((c, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1.5">{c.opciones.map((o) => o.nombre).join(' · ') || 'Precio base'}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{formatMoney(c.precio)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {formatMoney(c.costo)}{c.costo_incompleto && <span className="text-red-600" title="Costo incompleto"> *</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{formatMoney(c.margen)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold" style={{ color: c.food_cost != null ? getFoodCostColor(c.food_cost) : undefined }}>
                        {c.food_cost != null ? formatPercent(c.food_cost) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-danger">{(combis.error as Error)?.message || 'No se pudo calcular'}</p>
        )}
      </Modal>
    </div>
  );
}
