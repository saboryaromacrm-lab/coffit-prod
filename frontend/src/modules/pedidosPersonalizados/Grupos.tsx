import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2, ChevronRight, Loader2, Library } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import NumericInput from '../../components/common/NumericInput';
import EmptyState from '../../components/common/EmptyState';
import { formatMoney } from '../../utils/formatters';
import RecetaEditor from './RecetaEditor';
import { nuevaKey, refOpcion, textoCosto } from './utils';
import { ppApi } from './api';
import type { Grupo, OpcionGrupo } from './types';

// ============================================================================
// BIBLIOTECA DE GRUPOS: listas de opciones que se cargan una vez y se usan en
// varios productos (ej. Toppings). Cada paso que usa un grupo puede cambiarle
// el precio a una opcion u ocultarla, sin tocar el grupo.
// ============================================================================

const opcionVacia = (): OpcionGrupo => ({ key: nuevaKey(), nombre: '', precio: 0, etiquetas: [], activo: true, receta: [] });

export default function Grupos() {
  const { data, isLoading } = useQuery({ queryKey: ['pp-grupos'], queryFn: ppApi.getGrupos });
  const [nuevo, setNuevo] = useState(false);
  const grupos = data?.data || [];

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted max-w-xl">
          Opciones que se repiten en varios productos. En cada paso podés cambiarle el precio a una opción u ocultarla.
        </p>
        {!nuevo && <Button size="sm" onClick={() => setNuevo(true)}><Plus size={14} /> Grupo</Button>}
      </div>
      {nuevo && (
        <GrupoCard inicial={{ nombre: '', activo: true, opciones: [opcionVacia()] }} onListo={() => setNuevo(false)} />
      )}
      {grupos.length === 0 && !nuevo && (
        <EmptyState icon={<Library size={48} className="mb-3 opacity-40" />} message="Sin grupos todavía: creá uno para reutilizar opciones entre productos." />
      )}
      {grupos.map((g) => <GrupoCard key={g.id} inicial={g} />)}
    </div>
  );
}

// Resumen del grupo colapsado: opciones, rango de precios y cuantas tienen receta.
function resumen(g: Grupo) {
  const activas = g.opciones.filter((o) => o.activo);
  if (!activas.length) return 'Sin opciones todavía';
  const precios = activas.map((o) => o.precio);
  const [min, max] = [Math.min(...precios), Math.max(...precios)];
  return [
    `${activas.length} opci${activas.length === 1 ? 'ón' : 'ones'}`,
    min === max ? formatMoney(min) : `${formatMoney(min)} a ${formatMoney(max)}`,
    `${activas.filter((o) => o.receta.length).length}/${activas.length} con receta`,
  ].join(' · ');
}

