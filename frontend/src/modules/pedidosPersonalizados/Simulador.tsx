import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RotateCcw, ListOrdered } from 'lucide-react';
import clsx from 'clsx';
import { formatMoney, formatPercent } from '../../utils/formatters';
import { getFoodCostColor } from '../../utils/calculators';
import Modal from '../../components/common/Modal';
import { ppApi } from './api';
import { refOpcion } from './utils';
import type { Simulando } from './useSimulacion';
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

// Columnas de la tabla de margenes: 4 cifras en el celular, 5 columnas desde sm.
const FILA_COMBI = 'grid grid-cols-4 sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_6.5rem_5rem] gap-x-2 gap-y-1 px-2 items-baseline';

// Cifra de la tabla de margenes: en el celular lleva su etiqueta arriba.
function Cifra({ etiqueta, color, children }: { etiqueta: string; color?: string; children: React.ReactNode }) {
  return (
    <span className="sm:text-right font-mono text-xs sm:text-sm" style={color ? { color, fontWeight: 600 } : undefined}>
      <span className="sm:hidden block font-sans text-[11px] text-text-muted font-normal">{etiqueta}</span>
      {children}
    </span>
  );
}

interface Props {
  producto: ProductoEditor;
  grupos: Grupo[];
  simulando: Simulando;
}

// Elige las opciones; el precio y el costo de lo elegido los muestra el
// resumen de rentabilidad en los datos del producto.
export default function Simulador({ producto, grupos, simulando }: Props) {
  const { sim, isFetching, error, elegidas, setElegidas, borradorJson } = simulando;
  const [verCombinaciones, setVerCombinaciones] = useState(false);
  const info = useMemo(() => indexarOpciones(producto, grupos), [producto, grupos]);

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

  return (
    <div className="bg-white border border-gray-200 border-t-4 border-t-indigo-400 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-indigo-700 flex items-center gap-2">
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

      {error && <p className="text-sm text-danger">{error.message}</p>}

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

      <Modal isOpen={verCombinaciones} onClose={() => setVerCombinaciones(false)} title={`Márgenes de ${producto.nombre || 'el producto'}`} size="xl">
        {combis.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
        ) : combis.data?.data ? (
          <>
            <p className="text-xs text-text-muted mb-3">
              Todas las combinaciones de los pasos obligatorios (sin extras opcionales), de la que menos deja a la que más.
              {combis.data.data.truncado && ' Hay demasiadas: se muestran las primeras 500.'}
            </p>
            {/* Desde sm una fila con columnas; en el celular la combinacion arriba
                y los cuatro numeros abajo, cada uno con su etiqueta. */}
            <div className="text-sm">
              <div className={clsx(FILA_COMBI, 'hidden sm:grid bg-gray-50 text-xs text-text-muted font-medium py-1.5')}>
                <span>Combinación</span>
                <span className="text-right">Precio</span><span className="text-right">Costo</span>
                <span className="text-right">Margen</span><span className="text-right">Food cost</span>
              </div>
              {combis.data.data.combinaciones.map((c, i) => (
                <div key={i} className={clsx(FILA_COMBI, 'py-2 sm:py-1.5 border-t border-gray-100 max-sm:nth-2:border-t-0')}>
                  <span className="col-span-4 sm:col-span-1">{c.opciones.map((o) => o.nombre).join(' · ') || 'Precio base'}</span>
                  <Cifra etiqueta="Precio">{formatMoney(c.precio)}</Cifra>
                  <Cifra etiqueta="Costo">
                    {formatMoney(c.costo)}{c.costo_incompleto && <span className="text-red-600" title="Costo incompleto"> *</span>}
                  </Cifra>
                  <Cifra etiqueta="Margen">{formatMoney(c.margen)}</Cifra>
                  <Cifra etiqueta="FC" color={c.food_cost != null ? getFoodCostColor(c.food_cost) : undefined}>
                    {c.food_cost != null ? formatPercent(c.food_cost) : '—'}
                  </Cifra>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-danger">{(combis.error as Error)?.message || 'No se pudo calcular'}</p>
        )}
      </Modal>
    </div>
  );
}
