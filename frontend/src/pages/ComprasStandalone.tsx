import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { colabBase as getColabBase } from '../utils/colabBase';
import { Plus, Trash2, Search, X, ShoppingCart, Apple, ArrowLeft, Edit2, FolderOpen, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { comprasApi, conceptosCompraApi, metodosPagoApi } from '../api/compras';
import { proveedoresApi } from '../api/proveedores';
import { ingredientesApi } from '../api/ingredientes';
import type {
  Compra, CompraInput, ConceptoCompra, MetodoPago, Proveedor, Ingrediente,
} from '../types';
import { formatMoney, formatDate } from '../utils/formatters';
import { normalizarTexto } from '../utils/normalizers';

// =============================================================================
// COMPRAS STANDALONE - URL para colaborador (sin sidebar)
// Permite registrar/editar compras y administrar conceptos.
// =============================================================================
type TabStandalone = 'compras' | 'conceptos';

export default function ComprasStandalone() {
  const navigate = useNavigate();
  const location = useLocation();
  const volverPath = getColabBase(location.pathname) || '/';
  const [tab, setTab] = useState<TabStandalone>('compras');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar standalone */}
      <div className="bg-sidebar px-4 py-3 flex items-center justify-between">
        <span className="text-lg font-bold text-primary flex items-center gap-2">
          <ShoppingCart size={20} /> Registro de Compras
        </span>
        <button
          onClick={() => navigate(volverPath)}
          className="flex items-center gap-1 text-white/60 hover:text-white text-xs bg-white/10 px-2.5 py-1.5 rounded"
        >
          <ArrowLeft size={14} /> Volver
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {/* Tabs principales */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setTab('compras')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
              tab === 'compras' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <ShoppingCart size={16} /> Compras
          </button>
          <button
            onClick={() => setTab('conceptos')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
              tab === 'conceptos' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <FolderOpen size={16} /> Conceptos
          </button>
        </div>

        {tab === 'compras' && <SectionCompras />}
        {tab === 'conceptos' && <SectionConceptos />}
      </div>
    </div>
  );
}

// =============================================================================
// SECTION COMPRAS (lo que estaba antes en el componente principal)
// =============================================================================
function SectionCompras() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Compra | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: comprasRes, isLoading } = useQuery({
    queryKey: ['compras', 'standalone'],
    queryFn: () => comprasApi.getAll({ limit: 30 }),
  });
  const compras: Compra[] = comprasRes?.data || [];

  const deleteMut = useMutation({
    mutationFn: (id: number) => comprasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      toast.success('Compra eliminada');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleEdit(c: Compra) {
    setEditing(c);
    setShowForm(true);
  }

  function handleNueva() {
    setEditing(null);
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
        {/* Boton nueva compra */}
        {!showForm && (
          <button
            onClick={handleNueva}
            className="w-full bg-primary text-white py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
          >
            <Plus size={20} /> Registrar nueva compra
          </button>
        )}

        {/* Formulario */}
        {showForm && (
          <CompraForm
            compra={editing}
            onClose={() => {
              setShowForm(false);
              setEditing(null);
            }}
          />
        )}

        {/* Listado de compras recientes */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-text-primary px-1">
            Compras recientes
            {compras.length > 0 && <span className="text-text-muted font-normal ml-1">({compras.length})</span>}
          </h3>

          {isLoading ? (
            <div className="text-center py-8 text-text-muted text-sm">Cargando...</div>
          ) : compras.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <ShoppingCart className="mx-auto mb-3 text-gray-300" size={48} />
              <p className="text-text-muted">No hay compras registradas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {compras.map((c) => (
                <div
                  key={c.id}
                  className="bg-white rounded-lg border border-gray-200 p-3 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-text-muted">{formatDate(c.fecha)}</span>
                      {c.concepto_nombre && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: (c.concepto_color || '#666') + '20',
                            color: c.concepto_color || '#666',
                          }}
                        >
                          {c.concepto_nombre}
                        </span>
                      )}
                      {c.metodo_pago_nombre && (
                        <span className="text-[10px] text-text-muted">· {c.metodo_pago_nombre}</span>
                      )}
                    </div>
                    <div className="font-semibold text-sm mt-1">
                      {c.proveedor_nombre_display || 'Sin proveedor'}
                      {c.ingrediente_nombre && (
                        <span className="text-text-muted font-normal ml-1.5 text-xs">
                          · {c.ingrediente_nombre}
                          {c.cantidad_envases && (
                            <span className="font-mono"> ({Number(c.cantidad_envases)} env.)</span>
                          )}
                        </span>
                      )}
                    </div>
                    {c.detalle && (
                      <div className="text-xs text-text-muted italic mt-0.5 truncate">{c.detalle}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-bold text-primary text-base">{formatMoney(c.monto_total)}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(c)}
                        className="p-1.5 text-gray-400 hover:text-blue-600"
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('¿Eliminar esta compra?')) deleteMut.mutate(c.id);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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
// SECTION CONCEPTOS - ABM de conceptos para el colaborador
// =============================================================================
function SectionConceptos() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ id?: number; nombre: string; color: string } | null>(null);

  const { data: conceptosRes, isLoading } = useQuery({
    queryKey: ['conceptos-compra'],
    queryFn: () => conceptosCompraApi.getAll(),
  });
  const conceptos = conceptosRes?.data || [];

  const deleteMut = useMutation({
    mutationFn: (id: number) => conceptosCompraApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos-compra'] });
      toast.success('Concepto eliminado');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      {/* Boton nuevo concepto */}
      {!editing && (
        <button
          onClick={() => setEditing({ nombre: '', color: '#10b981' })}
          className="w-full bg-primary text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90"
        >
          <Plus size={18} /> Nuevo concepto
        </button>
      )}

      {/* Formulario inline */}
      {editing && (
        <ConceptoForm
          concepto={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Lista */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-text-primary px-1">
          Conceptos {conceptos.length > 0 && <span className="text-text-muted font-normal">({conceptos.length})</span>}
        </h3>
        {isLoading ? (
          <div className="text-center py-8 text-text-muted text-sm">Cargando...</div>
        ) : conceptos.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <FolderOpen className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-text-muted text-sm">No hay conceptos cargados</p>
          </div>
        ) : (
          conceptos.map((c) => (
            <div key={c.id} className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3">
              <span
                className="w-5 h-5 rounded-full shrink-0 border border-gray-300"
                style={{ backgroundColor: c.color }}
              />
              <span className="flex-1 font-medium text-sm">{c.nombre}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditing({ id: c.id, nombre: c.nombre, color: c.color })}
                  className="p-2 text-gray-400 hover:text-primary"
                  title="Editar"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`¿Eliminar "${c.nombre}"? Las compras con este concepto quedaran sin categoria.`)) {
                      deleteMut.mutate(c.id);
                    }
                  }}
                  className="p-2 text-gray-400 hover:text-red-600"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ConceptoForm({
  concepto,
  onClose,
}: {
  concepto: { id?: number; nombre: string; color: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = concepto.id != null;
  const [nombre, setNombre] = useState(concepto.nombre);
  const [color, setColor] = useState(concepto.color || '#10b981');

  const createMut = useMutation({
    mutationFn: () => conceptosCompraApi.create({ nombre: nombre.trim(), color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos-compra'] });
      toast.success('Concepto creado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => conceptosCompraApi.update(concepto.id!, { nombre: nombre.trim(), color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos-compra'] });
      toast.success('Concepto actualizado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit() {
    if (!nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (isEdit) updateMut.mutate();
    else createMut.mutate();
  }

  return (
    <div className="bg-white rounded-xl border-2 border-primary/20 p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <h3 className="font-bold text-text-primary">
          {isEdit ? 'Editar concepto' : 'Nuevo concepto'}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-text-primary">
          <X size={20} />
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
          placeholder="Ej: Insumos, Limpieza, etc."
          className="w-full px-3 py-3 text-base border border-gray-300 rounded-lg"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-16 h-10 cursor-pointer border border-gray-300 rounded"
          />
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="flex-1 px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={onClose}
          className="flex-1 py-3 text-sm text-text-muted border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={createMut.isPending || updateMut.isPending}
          className="flex-[2] py-3 text-base bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 font-semibold"
        >
          {createMut.isPending || updateMut.isPending
            ? 'Guardando...'
            : isEdit
            ? 'Guardar cambios'
            : 'Crear concepto'}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// FORMULARIO INLINE (no es modal, va en linea para tablet)
// =============================================================================
function CompraForm({ compra, onClose }: { compra: Compra | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = compra != null;

  const [form, setForm] = useState<CompraInput>({
    fecha: compra?.fecha?.substring(0, 10) || new Date().toISOString().substring(0, 10),
    proveedor_id: compra?.proveedor_id || null,
    proveedor_nombre: compra?.proveedor_nombre || null,
    concepto_id: compra?.concepto_id || null,
    ingrediente_id: compra?.ingrediente_id || null,
    cantidad_envases: compra?.cantidad_envases || null,
    monto_total: Number(compra?.monto_total) || 0,
    metodo_pago_id: compra?.metodo_pago_id || null,
    detalle: compra?.detalle || '',
  });

  const [ingSearch, setIngSearch] = useState('');
  const [showIngDropdown, setShowIngDropdown] = useState(false);
  const ingDropdownRef = useRef<HTMLDivElement>(null);

  const { data: proveedoresRes } = useQuery({ queryKey: ['proveedores'], queryFn: () => proveedoresApi.getAll() });
  const { data: conceptosRes } = useQuery({ queryKey: ['conceptos-compra'], queryFn: () => conceptosCompraApi.getAll() });
  const { data: metodosRes } = useQuery({ queryKey: ['metodos-pago'], queryFn: () => metodosPagoApi.getAll() });
  const { data: ingsRes } = useQuery({ queryKey: ['ingredientes', {}], queryFn: () => ingredientesApi.getAll() });

  const proveedores: Proveedor[] = proveedoresRes?.data || [];
  const conceptos: ConceptoCompra[] = conceptosRes?.data || [];
  const metodos: MetodoPago[] = metodosRes?.data || [];
  const ingredientes: Ingrediente[] = ingsRes?.data || [];

  const selectedIng = useMemo(
    () => ingredientes.find((i) => i.id === form.ingrediente_id) || null,
    [ingredientes, form.ingrediente_id]
  );

  useEffect(() => {
    if (selectedIng && !ingSearch) setIngSearch(selectedIng.nombre);
  }, [selectedIng]); // eslint-disable-line

  const filteredIngs = useMemo(() => {
    const term = normalizarTexto(ingSearch.trim());
    if (!term) return [];
    return ingredientes
      .filter((i) => normalizarTexto(i.nombre).includes(term))
      .slice(0, 8);
  }, [ingredientes, ingSearch]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ingDropdownRef.current && !ingDropdownRef.current.contains(e.target as Node)) {
        setShowIngDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function selectIngrediente(ing: Ingrediente) {
    setForm((f) => ({ ...f, ingrediente_id: ing.id }));
    setIngSearch(ing.nombre);
    setShowIngDropdown(false);
  }

  function clearIngrediente() {
    setForm((f) => ({ ...f, ingrediente_id: null, cantidad_envases: null }));
    setIngSearch('');
  }

  const precioPorEnvase = useMemo(() => {
    if (!form.ingrediente_id || !form.cantidad_envases || form.cantidad_envases <= 0) return null;
    if (form.monto_total <= 0) return null;
    return form.monto_total / form.cantidad_envases;
  }, [form.monto_total, form.cantidad_envases, form.ingrediente_id]);

  const createMut = useMutation({
    mutationFn: () => comprasApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['ingredientes'] });
      toast.success(
        form.ingrediente_id
          ? 'Compra registrada. Precio del ingrediente actualizado.'
          : 'Compra registrada'
      );
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => comprasApi.update(compra!.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['ingredientes'] });
      toast.success('Compra actualizada');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit() {
    if (!form.fecha) return toast.error('La fecha es requerida');
    if (form.monto_total <= 0) return toast.error('El monto debe ser mayor a 0');
    if (form.ingrediente_id && (!form.cantidad_envases || form.cantidad_envases <= 0)) {
      return toast.error('Si vincula a un ingrediente, indique la cantidad de envases');
    }
    if (isEdit) updateMut.mutate();
    else createMut.mutate();
  }

  return (
    <div className="bg-white rounded-xl border-2 border-primary/20 p-4 space-y-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <h3 className="font-bold text-text-primary">
          {isEdit ? 'Editar compra' : 'Nueva compra'}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-text-primary">
          <X size={20} />
        </button>
      </div>

      {/* Fecha + Proveedor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Fecha *</label>
          <input
            type="date"
            value={form.fecha}
            onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            className="w-full px-3 py-3 text-base border border-gray-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Proveedor</label>
          <select
            value={form.proveedor_id || ''}
            onChange={(e) => setForm((f) => ({ ...f, proveedor_id: e.target.value ? Number(e.target.value) : null }))}
            className="w-full px-3 py-3 text-base border border-gray-300 rounded-lg bg-white"
          >
            <option value="">— Sin proveedor —</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Concepto + Metodo de pago */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Concepto</label>
          <select
            value={form.concepto_id || ''}
            onChange={(e) => setForm((f) => ({ ...f, concepto_id: e.target.value ? Number(e.target.value) : null }))}
            className="w-full px-3 py-3 text-base border border-gray-300 rounded-lg bg-white"
          >
            <option value="">— Sin concepto —</option>
            {conceptos.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Metodo de pago</label>
          <select
            value={form.metodo_pago_id || ''}
            onChange={(e) => setForm((f) => ({ ...f, metodo_pago_id: e.target.value ? Number(e.target.value) : null }))}
            className="w-full px-3 py-3 text-base border border-gray-300 rounded-lg bg-white"
          >
            <option value="">— Sin metodo —</option>
            {metodos.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Bloque vinculo a ingrediente */}
      <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50/50">
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-1.5">
          <Apple size={14} /> Vincular a ingrediente (opcional)
        </div>

        <div ref={ingDropdownRef} className="relative">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={ingSearch}
              onChange={(e) => {
                setIngSearch(e.target.value);
                if (!e.target.value.trim()) {
                  setForm((f) => ({ ...f, ingrediente_id: null, cantidad_envases: null }));
                }
                setShowIngDropdown(true);
              }}
              onFocus={() => setShowIngDropdown(true)}
              placeholder="Buscar ingrediente..."
              className="w-full pl-10 pr-9 py-3 text-base border border-gray-300 rounded-lg"
            />
            {selectedIng && (
              <button
                onClick={clearIngrediente}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {showIngDropdown && filteredIngs.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {filteredIngs.map((ing) => (
                <button
                  key={ing.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectIngrediente(ing);
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <div className="font-medium">{ing.nombre}</div>
                  <div className="text-xs text-text-muted">
                    {Number(ing.contenido_envase)} {ing.unidad_abrev || 'g'} / envase · Precio actual: ${Number(ing.precio1).toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedIng && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900">
              <strong>{selectedIng.nombre}</strong> · Envase: {Number(selectedIng.contenido_envase)} {selectedIng.unidad_abrev || 'g'} · Precio actual: ${Number(selectedIng.precio1).toFixed(2)}
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Cantidad de envases *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.cantidad_envases || ''}
                onChange={(e) => setForm((f) => ({ ...f, cantidad_envases: parseFloat(e.target.value) || null }))}
                className="w-full px-3 py-3 text-base border border-gray-300 rounded-lg"
                placeholder="Ej: 2"
              />
            </div>
          </>
        )}
      </div>

      {/* Monto total */}
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Monto total *</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={form.monto_total || ''}
          onChange={(e) => setForm((f) => ({ ...f, monto_total: parseFloat(e.target.value) || 0 }))}
          placeholder="$ 0.00"
          className="w-full px-3 py-3 text-lg font-semibold border border-gray-300 rounded-lg"
        />
      </div>

      {/* Indicador de precio nuevo por envase */}
      {precioPorEnvase !== null && (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <strong>Precio nuevo por envase: ${precioPorEnvase.toFixed(2)}</strong>
          <div className="text-amber-700 text-xs mt-0.5">
            Al guardar se actualiza el precio del ingrediente y se recalcula el costo de productos.
          </div>
        </div>
      )}

      {/* Detalle */}
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Detalle (opcional)</label>
        <textarea
          value={form.detalle || ''}
          onChange={(e) => setForm((f) => ({ ...f, detalle: e.target.value }))}
          rows={2}
          placeholder="Notas sobre la compra..."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none"
        />
      </div>

      {/* Acciones */}
      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={onClose}
          className="flex-1 py-3 text-sm text-text-muted border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={createMut.isPending || updateMut.isPending}
          className="flex-[2] py-3 text-base bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 font-semibold"
        >
          {createMut.isPending || updateMut.isPending
            ? 'Guardando...'
            : isEdit
            ? 'Guardar cambios'
            : 'Registrar compra'}
        </button>
      </div>
    </div>
  );
}
