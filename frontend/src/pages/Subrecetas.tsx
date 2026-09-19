import { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { subrecetasApi } from '../api/subrecetas';
import { ingredientesApi } from '../api/ingredientes';
import { conceptosApi } from '../api/conceptos';
import type { Subreceta, Ingrediente, ResumenCanales } from '../types';
import { formatMoney } from '../utils/formatters';
import { calcularMCNeto, getMCColor } from '../utils/calculators';
import { normalizarTexto } from '../utils/normalizers';
import MCBadge from '../components/common/MCBadge';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import SearchInput from '../components/common/SearchInput';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import NumericInput from '../components/common/NumericInput';
import { useDebounce } from '../hooks/useDebounce';

interface RecipeItem {
  ingrediente_id: number;
  nombre: string;
  cantidad: number;
  unidad: string;
  costo_con_desperdicio: number;
  fecha_precio?: string;
}

function isStalePrice(fecha?: string, days = 45): boolean {
  if (!fecha) return false;
  const diff = Date.now() - new Date(fecha).getTime();
  return diff > days * 86400000;
}

export default function Subrecetas() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [buscar, setBuscar] = useState('');
  const debouncedBuscar = useDebounce(buscar);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openIdProcessed, setOpenIdProcessed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['subrecetas'],
    queryFn: () => subrecetasApi.getAll(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => subrecetasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subrecetas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Subreceta eliminada');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const allSubrecetas: Subreceta[] = data?.data || [];

  const subrecetas = useMemo(() => {
    if (!debouncedBuscar) return allSubrecetas;
    const term = normalizarTexto(debouncedBuscar);
    return allSubrecetas.filter((s) => normalizarTexto(s.nombre).includes(term));
  }, [allSubrecetas, debouncedBuscar]);

  // Deep-link ?openId=N (desde Ingredientes -> "Ver recetas").
  // Espera a que la lista cargue antes de abrir el modal.
  useEffect(() => {
    if (openIdProcessed) return;
    const openIdRaw = searchParams.get('openId');
    if (!openIdRaw) {
      setOpenIdProcessed(true);
      return;
    }
    if (allSubrecetas.length === 0) return;

    const id = Number(openIdRaw);
    if (!Number.isNaN(id) && allSubrecetas.some((s) => s.id === id)) {
      setEditingId(id);
      setModalOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('openId');
    setSearchParams(next, { replace: true });
    setOpenIdProcessed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSubrecetas, openIdProcessed]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="w-full sm:flex-1 sm:min-w-[200px]">
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar subreceta..." />
        </div>
        <Button onClick={() => { setEditingId(null); setModalOpen(true); }}>
          <Plus size={16} /> Nueva
        </Button>
      </div>

      {isLoading ? <LoadingSpinner /> : subrecetas.length === 0 ? <EmptyState message="No hay subrecetas" /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium text-right">Rendimiento</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Tipo</th>
                <th className="px-4 py-3 font-medium text-right">Costo Total</th>
                <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Costo/100g</th>
                <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Ingredientes</th>
                <th className="px-4 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {subrecetas.map((sub) => (
                <tr key={sub.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium">{sub.nombre}</td>
                  <td className="px-4 py-3 text-right">{sub.rendimiento_gramos}</td>
                  <td className="px-4 py-3 text-text-muted hidden sm:table-cell">{sub.tipo_rendimiento}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(sub.costo_total)}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">{formatMoney(sub.costo_por_100g)}</td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">{sub.ingredientes?.length || 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingId(sub.id); setModalOpen(true); }} className="p-1.5 text-text-muted hover:text-primary cursor-pointer">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteId(sub.id)} className="p-1.5 text-text-muted hover:text-danger cursor-pointer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <SubrecetaModal
          subrecetaId={editingId}
          subrecetas={allSubrecetas}
          onClose={() => setModalOpen(false)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar subreceta"
        message="Esta seguro que desea eliminar esta subreceta?"
        loading={deleteMut.isPending}
      />
    </div>
  );
}

function SubrecetaModal({ subrecetaId, subrecetas, onClose }: {
  subrecetaId: number | null;
  subrecetas: Subreceta[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const existing = subrecetaId ? subrecetas.find((s) => s.id === subrecetaId) : null;

  const [nombre, setNombre] = useState(existing?.nombre || '');
  const [rendimiento, setRendimiento] = useState(existing?.rendimiento_gramos || 100);
  const [tipoRendimiento, setTipoRendimiento] = useState(existing?.tipo_rendimiento || 'gramos');
  const [notas, setNotas] = useState(existing?.notas || '');
  // Info nutricional por unidad — guardamos como string para permitir campo vacio (= sin datos)
  const nutriInit = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(Number(v)));
  const [nutri, setNutri] = useState<Record<string, string>>({
    nutri_energia_kcal: nutriInit(existing?.nutri_energia_kcal),
    nutri_proteinas_g: nutriInit(existing?.nutri_proteinas_g),
    nutri_carbohidratos_g: nutriInit(existing?.nutri_carbohidratos_g),
    nutri_azucares_g: nutriInit(existing?.nutri_azucares_g),
    nutri_grasas_g: nutriInit(existing?.nutri_grasas_g),
    nutri_grasas_sat_g: nutriInit(existing?.nutri_grasas_sat_g),
    nutri_grasas_trans_g: nutriInit(existing?.nutri_grasas_trans_g),
    nutri_sodio_mg: nutriInit(existing?.nutri_sodio_mg),
  });
  const setNutriField = (key: string, value: string) => setNutri((prev) => ({ ...prev, [key]: value }));
  // string vacio -> null; numero invalido o negativo -> null
  const nutriPayload = () => {
    const out: Record<string, number | null> = {};
    Object.entries(nutri).forEach(([k, v]) => {
      const n = parseFloat(v);
      out[k] = v.trim() === '' || Number.isNaN(n) || n < 0 ? null : n;
    });
    return out;
  };
  const [precioVentaKg, setPrecioVentaKg] = useState(0);
  const [items, setItems] = useState<RecipeItem[]>(
    existing?.ingredientes?.map((i: any) => ({
      ingrediente_id: i.ingrediente_id,
      nombre: i.ingrediente_nombre,
      cantidad: Number(i.cantidad) || 0,
      unidad: i.unidad || 'g',
      costo_con_desperdicio: Number(i.costo_con_desperdicio) || 0,
      fecha_precio: i.fecha_precio || undefined,
    })) || []
  );
  const [search, setSearch] = useState('');

  const { data: ingData } = useQuery({
    queryKey: ['ingredientes', {}],
    queryFn: () => ingredientesApi.getAll(),
  });

  const { data: conceptosData } = useQuery({ queryKey: ['conceptos'], queryFn: () => conceptosApi.getAll() });

  const allIngredientes: Ingrediente[] = ingData?.data || [];
  const resumenCanales = conceptosData?.data?.resumen_canales as ResumenCanales | undefined;

  // Enrich items with fecha_precio from allIngredientes (loaded async)
  const enrichedItems = useMemo(() => {
    if (allIngredientes.length === 0) return items;
    return items.map((item) => {
      if (!item.fecha_precio) {
        const ing = allIngredientes.find((i) => i.id === item.ingrediente_id);
        if (ing?.fecha_precio) return { ...item, fecha_precio: ing.fecha_precio };
      }
      return item;
    });
  }, [items, allIngredientes]);

  const filtered = search.length >= 2
    ? allIngredientes.filter((i) =>
        normalizarTexto(i.nombre).includes(normalizarTexto(search)) &&
        !items.some((item) => item.ingrediente_id === i.id)
      ).slice(0, 8)
    : [];

  const costoTotal = items.reduce((s, i) => s + i.cantidad * i.costo_con_desperdicio, 0);
  const costoPor100g = rendimiento > 0 ? (costoTotal / rendimiento) * 100 : 0;
  const costoPorPorcion = tipoRendimiento === 'porciones' && rendimiento > 0 ? costoTotal / rendimiento : null;
  const precioPorKg = tipoRendimiento === 'gramos' && rendimiento > 0 ? (costoTotal / rendimiento) * 1000 : null;
  const mcKgTarjeta = precioPorKg !== null && precioVentaKg > 0 && resumenCanales ? calcularMCNeto(precioVentaKg, precioPorKg, resumenCanales.tarjeta) : null;
  const mcKgEfectivo = precioPorKg !== null && precioVentaKg > 0 && resumenCanales ? calcularMCNeto(precioVentaKg, precioPorKg, resumenCanales.efectivo) : null;

  const addItem = (ing: Ingrediente) => {
    setItems([...items, {
      ingrediente_id: ing.id,
      nombre: ing.nombre,
      cantidad: 0,
      unidad: ing.unidad_abrev || 'g',
      costo_con_desperdicio: Number(ing.costo_con_desperdicio) || 0,
      fecha_precio: ing.fecha_precio || undefined,
    }]);
    setSearch('');
  };

  const updateQty = (idx: number, qty: number) => {
    const next = [...items];
    next[idx].cantidad = qty;
    setItems(next);
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const createMut = useMutation({
    mutationFn: () => subrecetasApi.create({
      nombre, rendimiento_gramos: rendimiento, tipo_rendimiento: tipoRendimiento, notas: notas || undefined,
      ...nutriPayload(),
      ingredientes: items.map((i) => ({ ingrediente_id: i.ingrediente_id, cantidad: i.cantidad, unidad: i.unidad })),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['subrecetas'] }); toast.success('Subreceta creada'); onClose(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => subrecetasApi.update(subrecetaId!, {
      nombre, rendimiento_gramos: rendimiento, tipo_rendimiento: tipoRendimiento, notas: notas || undefined,
      ...nutriPayload(),
      ingredientes: items.map((i) => ({ ingrediente_id: i.ingrediente_id, cantidad: i.cantidad, unidad: i.unidad })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subrecetas'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Subreceta actualizada'); onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!nombre.trim()) return toast.error('Nombre es requerido');
    if (items.length === 0) return toast.error('Agregar al menos 1 ingrediente');
    subrecetaId ? updateMut.mutate() : createMut.mutate();
  };

  return (
    <Modal isOpen onClose={onClose} title={subrecetaId ? 'Editar Subreceta' : 'Nueva Subreceta'} size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={handleSubmit} loading={createMut.isPending || updateMut.isPending}>{subrecetaId ? 'Guardar' : 'Crear'}</Button></>}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Rendimiento</label>
          <div className="flex gap-2">
            <NumericInput value={rendimiento} onChange={(v) => setRendimiento(v || 1)} min={1} step="1"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <select value={tipoRendimiento} onChange={(e) => setTipoRendimiento(e.target.value as 'gramos' | 'porciones')}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
              <option value="gramos">Gramos</option>
              <option value="porciones">Porciones</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-text-muted mb-1">Notas</label>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas opcionales..."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>

      {/* Info nutricional por unidad — fila compacta, todos los campos opcionales */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-text-muted mb-1">
          🍎 Info nutricional <span className="font-normal">(por {tipoRendimiento === 'porciones' ? 'porcion' : '100g'}, opcional)</span>
        </label>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
          {([
            { key: 'nutri_energia_kcal', label: 'Energia', unit: 'kcal' },
            { key: 'nutri_proteinas_g', label: 'Prot.', unit: 'g' },
            { key: 'nutri_carbohidratos_g', label: 'Carbs', unit: 'g' },
            { key: 'nutri_azucares_g', label: 'Azuc.', unit: 'g' },
            { key: 'nutri_grasas_g', label: 'Grasas', unit: 'g' },
            { key: 'nutri_grasas_sat_g', label: 'Sat.', unit: 'g' },
            { key: 'nutri_grasas_trans_g', label: 'Trans', unit: 'g' },
            { key: 'nutri_sodio_mg', label: 'Sodio', unit: 'mg' },
          ] as const).map((f) => (
            <div key={f.key} className="min-w-0">
              <div className="text-[9px] text-text-muted leading-tight mb-0.5 truncate" title={`${f.label} (${f.unit})`}>
                {f.label} <span className="opacity-70">{f.unit}</span>
              </div>
              <input
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                value={nutri[f.key]}
                onChange={(e) => setNutriField(f.key, e.target.value)}
                placeholder="—"
                className="w-full px-1.5 py-1.5 text-xs text-right border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Ingredient search */}
      <div className="relative mb-4">
        <label className="block text-xs font-medium text-text-muted mb-1">Agregar ingrediente</label>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ingrediente..."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        {filtered.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((ing) => (
              <button key={ing.id} onClick={() => addItem(ing)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                {ing.nombre} <span className="text-text-muted">({ing.unidad_abrev})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recipe items */}
      {items.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-text-muted">
                <th className="px-3 py-2 text-left font-medium">Ingrediente</th>
                <th className="px-3 py-2 text-right font-medium w-28">Cantidad</th>
                <th className="px-3 py-2 text-center font-medium w-16">Unid.</th>
                <th className="px-3 py-2 text-right font-medium w-28">Subtotal</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {enrichedItems.map((item, idx) => {
                const stale = isStalePrice(item.fecha_precio);
                const href = item.ingrediente_id ? `/ingredientes?openId=${item.ingrediente_id}` : null;
                return (
                <tr key={idx} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${stale ? 'text-red-600 font-medium' : 'text-primary'} hover:underline cursor-pointer`}
                        title="Abrir ingrediente en nueva pestania"
                      >
                        {item.nombre}
                      </a>
                    ) : (
                      <span className={stale ? 'text-red-600 font-medium' : ''}>{item.nombre}</span>
                    )}
                    {stale && (
                      <div className="text-[10px] text-red-500 leading-tight">Precio no actualizado hace 45 dias</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <NumericInput value={item.cantidad} onChange={(v) => updateQty(idx, v)}
                      min={0} step="0.01" className="w-full text-right px-2 py-1 text-sm border border-gray-300 rounded" />
                  </td>
                  <td className="px-3 py-2 text-center text-text-muted">{item.unidad}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(item.cantidad * item.costo_con_desperdicio)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeItem(idx)} className="text-text-muted hover:text-danger cursor-pointer">
                      <X size={14} />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Cost summary */}
      <div className="p-4 bg-gray-50 rounded-lg grid grid-cols-2 gap-4">
        <div>
          <span className="text-xs text-text-muted">Costo Total</span>
          <div className="text-lg font-bold">{formatMoney(costoTotal)}</div>
        </div>
        <div>
          <span className="text-xs text-text-muted">
            {costoPorPorcion !== null ? 'Costo / porcion' : 'Costo / 100g'}
          </span>
          <div className="text-lg font-bold text-primary">
            {formatMoney(costoPorPorcion !== null ? costoPorPorcion : costoPor100g)}
          </div>
        </div>
        {precioPorKg !== null && (
          <div className="col-span-2 pt-2 border-t border-gray-200 space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs text-text-muted">Costo / kg</span>
                <div className="text-lg font-bold text-primary">{formatMoney(precioPorKg)}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Precio venta/kg</span>
                <NumericInput value={precioVentaKg} onChange={(v) => setPrecioVentaKg(v)} min={0} step="0.01"
                  placeholder="Ej: 15000"
                  className="w-28 text-right px-2 py-1 text-sm border border-gray-300 rounded" />
              </div>
            </div>
            {mcKgTarjeta && mcKgEfectivo && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '💳 Tarjeta', data: mcKgTarjeta },
                  { label: '💵 Efectivo', data: mcKgEfectivo },
                ].map((ch) => (
                  <div key={ch.label} className="p-2 bg-white rounded border border-gray-200">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium">{ch.label}</span>
                      <MCBadge value={ch.data.mc} size="sm" />
                    </div>
                    <div className="space-y-0.5 text-[11px] text-text-muted">
                      <div className="flex justify-between"><span>Precio</span><span>{formatMoney(precioVentaKg)}</span></div>
                      {ch.data.deducciones.map((d, i) => (
                        <div key={i} className="flex justify-between"><span>(-) {d.nombre} {d.porcentaje}%</span><span>{formatMoney(d.monto)}</span></div>
                      ))}
                      <div className="flex justify-between"><span>(-) Costo/kg</span><span>{formatMoney(precioPorKg)}</span></div>
                      <div className="flex justify-between font-bold text-text-primary pt-0.5 border-t border-gray-100">
                        <span>Ganancia/kg</span>
                        <span style={{ color: getMCColor(ch.data.mc) }}>{formatMoney(ch.data.ganancia)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
