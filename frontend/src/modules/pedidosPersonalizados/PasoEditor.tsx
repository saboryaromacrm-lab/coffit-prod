import { Fragment, useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus, ChevronRight, Library } from 'lucide-react';
import clsx from 'clsx';
import NumericInput from '../../components/common/NumericInput';
import { formatMoney } from '../../utils/formatters';
import RecetaEditor from './RecetaEditor';
import EtiquetasInput from './EtiquetasInput';
import { opcionVacia, refOpcion, textoCosto } from './utils';
import type { Grupo, OpcionEditor, PasoEditor as Paso } from './types';

// Un color por paso (se repiten si hay mas de 6) para ubicarse de un vistazo.
const COLORES = [
  { borde: 'border-l-orange-400', badge: 'bg-orange-100 text-orange-700', cabecera: 'bg-orange-50/70' },
  { borde: 'border-l-sky-400', badge: 'bg-sky-100 text-sky-700', cabecera: 'bg-sky-50/70' },
  { borde: 'border-l-violet-400', badge: 'bg-violet-100 text-violet-700', cabecera: 'bg-violet-50/70' },
  { borde: 'border-l-emerald-400', badge: 'bg-emerald-100 text-emerald-700', cabecera: 'bg-emerald-50/70' },
  { borde: 'border-l-rose-400', badge: 'bg-rose-100 text-rose-700', cabecera: 'bg-rose-50/70' },
  { borde: 'border-l-amber-400', badge: 'bg-amber-100 text-amber-800', cabecera: 'bg-amber-50/70' },
];

// Resumen para el paso colapsado: cuantas opciones, rango de precios y
// cuantas tienen receta (para ver que falta costear sin abrirlo).
function resumen(paso: Paso, grupo: Grupo | undefined) {
  const activas = paso.opciones.filter((o) => o.activo);
  const partes: string[] = [];
  if (activas.length) partes.push(`${activas.length} opci${activas.length === 1 ? 'ón' : 'ones'}`);
  if (grupo) partes.push(`grupo ${grupo.nombre}`);
  const precios = activas.filter((o) => o.precio > 0).map((o) => o.precio);
  if (precios.length) {
    const [min, max] = [Math.min(...precios), Math.max(...precios)];
    const porKg = activas.some((o) => o.precio_modo === 'por_kg') ? '/kg' : '';
    partes.push(min === max ? `${formatMoney(min)}${porKg}` : `${formatMoney(min)} a ${formatMoney(max)}${porKg}`);
  }
  if (activas.length) partes.push(`${activas.filter((o) => o.receta.length).length}/${activas.length} con receta`);
  return partes.join(' · ');
}

// Texto que explica la regla del paso tal como la va a vivir el cliente.
function reglaEnPalabras(min: number, max: number) {
  if (min === 0) return max === 1 ? 'Opcional, puede elegir 1' : `Opcional, hasta ${max}`;
  if (min === max) return min === 1 ? 'Obligatorio, elige 1' : `Obligatorio, elige ${min}`;
  return `Elige entre ${min} y ${max}`;
}

interface Props {
  paso: Paso;
  indice: number;
  total: number;
  // Opciones de los pasos anteriores: de esas puede depender una opcion.
  anteriores: { ref: string; etiqueta: string }[];
  grupos: Grupo[];
  onChange: (p: Paso) => void;
  onMover: (delta: -1 | 1) => void;
  onBorrar: () => void;
  onBorrarOpcion: (ref: string) => void;
  abierto: boolean;
  onToggle: () => void;
  sinPeso: boolean; // el producto no tiene ninguna opcion con peso
}

