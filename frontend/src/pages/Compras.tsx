import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Search, X, TrendingUp, TrendingDown,
  ShoppingCart, FolderOpen, CreditCard, Apple, Settings, Truck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { comprasApi, conceptosCompraApi, metodosPagoApi } from '../api/compras';
import { proveedoresApi } from '../api/proveedores';
import { ingredientesApi } from '../api/ingredientes';
import type {
  Compra, CompraInput, ConceptoCompra, MetodoPago, Proveedor, Ingrediente,
} from '../types';
import { formatMoney, formatDate } from '../utils/formatters';
import { normalizarTexto } from '../utils/normalizers';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import NumericInput from '../components/common/NumericInput';

type TabType = 'compras' | 'config';
type ConfigTab = 'conceptos' | 'metodos' | 'proveedores';

export default function Compras() {
  const [tab, setTab] = useState<TabType>('compras');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        <TabBtn active={tab === 'compras'} onClick={() => setTab('compras')} icon={<ShoppingCart size={16} />} label="Compras" />
        <TabBtn active={tab === 'config'} onClick={() => setTab('config')} icon={<Settings size={16} />} label="Configuracion" />
      </div>

      {tab === 'compras' && <TabCompras />}
      {tab === 'config' && <TabConfiguracion />}
    </div>
  );
}

// =============================================================================
// SUBSECCION CONFIGURACION (concentra conceptos + metodos de pago + proveedores)
// =============================================================================
function TabConfiguracion() {
  const [sub, setSub] = useState<ConfigTab>('conceptos');

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-1.5 flex gap-1">
        <SubTabBtn active={sub === 'conceptos'} onClick={() => setSub('conceptos')} icon={<FolderOpen size={14} />} label="Conceptos" />
        <SubTabBtn active={sub === 'metodos'} onClick={() => setSub('metodos')} icon={<CreditCard size={14} />} label="Metodos de pago" />
        <SubTabBtn active={sub === 'proveedores'} onClick={() => setSub('proveedores')} icon={<Truck size={14} />} label="Proveedores" />
      </div>

      {sub === 'conceptos' && <TabConceptos />}
      {sub === 'metodos' && <TabMetodos />}
      {sub === 'proveedores' && <TabProveedores />}
    </div>
  );
}

function SubTabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
        active ? 'bg-primary text-white' : 'text-text-muted hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
        active ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// =============================================================================
// HELPERS de rango de fechas
// =============================================================================
type PeriodoPreset = 'hoy' | 'ayer' | 'anteayer' | 'mes' | 'mes_anterior' | 'ultimos30' | 'rango';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangoDePreset(preset: PeriodoPreset): { desde: string; hasta: string } {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'hoy':
      return { desde: ymd(hoy), hasta: ymd(hoy) };
    case 'ayer': {
      const d = new Date(hoy);
      d.setDate(d.getDate() - 1);
      return { desde: ymd(d), hasta: ymd(d) };
    }
    case 'anteayer': {
      const d = new Date(hoy);
      d.setDate(d.getDate() - 2);
      return { desde: ymd(d), hasta: ymd(d) };
    }
    case 'mes': {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
      return { desde: ymd(inicio), hasta: ymd(fin) };
    }
    case 'mes_anterior': {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      return { desde: ymd(inicio), hasta: ymd(fin) };
    }
    case 'ultimos30': {
      const inicio = new Date(hoy);
      inicio.setDate(inicio.getDate() - 29);
      return { desde: ymd(inicio), hasta: ymd(hoy) };
    }
    case 'rango':
    default:
      return { desde: '', hasta: '' };
  }
}

const PRESET_LABELS: Record<PeriodoPreset, string> = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  anteayer: 'Antes de ayer',
  mes: 'Este mes',
  mes_anterior: 'Mes anterior',
  ultimos30: 'Ultimos 30 dias',
  rango: 'Rango',
};

