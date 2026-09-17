import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Pencil, Calendar, CalendarDays, Copy, X, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { planSemanalApi } from '../api/planSemanal';
import { produccionApi } from '../api/produccion';
import type { PlanSemanalData, PlanSemanalItem, PlanSemanalInput, ProductoCatalogo } from '../types';
import LoadingSpinner from '../components/common/LoadingSpinner';

// =============================================================================
// HELPERS de fecha (zona horaria local segura)
// =============================================================================
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

// Devuelve YYYY-MM-DD del lunes de la semana que contiene la fecha dada (zona local).
function lunesDeSemana(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().substring(0, 10);
}

function fechaDeDia(lunesISO: string, diaSemana: number): string {
  // diaSemana JS: 0=Dom, 1=Lun, ..., 6=Sab
  // Lunes ISO es el dia 1 de la semana, queremos sumar (diaSemana === 0 ? 6 : diaSemana - 1)
  const offset = diaSemana === 0 ? 6 : diaSemana - 1;
  const [y, m, d] = lunesISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + offset);
  return date.toISOString().substring(0, 10);
}

function formatFechaCorta(fechaISO: string): string {
  const [, m, d] = fechaISO.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =============================================================================
// MAIN
// =============================================================================
export default function PlanSemanal() {
  const [modo, setModo] = useState<'plantilla' | 'semana'>('plantilla');
  const [refDate, setRefDate] = useState<string>(todayISO());
  const [editingItem, setEditingItem] = useState<PlanSemanalItem | null>(null);
  const [creating, setCreating] = useState<{ dia: number; fecha: string | null } | null>(null);
  const [copyingFrom, setCopyingFrom] = useState<{ dia: number; fecha: string | null } | null>(null);

  const lunes = useMemo(() => lunesDeSemana(refDate), [refDate]);

  const queryParams = useMemo(
    () => (modo === 'plantilla' ? { modo: 'plantilla' as const } : { modo: 'semana' as const, desde: refDate }),
    [modo, refDate]
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['plan-semanal', modo, modo === 'semana' ? lunes : 'plantilla'],
    queryFn: () => planSemanalApi.get(queryParams),
  });

  const plan: PlanSemanalData | null = (data?.data as PlanSemanalData) || null;

  return (
    <div className="space-y-4">
      {/* Toggle modo + selector semana */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap w-full sm:w-auto bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => setModo('plantilla')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                modo === 'plantilla' ? 'bg-white shadow-sm text-primary' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Calendar size={16} /> Plantilla recurrente
            </button>
            <button
              onClick={() => setModo('semana')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                modo === 'semana' ? 'bg-white shadow-sm text-primary' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <CalendarDays size={16} /> Semana especifica
            </button>
          </div>

          {modo === 'semana' && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-text-muted">Semana del</label>
              <input
                type="date"
                value={refDate}
                onChange={(e) => setRefDate(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
              <span className="text-xs text-text-muted">
                ({lunes} a {fechaDeDia(lunes, 0)})
              </span>
            </div>
          )}
        </div>

        <div className="text-xs text-text-muted">
          {modo === 'plantilla' ? (
            <>📅 <strong>Plantilla recurrente:</strong> los items que cargues aca se repiten todas las semanas.</>
          ) : (
            <>📆 <strong>Semana especifica:</strong> ves la plantilla recurrente + items puntuales para esta semana.
              Los items puntuales aparecen marcados con un borde naranja.</>
          )}
        </div>
      </div>

      {isLoading || !plan ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
          {/* 7 columnas: Lun, Mar, Mie, Jue, Vie, Sab, Dom (orden visual) */}
          {[1, 2, 3, 4, 5, 6, 0].map((diaIdx) => {
            const items = plan.porDia[diaIdx] || [];
            const fechaDelDia = modo === 'semana' ? fechaDeDia(lunes, diaIdx) : null;
            const isToday = fechaDelDia === todayISO();

            return (
              <DiaColumna
                key={diaIdx}
                diaIdx={diaIdx}
                items={items}
                fechaDelDia={fechaDelDia}
                isToday={isToday}
                onAdd={() => setCreating({ dia: diaIdx, fecha: fechaDelDia })}
                onEdit={(it) => setEditingItem(it)}
                onCopy={() => setCopyingFrom({ dia: diaIdx, fecha: fechaDelDia })}
              />
            );
          })}
        </div>
      )}

      {/* Modal de creacion */}
      {creating && (
        <ItemModal
          mode="create"
          dia={creating.dia}
          fecha={creating.fecha}
          onClose={() => setCreating(null)}
          onSuccess={() => {
            setCreating(null);
            refetch();
          }}
        />
      )}

      {/* Modal de edicion */}
      {editingItem && (
        <ItemModal
          mode="edit"
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSuccess={() => {
            setEditingItem(null);
            refetch();
          }}
        />
      )}

      {/* Modal de copiar dia */}
      {copyingFrom && plan && (
        <CopyDayModal
          fromDia={copyingFrom.dia}
          fromFecha={copyingFrom.fecha}
          modo={modo}
          lunes={lunes}
          plan={plan}
          onClose={() => setCopyingFrom(null)}
          onSuccess={() => {
            setCopyingFrom(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// COLUMNA DE UN DIA
// =============================================================================
function DiaColumna({
  diaIdx,
  items,
  fechaDelDia,
  isToday,
  onAdd,
  onEdit,
  onCopy,
}: {
  diaIdx: number;
  items: PlanSemanalItem[];
  fechaDelDia: string | null;
  isToday: boolean;
  onAdd: () => void;
  onEdit: (it: PlanSemanalItem) => void;
  onCopy: () => void;
}) {
  const queryClient = useQueryClient();
  const deleteMut = useMutation({
    mutationFn: (id: number) => planSemanalApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan-semanal'] });
      toast.success('Item eliminado');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div
      className={`bg-white rounded-xl border-2 ${
        isToday ? 'border-primary' : 'border-gray-100'
      } overflow-hidden flex flex-col`}
    >
      {/* Header */}
      <div className={`px-3 py-2 ${isToday ? 'bg-primary/5' : 'bg-gray-50'} border-b border-gray-100`}>
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-sm font-bold ${isToday ? 'text-primary' : 'text-text-primary'}`}>
              {DIAS_CORTOS[diaIdx]}
            </div>
            {fechaDelDia && (
              <div className="text-[10px] text-text-muted">{formatFechaCorta(fechaDelDia)}</div>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={onCopy}
              disabled={items.length === 0}
              className="p-1.5 text-text-muted hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Copiar este dia a otro"
            >
              <Copy size={13} />
            </button>
            <button
              onClick={onAdd}
              className="p-1.5 text-text-muted hover:text-primary"
              title="Agregar item"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 p-2 space-y-1.5 min-h-[80px]">
        {items.length === 0 ? (
          <button
            onClick={onAdd}
            className="w-full py-3 text-xs text-text-muted border-2 border-dashed border-gray-200 rounded hover:border-primary hover:text-primary transition-colors"
          >
            + Agregar
          </button>
        ) : (
          items.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              onEdit={() => onEdit(it)}
              onDelete={() => {
                if (confirm(`Eliminar "${it.item_nombre}"?`)) deleteMut.mutate(it.id);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// =============================================================================
// CARD DE UN ITEM
// =============================================================================
function ItemCard({
  item,
  onEdit,
  onDelete,
}: {
  item: PlanSemanalItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const esPuntual = !item.es_plantilla;
  return (
    <div
      className={`group rounded-md border p-2 text-xs ${
        esPuntual ? 'border-orange-300 bg-orange-50/40' : 'border-gray-200 bg-white'
      } hover:shadow-sm transition-shadow`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-text-primary truncate">{item.item_nombre}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono font-bold text-primary">x{Number(item.cantidad)}</span>
            <span
              className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                item.item_tipo === 'producto' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {item.item_tipo === 'producto' ? 'Prod.' : 'Subr.'}
            </span>
            {esPuntual && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-orange-200 text-orange-800 font-medium">Puntual</span>
            )}
          </div>
          {item.observacion && (
            <div className="text-[10px] text-text-muted mt-0.5 italic line-clamp-2">{item.observacion}</div>
          )}
        </div>
        <div className="flex flex-col gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onEdit} className="p-1 text-gray-400 hover:text-primary" title="Editar">
            <Pencil size={11} />
          </button>
          <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-600" title="Eliminar">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MODAL CREAR / EDITAR ITEM
// =============================================================================
function ItemModal({
  mode,
  dia,
  fecha,
  item,
  onClose,
  onSuccess,
}: {
  mode: 'create' | 'edit';
  dia?: number;
  fecha?: string | null;
  item?: PlanSemanalItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const initialDia = mode === 'edit' && item ? item.dia_semana : (dia ?? 1);
  const initialFecha = mode === 'edit' && item ? item.fecha : (fecha ?? null);

  const [form, setForm] = useState<PlanSemanalInput>({
    dia_semana: initialDia,
    item_tipo: item?.item_tipo || 'producto',
    item_id: item?.item_id ?? null,
    item_nombre: item?.item_nombre || '',
    cantidad: item?.cantidad || 1,
    observacion: item?.observacion || '',
    fecha: initialFecha,
  });

  const [search, setSearch] = useState(item?.item_nombre || '');
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: catalogoData } = useQuery({
    queryKey: ['produccion-catalogo'],
    queryFn: produccionApi.getCatalogo,
  });
  const catalogo: ProductoCatalogo[] = catalogoData?.data || [];

  // Filtrar segun tipo + busqueda
  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return catalogo.filter((c) => c.tipo === form.item_tipo && (term === '' || c.nombre.toLowerCase().includes(term)));
  }, [catalogo, search, form.item_tipo]);

  const createMut = useMutation({
    mutationFn: () => planSemanalApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan-semanal'] });
      toast.success('Item agregado');
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => planSemanalApi.update(item!.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan-semanal'] });
      toast.success('Item actualizado');
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit() {
    if (!form.item_nombre.trim()) {
      toast.error('Selecciona un producto o subreceta');
      return;
    }
    if (form.cantidad <= 0) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }
    if (mode === 'create') createMut.mutate();
    else updateMut.mutate();
  }

  function selectFromCatalog(c: ProductoCatalogo) {
    setForm((f) => ({ ...f, item_id: c.id, item_nombre: c.nombre, item_tipo: c.tipo }));
    setSearch(c.nombre);
    setShowDropdown(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-text-primary">
            {mode === 'create' ? 'Agregar item' : 'Editar item'}
            <span className="text-xs text-text-muted ml-2 font-normal">
              {DIAS[form.dia_semana]}
              {form.fecha ? ` · ${formatFechaCorta(form.fecha)} (puntual)` : ' · Recurrente'}
            </span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Tipo</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, item_tipo: 'producto', item_id: null, item_nombre: '' }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  form.item_tipo === 'producto'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-text-muted border-gray-300 hover:bg-gray-50'
                }`}
              >
                Producto
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, item_tipo: 'subreceta', item_id: null, item_nombre: '' }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  form.item_tipo === 'subreceta'
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-text-muted border-gray-300 hover:bg-gray-50'
                }`}
              >
                Subreceta
              </button>
            </div>
          </div>

          {/* Buscador */}
          <div className="relative">
            <label className="block text-xs font-medium text-text-muted mb-1">
              {form.item_tipo === 'producto' ? 'Producto' : 'Subreceta'}
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setForm((f) => ({ ...f, item_nombre: e.target.value, item_id: null }));
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Buscar..."
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {showDropdown && filtered.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {filtered.slice(0, 30).map((c) => (
                  <button
                    key={`${c.tipo}-${c.id}`}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectFromCatalog(c); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
            )}
            {showDropdown && filtered.length === 0 && search.trim() && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs text-text-muted">
                Sin resultados. Si igual queres dejarlo cargado, presiona fuera.
              </div>
            )}
          </div>

          {/* Cantidad */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Cantidad</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.cantidad}
              onChange={(e) => setForm((f) => ({ ...f, cantidad: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Observacion */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Observacion (opcional)</label>
            <textarea
              value={form.observacion || ''}
              onChange={(e) => setForm((f) => ({ ...f, observacion: e.target.value }))}
              rows={2}
              placeholder="Ej: usar molde grande, hacer doble masa, etc."
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMut.isPending || updateMut.isPending}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 font-medium"
          >
            {mode === 'create' ? 'Agregar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MODAL COPIAR DIA
// =============================================================================
function CopyDayModal({
  fromDia,
  fromFecha,
  modo,
  lunes,
  plan,
  onClose,
  onSuccess,
}: {
  fromDia: number;
  fromFecha: string | null;
  modo: 'plantilla' | 'semana';
  lunes: string;
  plan: PlanSemanalData;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [toDia, setToDia] = useState<number>(fromDia === 6 ? 0 : fromDia + 1);

  const itemsOrigen = plan.porDia[fromDia] || [];
  const itemsDestino = plan.porDia[toDia] || [];

  const fromFechaDestino = modo === 'semana' ? fechaDeDia(lunes, toDia) : null;

  const copyMut = useMutation({
    mutationFn: () =>
      planSemanalApi.copyDay({
        from_dia: fromDia,
        to_dia: toDia,
        fecha_origen: fromFecha,
        fecha_destino: fromFechaDestino,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['plan-semanal'] });
      const data = res?.data as { copiados?: number } | undefined;
      toast.success(`${data?.copiados ?? 0} item(s) copiado(s)`);
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-text-primary flex items-center gap-2">
            <Copy size={18} /> Copiar dia
          </h3>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="text-sm text-text-muted">
            Copiando <strong className="text-text-primary">{itemsOrigen.length}</strong> item(s) de <strong className="text-text-primary">{DIAS[fromDia]}</strong>
            {fromFecha && <> ({formatFechaCorta(fromFecha)})</>} a:
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Dia destino</label>
            <select
              value={toDia}
              onChange={(e) => setToDia(Number(e.target.value))}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white"
            >
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {DIAS[d]} {modo === 'semana' ? `(${formatFechaCorta(fechaDeDia(lunes, d))})` : ''}
                </option>
              ))}
            </select>
          </div>

          {itemsDestino.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
              ⚠ El dia destino ya tiene <strong>{itemsDestino.length}</strong> item(s). Los nuevos se agregaran al final, NO reemplazan los existentes.
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => copyMut.mutate()}
            disabled={copyMut.isPending || itemsOrigen.length === 0}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 font-medium"
          >
            {copyMut.isPending ? 'Copiando...' : 'Copiar'}
          </button>
        </div>
      </div>
    </div>
  );
}