export default function PasoEditor({ paso, indice, total, anteriores, grupos, onChange, onMover, onBorrar, onBorrarOpcion, abierto, onToggle, sinPeso }: Props) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const grupo = grupos.find((g) => g.id === paso.grupo_id);

  const set = (cambios: Partial<Paso>) => onChange({ ...paso, ...cambios });
  const setOpcion = (r: string, cambios: Partial<OpcionEditor>) =>
    set({ opciones: paso.opciones.map((o) => (refOpcion(o) === r ? { ...o, ...cambios } : o)) });
  const setAjuste = (opcionId: number, cambios: { precio?: number | null; oculto?: boolean }) => {
    const actual = paso.ajustes.find((a) => a.opcion_id === opcionId) || { opcion_id: opcionId, precio: null, oculto: false };
    const nuevo = { ...actual, ...cambios };
    const resto = paso.ajustes.filter((a) => a.opcion_id !== opcionId);
    set({ ajustes: nuevo.precio == null && !nuevo.oculto ? resto : [...resto, nuevo] });
  };
  const mover = (i: number, delta: -1 | 1) => {
    const ops = [...paso.opciones];
    [ops[i], ops[i + delta]] = [ops[i + delta], ops[i]];
    set({ opciones: ops });
  };

  const hayPorKg = paso.opciones.some((o) => o.precio_modo === 'por_kg');
  const color = COLORES[indice % COLORES.length];

  return (
    <div className={clsx('border border-gray-200 border-l-4 rounded-xl bg-white', color.borde)}>
      {/* Cabecera del paso */}
      <div className={clsx('flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-tr-xl', color.cabecera, abierto ? 'border-b border-gray-100' : 'rounded-br-xl')}>
        <button type="button" onClick={onToggle} className="p-0.5 -ml-1 text-text-muted hover:text-text-primary" title={abierto ? 'Colapsar' : 'Ver opciones'}>
          <ChevronRight size={18} className={clsx('transition-transform', abierto && 'rotate-90')} />
        </button>
        <span className={clsx('w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0', color.badge)}>{indice + 1}</span>
        <input value={paso.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Nombre del paso (ej. Harina)"
          className="flex-1 min-w-[140px] px-2 py-1 text-sm font-semibold border border-gray-300 rounded-lg" />
        <div className="flex items-center gap-1 text-xs text-text-muted">
          mín
          <NumericInput value={paso.min_sel} step="1" onChange={(v) => set({ min_sel: Math.max(0, Math.round(v)), max_sel: Math.max(paso.max_sel, Math.round(v), 1) })}
            className="w-10 px-1 py-1 text-center border border-gray-300 rounded" placeholder="0" />
          máx
          <NumericInput value={paso.max_sel} step="1" onChange={(v) => set({ max_sel: Math.max(1, Math.round(v)) })}
            className="w-10 px-1 py-1 text-center border border-gray-300 rounded" placeholder="1" />
        </div>
        <span className="text-xs text-text-muted hidden sm:inline">{reglaEnPalabras(paso.min_sel, paso.max_sel)}</span>
        <div className="flex items-center ml-auto">
          <button type="button" disabled={indice === 0} onClick={() => onMover(-1)} className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30" title="Subir"><ChevronUp size={16} /></button>
          <button type="button" disabled={indice === total - 1} onClick={() => onMover(1)} className="p-1 text-text-muted hover:text-text-primary disabled:opacity-30" title="Bajar"><ChevronDown size={16} /></button>
          <button type="button" onClick={onBorrar} className="p-1 text-text-muted hover:text-danger" title="Borrar paso"><Trash2 size={15} /></button>
        </div>
        {!abierto && (
          <button type="button" onClick={onToggle} className="basis-full text-left text-xs text-text-muted pl-14 hover:text-text-primary">
            {resumen(paso, grupo) || 'Sin opciones todavía'}
          </button>
        )}
      </div>

      {abierto && (
        <div className="p-3 space-y-3">
          {/* Grupo de la biblioteca */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Library size={14} className="text-text-muted" />
            <span className="text-text-muted text-xs">Usar grupo de la biblioteca:</span>
            <select value={paso.grupo_id ?? ''} onChange={(e) => set({ grupo_id: e.target.value ? Number(e.target.value) : null, ajustes: [] })}
              className="px-2 py-1 text-sm border border-gray-300 rounded-lg">
              <option value="">Ninguno</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}{!g.activo ? ' (inactivo)' : ''}</option>)}
            </select>
          </div>

          {grupo && (
            <div className="border border-blue-100 rounded-lg text-sm">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50/60 rounded-t-lg text-xs text-text-muted font-medium">
                <span className="flex-1 min-w-0 truncate">Del grupo "{grupo.nombre}"</span>
                <span className="hidden sm:block w-24 text-right">Precio grupo</span>
                <span className="w-28 text-right">Precio acá</span>
                <span className="w-14 text-center">Ocultar</span>
              </div>
              {grupo.opciones.filter((o) => o.activo).map((o) => {
                const aj = paso.ajustes.find((a) => a.opcion_id === o.id);
                return (
                  <div key={o.id} className={clsx('flex items-center gap-2 px-2 py-1 border-t border-gray-100', aj?.oculto && 'opacity-40')}>
                    <span className="flex-1 min-w-0">
                      {o.nombre}
                      <span className="sm:hidden block text-xs text-text-muted font-mono">grupo {formatMoney(o.precio)}</span>
                    </span>
                    <span className="hidden sm:block w-24 text-right font-mono text-xs">{formatMoney(o.precio)}</span>
                    <NumericInput value={aj?.precio ?? 0} placeholder={String(o.precio)}
                      onChange={(v) => setAjuste(o.id!, { precio: v > 0 ? v : null })}
                      className="w-28 px-2 py-1 text-sm text-right border border-gray-300 rounded" />
                    <span className="w-14 text-center">
                      <input type="checkbox" checked={!!aj?.oculto} onChange={(e) => setAjuste(o.id!, { oculto: e.target.checked })} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Opciones propias. Manda el ancho de la caja (container query): con
              lugar, una fila por opcion con encabezado; angosta (celular o la
              columna del editor al lado del simulador), una tarjeta por opcion:
              nombre arriba, precio y peso, "solo si eligio" y la receta abajo
              (el order acomoda cada caso). */}
          {paso.opciones.length > 0 && (
            <div className="@container border border-gray-200 rounded-lg text-sm">
              <div className="hidden @3xl:flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-t-lg text-xs text-text-muted font-medium">
                <span className="w-4"></span>
                <span className="flex-1">Opción</span>
                <span className="w-40 text-right">Precio</span>
                <span className="w-20 text-right" title="Peso que aporta al producto (ej. el tamaño de la torta)">Peso kg</span>
                {anteriores.length > 0 && <span className="w-44" title="Solo aparece si se eligió esta otra opción antes">Solo si eligió</span>}
                <span className="w-28 text-right">Costo</span>
                <span className="w-14"></span>
              </div>
              {paso.opciones.map((o, i) => {
                const r = refOpcion(o);
                const abiertaEsta = abierta === r;
                return (
                  <Fragment key={r}>
                    <div className={clsx('flex flex-wrap @3xl:flex-nowrap items-center gap-x-2 gap-y-1.5 px-2 py-2 @3xl:py-1 border-t border-gray-100 @max-3xl:nth-2:border-t-0', !o.activo && 'opacity-50')}>
                      <div className="order-1 w-4 flex flex-col shrink-0">
                        <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="text-text-muted disabled:opacity-20" title="Subir"><ChevronUp size={12} /></button>
                        <button type="button" disabled={i === paso.opciones.length - 1} onClick={() => mover(i, 1)} className="text-text-muted disabled:opacity-20" title="Bajar"><ChevronDown size={12} /></button>
                      </div>
                      <input value={o.nombre} onChange={(e) => setOpcion(r, { nombre: e.target.value })} placeholder="Nombre"
                        className="order-2 flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 rounded" />
                      <div className="order-3 @3xl:order-7 w-14 flex items-center justify-end gap-1 shrink-0">
                        <input type="checkbox" checked={o.activo} onChange={(e) => setOpcion(r, { activo: e.target.checked })} title="Activa" />
                        <button type="button" onClick={() => onBorrarOpcion(r)} className="p-1 text-text-muted hover:text-danger" title="Borrar opción"><Trash2 size={14} /></button>
                      </div>
                      <div className="order-4 basis-full h-0 @3xl:hidden" />
                      <label className="order-5 @3xl:order-3 flex-1 @3xl:flex-none @3xl:w-40 flex items-center gap-1 min-w-0">
                        <span className="@3xl:hidden text-xs text-text-muted">Precio</span>
                        <NumericInput value={o.precio} onChange={(v) => setOpcion(r, { precio: v })}
                          className="w-full min-w-0 px-2 py-1 text-sm text-right border border-gray-300 rounded" />
                        <select value={o.precio_modo} onChange={(e) => setOpcion(r, { precio_modo: e.target.value as OpcionEditor['precio_modo'] })}
                          className="px-1 py-1 text-xs border border-gray-300 rounded" title="Fijo: suma este precio. Por kg: precio x peso del producto">
                          <option value="fijo">fijo</option>
                          <option value="por_kg">/ kg</option>
                        </select>
                      </label>
                      <label className="order-6 @3xl:order-4 w-28 @3xl:w-20 flex items-center gap-1">
                        <span className="@3xl:hidden text-xs text-text-muted whitespace-nowrap">Peso kg</span>
                        <NumericInput value={o.peso_kg ?? 0} step="0.001" onChange={(v) => setOpcion(r, { peso_kg: v > 0 ? v : null })}
                          className="w-full min-w-0 px-2 py-1 text-sm text-right border border-gray-300 rounded" placeholder="—" />
                      </label>
                      {anteriores.length > 0 && (
                        <label className="order-7 @3xl:order-5 basis-full @3xl:basis-auto @3xl:w-44 flex items-center gap-1 min-w-0">
                          <span className="@3xl:hidden text-xs text-text-muted whitespace-nowrap">Solo si eligió</span>
                          <select value={o.depende_de == null ? '' : String(o.depende_de)}
                            onChange={(e) => setOpcion(r, { depende_de: e.target.value || null })}
                            className="w-full min-w-0 px-1 py-1 text-xs border border-gray-300 rounded">
                            <option value="">Siempre</option>
                            {anteriores.map((a) => <option key={a.ref} value={a.ref}>{a.etiqueta}</option>)}
                          </select>
                        </label>
                      )}
                      <button type="button" onClick={() => setAbierta(abiertaEsta ? null : r)}
                        className={clsx('order-8 @3xl:order-6 @max-3xl:basis-full @3xl:w-28 text-xs inline-flex items-center justify-end gap-0.5 hover:underline',
                          o.receta.length ? 'text-text-primary font-mono' : 'text-primary')}>
                        {textoCosto(o.receta) || 'Receta'}
                        <ChevronRight size={12} className={clsx('transition-transform', abiertaEsta && 'rotate-90')} />
                      </button>
                    </div>
                    {abiertaEsta && (
                      <div className="bg-gray-50/70 px-2 @3xl:pl-8 py-2 space-y-2">
                        <input value={o.descripcion || ''} onChange={(e) => setOpcion(r, { descripcion: e.target.value || null })}
                          placeholder="Descripción (opcional, la ve el cliente)" className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
                        <EtiquetasInput value={o.etiquetas} onChange={(etiquetas) => setOpcion(r, { etiquetas })}
                          placeholder="Etiquetas separadas por coma (SIN TACC, KETO...)" className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
                        <RecetaEditor lineas={o.receta} onChange={(receta) => setOpcion(r, { receta })}
                          sinPeso={sinPeso}
                          sugerencia={{ gramos: o.peso_kg ? Math.round(o.peso_kg * 1000) : undefined, porKg: o.precio_modo === 'por_kg' }} />
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => set({ opciones: [...paso.opciones, opcionVacia()] })}
              className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              <Plus size={14} /> Opción
            </button>
            {hayPorKg && <span className="text-xs text-text-muted">Precio por kg: necesita un paso con peso (tamaño).</span>}
          </div>
        </div>
      )}
    </div>
  );
}
