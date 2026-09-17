import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Edit2, Search, AlertTriangle, ArrowLeft, Coffee } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { colabBase as getColabBase } from '../utils/colabBase';
import toast from 'react-hot-toast';
import { perdidasApi } from '../api/perdidas';
import { produccionApi } from '../api/produccion';
import type { Perdida, PerdidaInput, ItemCatalogo, Operario } from '../types';

const MOTIVOS = ['Error de pedido', 'Error de produccion', 'Deterioro', 'Otros'];
const CONSUMO_MOTIVO = 'Consumo';
const CONSUMO_RESPONSABLES = ['Lucas', 'Maca', 'Empleado'];

type TabType = 'perdidas' | 'consumo';

const emptyPerdidaForm: PerdidaInput = {
  fecha: new Date().toISOString().substring(0, 10),
  item_tipo: 'producto',
  item_nombre: '',
  item_id: null,
  cantidad: 1,
  unidad: '',
  motivo: '',
  responsable: '',
  descripcion: '',
};

const emptyConsumoForm: PerdidaInput = {
  fecha: new Date().toISOString().substring(0, 10),
  item_tipo: 'producto',
  item_nombre: '',
  item_id: null,
  cantidad: 1,
  unidad: '',
  motivo: CONSUMO_MOTIVO,
  responsable: '',
  descripcion: '',
};

export default function PerdidasStandalone() {
  const navigate = useNavigate();
  const location = useLocation();
  const volverPath = getColabBase(location.pathname) || '/';
  const [activeTab, setActiveTab] = useState<TabType>('perdidas');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-sidebar px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">☕</span>
          <span className="text-lg font-bold text-primary">Perdidas y consumos</span>
        </div>
        <button
          onClick={() => navigate(volverPath)}
          className="flex items-center gap-1 text-white/60 hover:text-white text-sm"
        >
          <ArrowLeft size={16} /> Volver
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('perdidas')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'perdidas'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <AlertTriangle size={18} /> Perdidas
          </button>
          <button
            onClick={() => setActiveTab('consumo')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'consumo'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Coffee size={18} /> Consumo
          </button>
        </div>

        {activeTab === 'perdidas' && <PerdidasSection />}
        {activeTab === 'consumo' && <ConsumoSection />}
      </div>
    </div>
  );
}