function GrupoCard({ inicial, onListo }: { inicial: Grupo; onListo?: () => void }) {
  const qc = useQueryClient();
  const [grupo, setGrupo] = useState(inicial);
  const [sucio, setSucio] = useState(!inicial.id);
  const [abierta, setAbierta] = useState<string | null>(null);
  // Arranca colapsado (salvo un grupo nuevo, que hay que cargar).
  const [expandido, setExpandido] = useState(!inicial.id);
  const [confirmar, setConfirmar] = useState(false);

  const cambiar = (cambios: Partial<Grupo>) => { setGrupo((g) => ({ ...g, ...cambios })); setSucio(true); };
  const setOpcion = (r: string, cambios: Partial<OpcionGrupo>) =>
    cambiar({ opciones: grupo.opciones.map((o) => (refOpcion(o) === r ? { ...o, ...cambios } : o)) });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['pp-grupos'] });
    qc.invalidateQueries({ queryKey: ['pp-productos'] });
  };

  const guardar = useMutation({
    mutationFn: () => ppApi.guardarGrupo(grupo),
    onSuccess: (res) => {
      refrescar();
      setSucio(false);
      toast.success('Grupo guardado');
      if (onListo) onListo(); else setGrupo(res.data);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const borrar = useMutation({
    mutationFn: () => ppApi.borrarGrupo(grupo.id!),
    onSuccess: () => { refrescar(); toast.success('Grupo borrado'); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="bg-white border border-gray-200 border-l-4 border-l-sky-400 rounded-xl">
      <div className={clsx('flex flex-wrap items-center gap-2 px-3 py-2.5 bg-sky-50/70 rounded-tr-xl', expandido ? 'border-b border-gray-100' : 'rounded-br-xl')}>
        <button type="button" onClick={() => setExpandido(!expandido)} className="p-0.5 -ml-1 text-text-muted hover:text-text-primary" title={expandido ? 'Colapsar' : 'Ver opciones'}>
          <ChevronRight size={18} className={clsx('transition-transform', expandido && 'rotate-90')} />
        </button>
        <input value={grupo.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="Nombre del grupo"
          className="flex-1 min-w-[160px] px-2 py-1 text-sm font-semibold border border-gray-300 rounded-lg" />
        {grupo.id && <span className="text-xs text-text-muted">Usado en {grupo.usado_en || 0} paso{grupo.usado_en === 1 ? '' : 's'}</span>}
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={grupo.activo} onChange={(e) => cambiar({ activo: e.target.checked })} /> Activo
        </label>
        {grupo.id
          ? <Button variant="ghost" size="sm" onClick={() => setConfirmar(true)}><Trash2 size={14} /></Button>
          : <Button variant="ghost" size="sm" onClick={onListo}>Cancelar</Button>}
        <Button size="sm" onClick={() => guardar.mutate()} loading={guardar.isPending} disabled={!sucio || !grupo.nombre.trim()}>
          <Save size={14} /> Guardar
        </Button>
        {!expandido && (
          <button type="button" onClick={() => setExpandido(true)} className="basis-full text-left text-xs text-text-muted pl-7 hover:text-text-primary">
            {resumen(grupo)}
          </button>
        )}
      </div>

      {expandido && (
        <div className="p-3 space-y-2">
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-text-muted">
                  <th className="px-2 py-1.5 text-left font-medium">Opción</th>
                  <th className="px-2 py-1.5 text-right font-medium w-28">Precio</th>
                  <th className="px-2 py-1.5 text-right font-medium w-28">Costo</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {grupo.opciones.map((o) => {
                  const r = refOpcion(o);
                  return (
                    <Fragment key={r}>
                      <tr className={clsx('border-t border-gray-100', !o.activo && 'opacity-50')}>
                        <td className="px-2 py-1">
                          <input value={o.nombre} onChange={(e) => setOpcion(r, { nombre: e.target.value })} placeholder="Nombre"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
                        </td>
                        <td className="px-2 py-1">
                          <NumericInput value={o.precio} onChange={(v) => setOpcion(r, { precio: v })}
                            className="w-full px-2 py-1 text-sm text-right border border-gray-300 rounded" />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button type="button" onClick={() => setAbierta(abierta === r ? null : r)}
                            className={clsx('text-xs inline-flex items-center gap-0.5 hover:underline', o.receta.length ? 'font-mono' : 'text-primary')}>
                            {textoCosto(o.receta) || 'Receta'}
                            <ChevronRight size={12} className={clsx('transition-transform', abierta === r && 'rotate-90')} />
                          </button>
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center justify-end gap-1">
                            <input type="checkbox" checked={o.activo} onChange={(e) => setOpcion(r, { activo: e.target.checked })} title="Activa" />
                            <button type="button" onClick={() => cambiar({ opciones: grupo.opciones.filter((x) => refOpcion(x) !== r) })}
                              className="p-1 text-text-muted hover:text-danger" title="Borrar opción"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                      {abierta === r && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={4} className="px-2 py-2">
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
          <button type="button" onClick={() => cambiar({ opciones: [...grupo.opciones, opcionVacia()] })}
            className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            <Plus size={14} /> Opción
          </button>
        </div>
      )}

      <ConfirmDialog isOpen={confirmar} onClose={() => setConfirmar(false)} onConfirm={() => borrar.mutate()} loading={borrar.isPending}
        title="Borrar grupo"
        message={grupo.usado_en
          ? `"${grupo.nombre}" se usa en ${grupo.usado_en} paso(s): esos pasos se quedan sin estas opciones.`
          : `Se borra "${grupo.nombre}" con sus opciones.`} />
    </div>
  );
}