// =============================================================================
// TAB COMPRAS
// =============================================================================
function TabCompras() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Compra | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [filtroConcepto, setFiltroConcepto] = useState('');
  const [buscar, setBuscar] = useState('');

  // Preset de fecha + valores resueltos (desde/hasta)
  const [preset, setPreset] = useState<PeriodoPreset>('mes');
  const initial = rangoDePreset('mes');
  const [desde, setDesde] = useState(initial.desde);
  const [hasta, setHasta] = useState(initial.hasta);

  // Cuando cambia el preset (excepto 'rango'), actualizar las fechas automaticamente
  useEffect(() => {
    if (preset !== 'rango') {
      const r = rangoDePreset(preset);
      setDesde(r.desde);
      setHasta(r.hasta);
    }
  }, [preset]);

  const { data: comprasRes, isLoading } = useQuery({
    queryKey: ['compras', filtroProveedor, filtroConcepto, buscar, desde, hasta],
    queryFn: () => comprasApi.getAll({
      proveedor_id: filtroProveedor ? Number(filtroProveedor) : undefined,
      concepto_id: filtroConcepto ? Number(filtroConcepto) : undefined,
      buscar: buscar || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
    }),
  });

  const { data: proveedoresRes } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => proveedoresApi.getAll(),
  });
  const { data: conceptosRes } = useQuery({
    queryKey: ['conceptos-compra'],
    queryFn: () => conceptosCompraApi.getAll(),
  });

  const compras: Compra[] = comprasRes?.data || [];
  const proveedores: Proveedor[] = proveedoresRes?.data || [];
  const conceptos: ConceptoCompra[] = conceptosRes?.data || [];

  // Metricas computadas sobre el listado FILTRADO (asi cambian en vivo)
  const metricas = useMemo(() => {
    if (compras.length === 0) {
      return { total: 0, cantidad: 0, promedio: 0, topProveedores: [] as { proveedor: string; total: number }[], topConceptos: [] as { concepto: string; total: number; color: string }[] };
    }
    const total = compras.reduce((s, c) => s + Number(c.monto_total || 0), 0);
    const cantidad = compras.length;

    // Top proveedores
    const provMap = new Map<string, number>();
    for (const c of compras) {
      const nombre = c.proveedor_nombre_display || 'Sin proveedor';
      provMap.set(nombre, (provMap.get(nombre) || 0) + Number(c.monto_total || 0));
    }
    const topProveedores = Array.from(provMap.entries())
      .map(([proveedor, total]) => ({ proveedor, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    // Top conceptos
    const concMap = new Map<string, { total: number; color: string }>();
    for (const c of compras) {
      const nombre = c.concepto_nombre || 'Sin concepto';
      const color = c.concepto_color || '#999';
      const prev = concMap.get(nombre);
      concMap.set(nombre, { total: (prev?.total || 0) + Number(c.monto_total || 0), color });
    }
    const topConceptos = Array.from(concMap.entries())
      .map(([concepto, data]) => ({ concepto, total: data.total, color: data.color }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    return { total, cantidad, promedio: total / cantidad, topProveedores, topConceptos };
  }, [compras]);

  const labelPeriodo = preset === 'rango'
    ? (desde && hasta ? `${desde} a ${hasta}` : 'Rango sin definir')
    : PRESET_LABELS[preset];

  const deleteMut = useMutation({
    mutationFn: (id: number) => comprasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['compras-metricas'] });
      toast.success('Compra eliminada');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      {/* Selector de periodo */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide mr-1">Periodo:</span>
          {(['hoy', 'ayer', 'anteayer', 'mes', 'mes_anterior', 'ultimos30', 'rango'] as PeriodoPreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                preset === p
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-text-muted border-gray-300 hover:bg-gray-50'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        {/* Inputs de fecha si rango custom, o solo lectura del periodo */}
        {preset === 'rango' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="w-full sm:w-auto px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
            <span className="text-xs text-text-muted">hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="w-full sm:w-auto px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
          </div>
        ) : (
          <div className="text-xs text-text-muted">
            Mostrando: <strong className="text-text-primary">{labelPeriodo}</strong>
            {desde && hasta && <span className="ml-1.5">({desde} a {hasta})</span>}
          </div>
        )}
      </div>

      {/* Metricas DINAMICAS calculadas sobre las compras filtradas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <MetricCard
          label={`Total ${labelPeriodo.toLowerCase()}`}
          value={formatMoney(metricas.total)}
          subtitle={`${metricas.cantidad} compra${metricas.cantidad === 1 ? '' : 's'}`}
          color="primary"
        />
        <MetricCard
          label="Promedio por compra"
          value={formatMoney(metricas.promedio)}
          subtitle={metricas.cantidad > 0 ? `de ${metricas.cantidad} registro${metricas.cantidad === 1 ? '' : 's'}` : 'Sin datos'}
          color="gray"
        />
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="text-[10px] uppercase text-text-muted font-medium mb-1">Top proveedores</div>
          {metricas.topProveedores.length === 0 ? (
            <div className="text-xs text-text-muted italic">Sin datos</div>
          ) : (
            <div className="space-y-0.5">
              {metricas.topProveedores.map((tp, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="truncate flex-1">{tp.proveedor}</span>
                  <span className="font-semibold ml-2">{formatMoney(tp.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="text-[10px] uppercase text-text-muted font-medium mb-1">Top conceptos</div>
          {metricas.topConceptos.length === 0 ? (
            <div className="text-xs text-text-muted italic">Sin datos</div>
          ) : (
            <div className="space-y-0.5">
              {metricas.topConceptos.map((tc, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 truncate flex-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tc.color }} />
                    <span className="truncate">{tc.concepto}</span>
                  </span>
                  <span className="font-semibold ml-2">{formatMoney(tc.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filtros secundarios + Acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por detalle, proveedor o ingrediente..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
          />
        </div>
        <select value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)}
          className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select value={filtroConcepto} onChange={(e) => setFiltroConcepto(e.target.value)}
          className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
          <option value="">Todos los conceptos</option>
          {conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="w-full sm:w-auto">
          <Plus size={16} /> Nueva compra
        </Button>
      </div>

      {/* Tabla */}
      {isLoading ? <LoadingSpinner /> : compras.length === 0 ? <EmptyState message="No hay compras registradas" /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Proveedor</th>
                <th className="px-3 py-2.5 font-medium">Concepto</th>
                <th className="px-3 py-2.5 font-medium">Ingrediente</th>
                <th className="px-3 py-2.5 font-medium text-right">Envases</th>
                <th className="px-3 py-2.5 font-medium text-right">Monto</th>
                <th className="px-3 py-2.5 font-medium">Pago</th>
                <th className="px-3 py-2.5 font-medium">Detalle</th>
                <th className="px-3 py-2.5 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(c.fecha)}</td>
                  <td className="px-3 py-2.5">{c.proveedor_nombre_display || '—'}</td>
                  <td className="px-3 py-2.5">
                    {c.concepto_nombre ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.concepto_color || '#ccc' }} />
                        {c.concepto_nombre}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">{c.ingrediente_nombre || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {c.cantidad_envases ? Number(c.cantidad_envases) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">{formatMoney(c.monto_total)}</td>
                  <td className="px-3 py-2.5 text-text-muted">{c.metodo_pago_nombre || '—'}</td>
                  <td className="px-3 py-2.5 text-text-muted text-xs max-w-[200px] truncate">{c.detalle || '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(c); setModalOpen(true); }} className="p-1.5 text-text-muted hover:text-primary"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteId(c.id)} className="p-1.5 text-text-muted hover:text-danger"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <CompraModal compra={editing} onClose={() => setModalOpen(false)} />}
      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar compra"
        message="Esta accion no revierte el precio del ingrediente que se haya actualizado. Continuar?"
        loading={deleteMut.isPending}
      />
    </div>
  );
}

function MetricCard({ label, value, subtitle, indicator, color }: {
  label: string;
  value: string;
  subtitle?: string;
  indicator?: number | null;
  color: 'primary' | 'gray';
}) {
  const colorClasses = {
    primary: 'border-primary/20 bg-primary/5',
    gray: 'border-gray-200 bg-white',
  };
  return (
    <div className={`rounded-xl border p-3 ${colorClasses[color]}`}>
      <div className="text-[10px] uppercase text-text-muted font-medium mb-1">{label}</div>
      <div className="text-lg font-bold text-text-primary">{value}</div>
      {subtitle && (
        <div className={`text-[11px] mt-0.5 flex items-center gap-1 ${
          indicator != null
            ? indicator >= 0 ? 'text-red-600' : 'text-green-600'
            : 'text-text-muted'
        }`}>
          {indicator != null && (indicator >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />)}
          {subtitle}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MODAL COMPRA
// =============================================================================
function CompraModal({ compra, onClose }: { compra: Compra | null; onClose: () => void }) {
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

  // Inicializar el texto del buscador con el nombre del ingrediente si es edición
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

  // Cálculo automático del precio por envase
  const precioPorEnvase = useMemo(() => {
    if (!form.ingrediente_id || !form.cantidad_envases || form.cantidad_envases <= 0) return null;
    if (form.monto_total <= 0) return null;
    return form.monto_total / form.cantidad_envases;
  }, [form.monto_total, form.cantidad_envases, form.ingrediente_id]);

  const createMut = useMutation({
    mutationFn: () => comprasApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['compras-metricas'] });
      queryClient.invalidateQueries({ queryKey: ['ingredientes'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['subrecetas'] });
      toast.success(
        form.ingrediente_id
          ? 'Compra creada. Precio del ingrediente actualizado.'
          : 'Compra creada'
      );
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => comprasApi.update(compra!.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['compras-metricas'] });
      queryClient.invalidateQueries({ queryKey: ['ingredientes'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['subrecetas'] });
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
    if (isEdit) updateMut.mutate(); else createMut.mutate();
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? 'Editar compra' : 'Nueva compra'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={createMut.isPending || updateMut.isPending}>
            {isEdit ? 'Guardar' : 'Registrar compra'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Fecha *</label>
            <input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Proveedor</label>
            <select value={form.proveedor_id || ''} onChange={(e) => setForm((f) => ({ ...f, proveedor_id: e.target.value ? Number(e.target.value) : null }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="">— Sin proveedor —</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Concepto</label>
            <select value={form.concepto_id || ''} onChange={(e) => setForm((f) => ({ ...f, concepto_id: e.target.value ? Number(e.target.value) : null }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="">— Sin concepto —</option>
              {conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Metodo de pago</label>
            <select value={form.metodo_pago_id || ''} onChange={(e) => setForm((f) => ({ ...f, metodo_pago_id: e.target.value ? Number(e.target.value) : null }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="">— Sin metodo —</option>
              {metodos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
        </div>

        {/* Bloque: vincular a ingrediente */}
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50/50">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-1.5">
            <Apple size={14} /> Vincular a ingrediente (actualiza precio automaticamente)
          </div>

          <div ref={ingDropdownRef} className="relative">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
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
                placeholder="Buscar ingrediente (opcional)..."
                className="w-full pl-9 pr-9 py-2 text-sm border border-gray-300 rounded-lg"
              />
              {selectedIng && (
                <button onClick={clearIngrediente} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600">
                  <X size={14} />
                </button>
              )}
            </div>
            {showIngDropdown && filteredIngs.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredIngs.map((ing) => (
                  <button
                    key={ing.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectIngrediente(ing); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    {ing.nombre}
                    <span className="text-xs text-text-muted ml-2">
                      ({Number(ing.contenido_envase)} {ing.unidad_abrev || 'g'} / envase, ${Number(ing.precio1).toFixed(2)})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedIng && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900">
                <strong>{selectedIng.nombre}</strong> · Envase actual: {Number(selectedIng.contenido_envase)} {selectedIng.unidad_abrev || 'g'} · Precio actual: ${Number(selectedIng.precio1).toFixed(2)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Cantidad de envases *</label>
                  <NumericInput
                    value={form.cantidad_envases || 0}
                    onChange={(v) => setForm((f) => ({ ...f, cantidad_envases: v || null }))}
                    min={0} step="0.01"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Monto total *</label>
                  <NumericInput
                    value={form.monto_total}
                    onChange={(v) => setForm((f) => ({ ...f, monto_total: v }))}
                    min={0} step="0.01"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              {precioPorEnvase !== null && (
                <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <strong>Precio nuevo por envase: ${precioPorEnvase.toFixed(2)}</strong>
                  <div className="text-amber-700 mt-0.5">
                    Al guardar se actualiza el precio del ingrediente y se recalcula el costo de subrecetas y productos que lo usan.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Si NO hay ingrediente vinculado, monto total es independiente */}
        {!selectedIng && (
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Monto total *</label>
            <NumericInput
              value={form.monto_total}
              onChange={(v) => setForm((f) => ({ ...f, monto_total: v }))}
              min={0} step="0.01"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Detalle (opcional)</label>
          <textarea
            value={form.detalle || ''}
            onChange={(e) => setForm((f) => ({ ...f, detalle: e.target.value }))}
            rows={2}
            placeholder="Ej: factura A 0001-00012345, compra mensual de insumos"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// TAB CONCEPTOS - ABM de categorias de compra
// =============================================================================
function TabConceptos() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['conceptos-compra'], queryFn: () => conceptosCompraApi.getAll() });
  const conceptos: ConceptoCompra[] = data?.data || [];

  const [editing, setEditing] = useState<ConceptoCompra | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: number) => conceptosCompraApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos-compra'] });
      toast.success('Concepto eliminado');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}><Plus size={16} /> Nuevo concepto</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : conceptos.length === 0 ? <EmptyState message="No hay conceptos" /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                <th className="px-4 py-2.5 font-medium">Color</th>
                <th className="px-4 py-2.5 font-medium">Nombre</th>
                <th className="px-4 py-2.5 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {conceptos.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <span className="inline-block w-5 h-5 rounded-full" style={{ backgroundColor: c.color }} />
                  </td>
                  <td className="px-4 py-2.5 font-medium">{c.nombre}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(c)} className="p-1.5 text-text-muted hover:text-primary"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteId(c.id)} className="p-1.5 text-text-muted hover:text-danger"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <ConceptoModal
          concepto={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar concepto"
        message="Esta seguro? Las compras que usen este concepto quedaran sin categoria."
        loading={deleteMut.isPending}
      />
    </div>
  );
}

function ConceptoModal({ concepto, onClose }: { concepto: ConceptoCompra | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(concepto?.nombre || '');
  const [color, setColor] = useState(concepto?.color || '#10b981');

  const createMut = useMutation({
    mutationFn: () => conceptosCompraApi.create({ nombre, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos-compra'] });
      toast.success('Concepto creado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => conceptosCompraApi.update(concepto!.id, { nombre, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos-compra'] });
      toast.success('Concepto actualizado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit() {
    if (!nombre.trim()) return toast.error('Nombre requerido');
    if (concepto) updateMut.mutate(); else createMut.mutate();
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={concepto ? 'Editar concepto' : 'Nuevo concepto'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={createMut.isPending || updateMut.isPending}>
            {concepto ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Color</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
            className="w-20 h-10 cursor-pointer border border-gray-300 rounded" />
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// TAB METODOS DE PAGO - ABM
// =============================================================================
function TabMetodos() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['metodos-pago'], queryFn: () => metodosPagoApi.getAll() });
  const metodos: MetodoPago[] = data?.data || [];

  const [editing, setEditing] = useState<MetodoPago | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: number) => metodosPagoApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metodos-pago'] });
      toast.success('Metodo eliminado');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}><Plus size={16} /> Nuevo metodo</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : metodos.length === 0 ? <EmptyState message="No hay metodos de pago" /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                <th className="px-4 py-2.5 font-medium">Nombre</th>
                <th className="px-4 py-2.5 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {metodos.map((m) => (
                <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium">{m.nombre}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(m)} className="p-1.5 text-text-muted hover:text-primary"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteId(m.id)} className="p-1.5 text-text-muted hover:text-danger"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <MetodoModal
          metodo={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar metodo de pago"
        message="Las compras con este metodo quedaran sin metodo asignado."
        loading={deleteMut.isPending}
      />
    </div>
  );
}

function MetodoModal({ metodo, onClose }: { metodo: MetodoPago | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(metodo?.nombre || '');

  const createMut = useMutation({
    mutationFn: () => metodosPagoApi.create({ nombre }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metodos-pago'] });
      toast.success('Metodo creado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => metodosPagoApi.update(metodo!.id, { nombre }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metodos-pago'] });
      toast.success('Metodo actualizado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit() {
    if (!nombre.trim()) return toast.error('Nombre requerido');
    if (metodo) updateMut.mutate(); else createMut.mutate();
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={metodo ? 'Editar metodo de pago' : 'Nuevo metodo de pago'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={createMut.isPending || updateMut.isPending}>
            {metodo ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
      </div>
    </Modal>
  );
}

// =============================================================================
// TAB PROVEEDORES - ABM de proveedores (reutiliza la API ya existente)
// =============================================================================
function TabProveedores() {
  const queryClient = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['proveedores', buscar],
    queryFn: () => proveedoresApi.getAll(buscar || undefined),
  });
  const proveedores: Proveedor[] = data?.data || [];

  const deleteMut = useMutation({
    mutationFn: (id: number) => proveedoresApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Proveedor eliminado');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar proveedor..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
          />
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nuevo proveedor
        </Button>
      </div>

      {isLoading ? <LoadingSpinner /> : proveedores.length === 0 ? <EmptyState message="No hay proveedores" /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                <th className="px-4 py-2.5 font-medium">Nombre</th>
                <th className="px-4 py-2.5 font-medium">Telefono</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Direccion</th>
                <th className="px-4 py-2.5 font-medium text-right">Ingredientes</th>
                <th className="px-4 py-2.5 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium">{p.nombre}</td>
                  <td className="px-4 py-2.5 text-text-muted">{p.telefono || '—'}</td>
                  <td className="px-4 py-2.5 text-text-muted">{p.email || '—'}</td>
                  <td className="px-4 py-2.5 text-text-muted max-w-[200px] truncate">{p.direccion || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-text-muted">{p.cantidad_ingredientes ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(p)} className="p-1.5 text-text-muted hover:text-primary"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteId(p.id)} className="p-1.5 text-text-muted hover:text-danger"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <ProveedorModal proveedor={editing} onClose={() => { setCreating(false); setEditing(null); }} />
      )}
      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar proveedor"
        message="Esta seguro? Las compras y los ingredientes que esten vinculados a este proveedor quedaran sin proveedor."
        loading={deleteMut.isPending}
      />
    </div>
  );
}

function ProveedorModal({ proveedor, onClose }: { proveedor: Proveedor | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(proveedor?.nombre || '');
  const [telefono, setTelefono] = useState(proveedor?.telefono || '');
  const [email, setEmail] = useState(proveedor?.email || '');
  const [direccion, setDireccion] = useState(proveedor?.direccion || '');
  const [notas, setNotas] = useState(proveedor?.notas || '');

  const data = {
    nombre: nombre.trim(),
    telefono: telefono.trim() || null,
    email: email.trim() || null,
    direccion: direccion.trim() || null,
    notas: notas.trim() || null,
  };

  const createMut = useMutation({
    mutationFn: () => proveedoresApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Proveedor creado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => proveedoresApi.update(proveedor!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Proveedor actualizado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit() {
    if (!data.nombre) return toast.error('Nombre requerido');
    if (proveedor) updateMut.mutate(); else createMut.mutate();
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={createMut.isPending || updateMut.isPending}>
            {proveedor ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Telefono</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Direccion</label>
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)}
            placeholder="Opcional"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Opcional"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none" />
        </div>
      </div>
    </Modal>
  );
}
