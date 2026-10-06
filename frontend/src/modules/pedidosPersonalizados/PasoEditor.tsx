import { Fragment, useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus, ChevronRight, Library } from 'lucide-react';
import clsx from 'clsx';
import NumericInput from '../../components/common/NumericInput';
import { formatMoney } from '../../utils/formatters';
import RecetaEditor from './RecetaEditor';
import { opcionVacia, refOpcion, textoCosto } from './utils';
import type { Grupo, OpcionEditor, PasoEditor as Paso } from './types';


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
}

export default function PasoEditor({ paso, indice, total, anteriores, grupos, onChange, onMover, onBorrar, onBorrarOpcion }: Props) {
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

  return (
    <div className="border border-gray-200 rounded-xl bg-white">
      {/* Cabecera del paso */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50/60 rounded-t-xl">
        <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">{indice + 1}</span>
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
      </div>

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
          <div className="border border-blue-100 rounded-lg overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="bg-blue-50/60 text-xs text-text-muted">
                  <th className="px-2 py-1.5 text-left font-medium">Del grupo "{grupo.nombre}"</th>
                  <th className="px-2 py-1.5 text-right font-medium">Precio grupo</th>
                  <th className="px-2 py-1.5 text-right font-medium w-28">Precio acá</th>
                  <th className="px-2 py-1.5 text-center font-medium w-16">Ocultar</th>
                </tr>
              </thead>
              <tbody>
                {grupo.opciones.filter((o) => o.activo).map((o) => {
                  const aj = paso.ajustes.find((a) => a.opcion_id === o.id);
                  return (
                    <tr key={o.id} className={clsx('border-t border-gray-100', aj?.oculto && 'opacity-40')}>
                      <td className="px-2 py-1">{o.nombre}</td>
                      <td className="px-2 py-1 text-right font-mono text-xs">{formatMoney(o.precio)}</td>
                      <td className="px-2 py-1">
                        <NumericInput value={aj?.precio ?? 0} placeholder={String(o.precio)}
                          onChange={(v) => setAjuste(o.id!, { precio: v > 0 ? v : null })}
                          className="w-full px-2 py-1 text-sm text-right border border-gray-300 rounded" />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={!!aj?.oculto} onChange={(e) => setAjuste(o.id!, { oculto: e.target.checked })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Opciones propias */}
        {paso.opciones.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-text-muted">
                  <th className="w-12"></th>
                  <th className="px-2 py-1.5 text-left font-medium">Opción</th>
                  <th className="px-2 py-1.5 text-right font-medium w-40">Precio</th>
                  <th className="px-2 py-1.5 text-right font-medium w-20" title="Peso que aporta al producto (ej. el tamaño de la torta)">Peso kg</th>
                  {anteriores.length > 0 && <th className="px-2 py-1.5 text-left font-medium w-44" title="Solo aparece si se eligió esta otra opción antes">Solo si eligió</th>}
                  <th className="px-2 py-1.5 text-right font-medium w-28">Costo</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {paso.opciones.map((o, i) => {
                  const r = refOpcion(o);
                  const abiertaEsta = abierta === r;
                  return (
                    <Fragment key={r}>
                      <tr className={clsx('border-t border-gray-100', !o.activo && 'opacity-50')}>
                        <td className="pl-1">
                          <div className="flex flex-col">
                            <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="text-text-muted disabled:opacity-20"><ChevronUp size={12} /></button>
                            <button type="button" disabled={i === paso.opciones.length - 1} onClick={() => mover(i, 1)} className="text-text-muted disabled:opacity-20"><ChevronDown size={12} /></button>
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <input value={o.nombre} onChange={(e) => setOpcion(r, { nombre: e.target.value })} placeholder="Nombre"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex gap-1">
                            <NumericInput value={o.precio} onChange={(v) => setOpcion(r, { precio: v })}
                              className="w-full min-w-0 px-2 py-1 text-sm text-right border border-gray-300 rounded" />
                            <select value={o.precio_modo} onChange={(e) => setOpcion(r, { precio_modo: e.target.value as OpcionEditor['precio_modo'] })}
                              className="px-1 py-1 text-xs border border-gray-300 rounded" title="Fijo: suma este precio. Por kg: precio x peso del producto">
                              <option value="fijo">fijo</option>
                              <option value="por_kg">/ kg</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <NumericInput value={o.peso_kg ?? 0} step="0.001" onChange={(v) => setOpcion(r, { peso_kg: v > 0 ? v : null })}
                            className="w-full px-2 py-1 text-sm text-right border border-gray-300 rounded" placeholder="—" />
                        </td>
                        {anteriores.length > 0 && (
                          <td className="px-2 py-1">
                            <select value={o.depende_de == null ? '' : String(o.depende_de)}
                              onChange={(e) => setOpcion(r, { depende_de: e.target.value || null })}
                              className="w-full px-1 py-1 text-xs border border-gray-300 rounded">
                              <option value="">Siempre</option>
                              {anteriores.map((a) => <option key={a.ref} value={a.ref}>{a.etiqueta}</option>)}
                            </select>
                          </td>
                        )}
                        <td className="px-2 py-1 text-right">
                          <button type="button" onClick={() => setAbierta(abiertaEsta ? null : r)}
                            className={clsx('text-xs inline-flex items-center gap-0.5 hover:underline', o.receta.length ? 'text-text-primary font-mono' : 'text-primary')}>
                            {textoCosto(o.receta) || 'Receta'}
                            <ChevronRight size={12} className={clsx('transition-transform', abiertaEsta && 'rotate-90')} />
                          </button>
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center justify-end gap-1">
                            <input type="checkbox" checked={o.activo} onChange={(e) => setOpcion(r, { activo: e.target.checked })} title="Activa" />
                            <button type="button" onClick={() => onBorrarOpcion(r)} className="p-1 text-text-muted hover:text-danger" title="Borrar opción"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                      {abiertaEsta && (
                        <tr className="bg-gray-50/70">
                          <td></td>
                          <td colSpan={anteriores.length > 0 ? 6 : 5} className="px-2 py-2 space-y-2">
                            <input value={o.descripcion || ''} onChange={(e) => setOpcion(r, { descripcion: e.target.value || null })}
                              placeholder="Descripción (opcional, la ve el cliente)" className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
                            <input value={o.etiquetas.join(', ')} onChange={(e) => setOpcion(r, { etiquetas: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                              placeholder="Etiquetas separadas por coma (SIN TACC, KETO...)" className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
                            <RecetaEditor lineas={o.receta} onChange={(receta) => setOpcion(r, { receta })} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
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
    </div>
  );
}