// =============================================================================
// PERDIDAS SECTION (standalone - form abierto por defecto)
// =============================================================================
function PerdidasSection() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PerdidaInput>({ ...emptyPerdidaForm });
  const [buscar, setBuscar] = useState('');
  const [filtroMotivo, setFiltroMotivo] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: perdidasRes, isLoading } = useQuery({
    queryKey: ['perdidas', 'perdidas', buscar, filtroMotivo],
    queryFn: () =>
      perdidasApi.getAll({
        buscar: buscar || undefined,
        motivo: filtroMotivo || undefined,
      }),
  });

  const { data: catalogoRes } = useQuery({
    queryKey: ['perdidas-catalogo'],
    queryFn: () => perdidasApi.getCatalogo(),
  });

  const { data: operariosRes } = useQuery({
    queryKey: ['operarios'],
    queryFn: () => produccionApi.getOperarios(),
  });

  const perdidasAll: Perdida[] = perdidasRes?.data || [];
  const perdidas = perdidasAll.filter((p) => p.motivo !== CONSUMO_MOTIVO);
  const catalogo: ItemCatalogo[] = catalogoRes?.data || [];
  const operarios: Operario[] = operariosRes?.data || [];

  const filteredCatalogo = catalogo.filter(
    (item) =>
      item.tipo === form.item_tipo &&
      item.nombre.toLowerCase().includes(itemSearch.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowItemDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const createMut = useMutation({
    mutationFn: (data: PerdidaInput) => perdidasApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perdidas'] });
      toast.success('Perdida registrada');
      resetForm();
    },
    onError: () => toast.error('Error al registrar'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PerdidaInput }) => perdidasApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perdidas'] });
      toast.success('Perdida actualizada');
      resetForm();
    },
    onError: () => toast.error('Error al actualizar'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => perdidasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perdidas'] });
      toast.success('Perdida eliminada');
    },
    onError: () => toast.error('Error al eliminar'),
  });

  function resetForm() {
    setForm({ ...emptyPerdidaForm, fecha: new Date().toISOString().substring(0, 10) });
    setItemSearch('');
    setEditingId(null);
  }

  function handleEdit(p: Perdida) {
    setForm({
      fecha: typeof p.fecha === 'string' ? p.fecha.substring(0, 10) : p.fecha,
      item_tipo: p.item_tipo,
      item_nombre: p.item_nombre,
      item_id: p.item_id,
      cantidad: p.cantidad,
      unidad: p.unidad || '',
      motivo: p.motivo || '',
      responsable: p.responsable || '',
      descripcion: p.descripcion || '',
    });
    setItemSearch(p.item_nombre);
    setEditingId(p.id);
  }

  function handleSubmit() {
    if (!form.item_nombre.trim()) {
      toast.error('Selecciona un producto o ingrediente');
      return;
    }
    if (editingId) {
      updateMut.mutate({ id: editingId, data: form });
    } else {
      createMut.mutate(form);
    }
  }

  function selectItem(item: ItemCatalogo) {
    setForm((f) => ({ ...f, item_nombre: item.nombre, item_id: item.id }));
    setItemSearch(item.nombre);
    setShowItemDropdown(false);
  }

  function formatFecha(fecha: string) {
    const clean = typeof fecha === 'string' ? fecha.substring(0, 10) : '';
    const parts = clean.split('-');
    if (parts.length !== 3) return clean;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  return (
    <div className="space-y-5">
      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" />
            {editingId ? 'Editar Registro' : 'Nuevo Registro'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Fecha */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Fecha</label>
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Tipo</label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setForm((f) => ({ ...f, item_tipo: 'producto', item_nombre: '', item_id: null }));
                  setItemSearch('');
                }}
                className={`flex-1 py-3 rounded-lg text-sm font-medium border transition-colors ${
                  form.item_tipo === 'producto'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-text-muted border-gray-300 hover:bg-gray-50'
                }`}
              >
                Producto
              </button>
              <button
                onClick={() => {
                  setForm((f) => ({ ...f, item_tipo: 'ingrediente', item_nombre: '', item_id: null }));
                  setItemSearch('');
                }}
                className={`flex-1 py-3 rounded-lg text-sm font-medium border transition-colors ${
                  form.item_tipo === 'ingrediente'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-text-muted border-gray-300 hover:bg-gray-50'
                }`}
              >
                Ingrediente
              </button>
            </div>
          </div>

          {/* Item selector */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium text-text-muted mb-1">
              {form.item_tipo === 'producto' ? 'Producto' : 'Ingrediente'}
            </label>
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => {
                setItemSearch(e.target.value);
                setForm((f) => ({ ...f, item_nombre: e.target.value, item_id: null }));
                setShowItemDropdown(true);
              }}
              onFocus={() => setShowItemDropdown(true)}
              placeholder="Buscar..."
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            />
            {showItemDropdown && filteredCatalogo.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredCatalogo.slice(0, 20).map((item) => (
                  <button
                    key={`${item.tipo}-${item.id}`}
                    onClick={() => selectItem(item)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    {item.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cantidad + Unidad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Cantidad</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.cantidad}
                onChange={(e) => setForm((f) => ({ ...f, cantidad: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Unidad</label>
              <input
                type="text"
                value={form.unidad || ''}
                onChange={(e) => setForm((f) => ({ ...f, unidad: e.target.value }))}
                placeholder="kg, u, L"
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
              />
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Motivo</label>
            <select
              value={form.motivo || ''}
              onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            >
              <option value="">Seleccionar...</option>
              {MOTIVOS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Responsable */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Responsable</label>
            <select
              value={form.responsable || ''}
              onChange={(e) => setForm((f) => ({ ...f, responsable: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            >
              <option value="">Seleccionar...</option>
              {operarios.map((op) => (
                <option key={op.id} value={op.nombre}>{op.nombre}</option>
              ))}
            </select>
          </div>

          {/* Descripcion */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-text-muted mb-1">Descripcion</label>
            <textarea
              value={form.descripcion || ''}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              placeholder="Detalle adicional..."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {editingId && (
            <button
              onClick={resetForm}
              className="px-5 py-3 text-sm text-text-muted border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={createMut.isPending || updateMut.isPending}
            className="px-5 py-3 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
          >
            {editingId ? 'Actualizar' : 'Registrar'}
          </button>
        </div>
      </div>

      {/* Recent records */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-text-primary">Registros recientes</h3>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <select
            value={filtroMotivo}
            onChange={(e) => setFiltroMotivo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-text-muted text-sm">Cargando...</div>
        ) : perdidas.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">No hay registros</div>
        ) : (
          <div className="space-y-2">
            {perdidas.slice(0, 20).map((p) => (
              <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.item_nombre}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        p.item_tipo === 'producto'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {p.item_tipo === 'producto' ? 'Prod' : 'Ingr'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-text-muted mt-1">
                    <span>{formatFecha(p.fecha)}</span>
                    <span className="font-mono font-bold text-text-primary">{p.cantidad}{p.unidad ? ` ${p.unidad}` : ''}</span>
                    {p.motivo && <span>{p.motivo}</span>}
                    {p.responsable && <span>{p.responsable}</span>}
                  </div>
                  {p.descripcion && (
                    <div className="text-xs text-text-muted mt-0.5 truncate italic">{p.descripcion}</div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600">
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => { if (confirm('Eliminar?')) deleteMut.mutate(p.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// CONSUMO SECTION (sin motivo, sin tipo, sin unidad, responsable fijo)
// =============================================================================
function ConsumoSection() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PerdidaInput>({ ...emptyConsumoForm });
  const [buscar, setBuscar] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: consumosRes, isLoading } = useQuery({
    queryKey: ['perdidas', 'consumo', buscar],
    queryFn: () =>
      perdidasApi.getAll({
        buscar: buscar || undefined,
        motivo: CONSUMO_MOTIVO,
      }),
  });

  const { data: catalogoRes } = useQuery({
    queryKey: ['perdidas-catalogo'],
    queryFn: () => perdidasApi.getCatalogo(),
  });

  const consumos: Perdida[] = consumosRes?.data || [];
  const catalogo: ItemCatalogo[] = catalogoRes?.data || [];

  const filteredCatalogo = catalogo.filter(
    (item) =>
      item.tipo === 'producto' &&
      item.nombre.toLowerCase().includes(itemSearch.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowItemDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const createMut = useMutation({
    mutationFn: (data: PerdidaInput) => perdidasApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perdidas'] });
      toast.success('Consumo registrado');
      resetForm();
    },
    onError: () => toast.error('Error al registrar'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PerdidaInput }) => perdidasApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perdidas'] });
      toast.success('Consumo actualizado');
      resetForm();
    },
    onError: () => toast.error('Error al actualizar'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => perdidasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perdidas'] });
      toast.success('Consumo eliminado');
    },
    onError: () => toast.error('Error al eliminar'),
  });

  function resetForm() {
    setForm({ ...emptyConsumoForm, fecha: new Date().toISOString().substring(0, 10) });
    setItemSearch('');
    setEditingId(null);
  }

  function handleEdit(p: Perdida) {
    setForm({
      fecha: typeof p.fecha === 'string' ? p.fecha.substring(0, 10) : p.fecha,
      item_tipo: 'producto',
      item_nombre: p.item_nombre,
      item_id: p.item_id,
      cantidad: p.cantidad,
      unidad: '',
      motivo: CONSUMO_MOTIVO,
      responsable: p.responsable || '',
      descripcion: p.descripcion || '',
    });
    setItemSearch(p.item_nombre);
    setEditingId(p.id);
  }

  function handleSubmit() {
    if (!form.item_nombre.trim()) {
      toast.error('Selecciona un producto');
      return;
    }
    const data: PerdidaInput = {
      ...form,
      item_tipo: 'producto',
      motivo: CONSUMO_MOTIVO,
      unidad: '',
    };
    if (editingId) {
      updateMut.mutate({ id: editingId, data });
    } else {
      createMut.mutate(data);
    }
  }

  function selectItem(item: ItemCatalogo) {
    setForm((f) => ({ ...f, item_nombre: item.nombre, item_id: item.id }));
    setItemSearch(item.nombre);
    setShowItemDropdown(false);
  }

  function formatFecha(fecha: string) {
    const clean = typeof fecha === 'string' ? fecha.substring(0, 10) : '';
    const parts = clean.split('-');
    if (parts.length !== 3) return clean;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  return (
    <div className="space-y-5">
      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Coffee size={18} className="text-amber-600" />
            {editingId ? 'Editar Consumo' : 'Nuevo Consumo'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Fecha */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Fecha</label>
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            />
          </div>

          {/* Producto (sin selector de tipo) */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium text-text-muted mb-1">Producto</label>
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => {
                setItemSearch(e.target.value);
                setForm((f) => ({ ...f, item_nombre: e.target.value, item_id: null }));
                setShowItemDropdown(true);
              }}
              onFocus={() => setShowItemDropdown(true)}
              placeholder="Buscar producto..."
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            />
            {showItemDropdown && filteredCatalogo.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredCatalogo.slice(0, 20).map((item) => (
                  <button
                    key={`${item.tipo}-${item.id}`}
                    onClick={() => selectItem(item)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    {item.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cantidad */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Cantidad</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.cantidad}
              onChange={(e) => setForm((f) => ({ ...f, cantidad: parseFloat(e.target.value) || 0 }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            />
          </div>

          {/* Consumo a cargo */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Consumo a cargo</label>
            <select
              value={form.responsable || ''}
              onChange={(e) => setForm((f) => ({ ...f, responsable: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            >
              <option value="">Seleccionar...</option>
              {CONSUMO_RESPONSABLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Descripcion */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-text-muted mb-1">Descripcion</label>
            <textarea
              value={form.descripcion || ''}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              placeholder="Detalle adicional..."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {editingId && (
            <button
              onClick={resetForm}
              className="px-5 py-3 text-sm text-text-muted border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={createMut.isPending || updateMut.isPending}
            className="px-5 py-3 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 font-medium"
          >
            {editingId ? 'Actualizar' : 'Registrar'}
          </button>
        </div>
      </div>

      {/* Recent records */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-text-primary">Consumos recientes</h3>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            type="text"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-text-muted text-sm">Cargando...</div>
        ) : consumos.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">No hay consumos</div>
        ) : (
          <div className="space-y-2">
            {consumos.slice(0, 20).map((p) => (
              <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{p.item_nombre}</div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-text-muted mt-1">
                    <span>{formatFecha(p.fecha)}</span>
                    <span className="font-mono font-bold text-text-primary">{p.cantidad}</span>
                    {p.responsable && <span>A cargo de: <strong>{p.responsable}</strong></span>}
                  </div>
                  {p.descripcion && (
                    <div className="text-xs text-text-muted mt-0.5 truncate italic">{p.descripcion}</div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600">
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => { if (confirm('Eliminar?')) deleteMut.mutate(p.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
