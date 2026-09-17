import { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Download, ChefHat, X, Package, CookingPot, ExternalLink } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ingredientesApi } from '../api/ingredientes';
import type { IngredienteUsoData } from '../api/ingredientes';
import { unidadesApi } from '../api/unidades';
import { proveedoresApi } from '../api/proveedores';
import type { Ingrediente, Unidad, Proveedor } from '../types';
import { formatMoney, formatDate } from '../utils/formatters';
import { useIngredientesStore } from '../stores/ingredientesStore';
import { useDebounce } from '../hooks/useDebounce';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import SearchInput from '../components/common/SearchInput';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import NumericInput from '../components/common/NumericInput';

export default function Ingredientes() {
  const { filtros, setFiltro, modalOpen, editingId, openModal, closeModal } = useIngredientesStore();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [usoIngrediente, setUsoIngrediente] = useState<{ id: number; nombre: string } | null>(null);
  const [soloNoUsados, setSoloNoUsados] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const debouncedBuscar = useDebounce(filtros.buscar);
  const queryClient = useQueryClient();

  const queryParams = useMemo(() => ({
    ...(debouncedBuscar && { buscar: debouncedBuscar }),
    ...(filtros.orden && { orden: filtros.orden }),
    ...(filtros.antiguedad && { antiguedad: filtros.antiguedad }),
    ...(filtros.fechaDesde && { fecha_desde: filtros.fechaDesde }),
    ...(filtros.fechaHasta && { fecha_hasta: filtros.fechaHasta }),
    ...(soloNoUsados && { solo_no_usados: 1 }),
  }), [debouncedBuscar, filtros.orden, filtros.antiguedad, filtros.fechaDesde, filtros.fechaHasta, soloNoUsados]);

  const { data, isLoading } = useQuery({
    queryKey: ['ingredientes', queryParams],
    queryFn: () => ingredientesApi.getAll(queryParams),
  });

  // Deep-link: si llega ?openId=N en la URL, abrir directamente el modal de ese ingrediente
  // y limpiar el parametro. Espera a que la lista cargue para que el form se popule.
  const [searchParams, setSearchParams] = useSearchParams();
  const [openIdProcessed, setOpenIdProcessed] = useState(false);
  const ingredientesList: Ingrediente[] = data?.data || [];
  useEffect(() => {
    if (openIdProcessed) return;
    const openIdRaw = searchParams.get('openId');
    if (!openIdRaw) {
      setOpenIdProcessed(true);
      return;
    }
    if (ingredientesList.length === 0) return;

    const id = Number(openIdRaw);
    if (!Number.isNaN(id) && ingredientesList.some((i) => i.id === id)) {
      openModal(id);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('openId');
    setSearchParams(next, { replace: true });
    setOpenIdProcessed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredientesList, openIdProcessed]);

  const { data: unidadesData } = useQuery({
    queryKey: ['unidades'],
    queryFn: () => unidadesApi.getAll(),
  });

  const { data: proveedoresData } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => proveedoresApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ingredientesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredientes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Ingrediente eliminado');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: number[]) => ingredientesApi.bulkDelete(ids),
    onSuccess: (res) => {
      const el = res?.data?.total_eliminados ?? 0;
      const om = res?.data?.total_omitidos ?? 0;
      if (el > 0) {
        toast.success(`${el} eliminado${el === 1 ? '' : 's'}${om > 0 ? ` · ${om} omitido${om === 1 ? '' : 's'} (en uso)` : ''}`);
      } else {
        toast.error(om > 0 ? `Ninguno eliminado: ${om} en uso` : 'Nada para eliminar');
      }
      queryClient.invalidateQueries({ queryKey: ['ingredientes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setSeleccionados(new Set());
      setBulkConfirmOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const ingredientesRaw: Ingrediente[] = (data?.data || []).map((ing: Ingrediente) => ({
    ...ing,
    precio1: Number(ing.precio1) || 0,
    precio2: Number(ing.precio2) || 0,
    contenido_envase: Number(ing.contenido_envase) || 1,
    desperdicio: Number(ing.desperdicio) || 0,
    costo_unitario: Number(ing.costo_unitario) || 0,
    costo_con_desperdicio: Number(ing.costo_con_desperdicio) || 0,
  }));

  // Extract unique proveedores for filter dropdown
  const proveedores = useMemo(() => {
    const set = new Set<string>();
    ingredientesRaw.forEach((ing) => {
      if (ing.proveedor1) set.add(ing.proveedor1);
      if (ing.proveedor2) set.add(ing.proveedor2);
    });
    return Array.from(set).sort();
  }, [ingredientesRaw]);

  // Client-side filters: proveedor + precioViejo (work together)
  const ingredientes = useMemo(() => {
    return ingredientesRaw.filter((ing) => {
      // Proveedor filter
      if (filtros.proveedor && ing.proveedor1 !== filtros.proveedor && ing.proveedor2 !== filtros.proveedor) return false;
      // Stale price filter
      if (filtros.precioViejo) {
        const stale = ing.fecha_precio && (Date.now() - new Date(ing.fecha_precio).getTime()) > 45 * 86400000;
        if (filtros.precioViejo === 'desactualizado' && !stale) return false;
        if (filtros.precioViejo === 'actualizado' && stale) return false;
      }
      return true;
    });
  }, [ingredientesRaw, filtros.proveedor, filtros.precioViejo]);

  const unidades: Unidad[] = unidadesData?.data || [];
  const proveedoresList: Proveedor[] = proveedoresData?.data || [];

  // Seleccion masiva: solo cuenta lo VISIBLE (no borra ocultos por filtro)
  const visibleIds = useMemo(() => ingredientes.map((i) => i.id), [ingredientes]);
  const selectedVisible = useMemo(() => visibleIds.filter((id) => seleccionados.has(id)), [visibleIds, seleccionados]);
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const someSelected = selectedVisible.length > 0 && !allSelected;

  const toggleOne = (id: number) => setSeleccionados((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAll = () => setSeleccionados((prev) => {
    const n = new Set(prev);
    if (allSelected) visibleIds.forEach((id) => n.delete(id));
    else visibleIds.forEach((id) => n.add(id));
    return n;
  });

  const exportCSV = () => {
    const headers = ['Nombre', 'Proveedor 1', 'Proveedor 2', 'Categoria', 'Unidad', 'Contenido Envase', 'Precio 1', 'Precio 2', 'Costo/u', 'Desperdicio %', 'Costo c/desp', 'Fecha Precio'];
    const rows = ingredientes.map((ing) => [
      ing.nombre, ing.proveedor1 || '', ing.proveedor2 || '', ing.categoria || '',
      ing.unidad_abrev || '', ing.contenido_envase, ing.precio1, ing.precio2,
      ing.costo_unitario, ing.desperdicio, ing.costo_con_desperdicio,
      ing.fecha_precio ? new Date(ing.fecha_precio).toLocaleDateString('es-AR') : '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ingredientes_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="w-full sm:flex-1 sm:min-w-[200px]">
          <SearchInput value={filtros.buscar} onChange={(v) => setFiltro('buscar', v)} placeholder="Buscar ingrediente..." />
        </div>
        <select
          value={filtros.proveedor}
          onChange={(e) => setFiltro('proveedor', e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filtros.orden}
          onChange={(e) => setFiltro('orden', e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
        >
          <option value="nombre">Nombre A-Z</option>
          <option value="uso_recetas">Mayor uso en recetas</option>
          <option value="precio">Mayor precio</option>
          <option value="fecha_desc">Precio mas reciente</option>
          <option value="antiguedad">Precio mas antiguo</option>
        </select>
        <select
          value={filtros.precioViejo}
          onChange={(e) => setFiltro('precioViejo', e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
        >
          <option value="">Precio: Todos</option>
          <option value="desactualizado">🔴 Sin actualizar (+45 dias)</option>
          <option value="actualizado">🟢 Actualizado</option>
        </select>
        <label className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg cursor-pointer select-none ${soloNoUsados ? 'border-primary bg-primary/5 text-primary' : 'border-gray-300'}`}>
          <input type="checkbox" checked={soloNoUsados} onChange={(e) => setSoloNoUsados(e.target.checked)} className="rounded" />
          Solo sin usar
        </label>
        <Button variant="secondary" onClick={exportCSV}>
          <Download size={16} /> CSV
        </Button>
        <Button onClick={() => openModal()}>
          <Plus size={16} /> Nuevo
        </Button>
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-xs text-text-muted">Filtrar por fecha de precio:</label>
        <input
          type="date"
          value={filtros.fechaDesde}
          onChange={(e) => setFiltro('fechaDesde', e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
          placeholder="Desde"
        />
        <span className="text-xs text-text-muted">a</span>
        <input
          type="date"
          value={filtros.fechaHasta}
          onChange={(e) => setFiltro('fechaHasta', e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
          placeholder="Hasta"
        />
        {(filtros.fechaDesde || filtros.fechaHasta) && (
          <button
            onClick={() => { setFiltro('fechaDesde', ''); setFiltro('fechaHasta', ''); }}
            className="text-xs text-primary hover:underline cursor-pointer"
          >
            Limpiar fechas
          </button>
        )}
      </div>

      {/* Barra de accion masiva */}
      {selectedVisible.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-primary">{selectedVisible.length} seleccionado{selectedVisible.length === 1 ? '' : 's'}</span>
          <button onClick={() => setSeleccionados(new Set())} className="text-xs text-text-muted hover:text-text-primary">Deseleccionar</button>
          <button onClick={() => setBulkConfirmOpen(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700">
            <Trash2 size={14} /> Eliminar seleccionados
          </button>
        </div>
      )}

      {/* Table */}
      {isLoading ? <LoadingSpinner /> : ingredientes.length === 0 ? <EmptyState message="No hay ingredientes" /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleAll} className="rounded cursor-pointer" title="Seleccionar todos (los visibles)" />
                </th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Proveedor</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Categoria</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Unidad</th>
                <th className="px-4 py-3 font-medium text-right">Precio</th>
                <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Costo/u</th>
                <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Desp.</th>
                <th className="px-4 py-3 font-medium text-right">Costo c/desp</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Ult. Precio</th>
                <th className="px-4 py-3 font-medium text-center hidden md:table-cell">Uso</th>
                <th className="px-4 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {ingredientes.map((ing) => {
                const stale = ing.fecha_precio && (Date.now() - new Date(ing.fecha_precio).getTime()) > 45 * 86400000;
                const sel = seleccionados.has(ing.id);
                return (
                <tr key={ing.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${sel ? 'bg-primary/5' : stale ? 'bg-red-50/40' : ''}`}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={sel} onChange={() => toggleOne(ing.id)} className="rounded cursor-pointer" />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${stale ? 'text-red-600' : ''}`}>{ing.nombre}</span>
                    {ing.sya_codigo && (
                      <span
                        className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold align-middle"
                        title={`Costo actualizado por Sabor y Aroma (envío ${ing.sya_codigo}${ing.sya_fecha ? `, ${new Date(ing.sya_fecha).toLocaleDateString('es-AR')}` : ''})`}
                      >
                        SyA
                      </span>
                    )}
                    {stale && <div className="text-[10px] text-red-500 leading-tight">Precio sin actualizar hace +45 dias</div>}
                  </td>
                  <td className="px-4 py-3 text-text-muted text-xs hidden md:table-cell">{ing.proveedor1 || '-'}</td>
                  <td className="px-4 py-3 text-text-muted hidden md:table-cell">{ing.categoria || '-'}</td>
                  <td className="px-4 py-3 text-text-muted hidden sm:table-cell">{ing.unidad_abrev || '-'}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(ing.precio1)}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">{formatMoney(ing.costo_unitario)}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">{Number(ing.desperdicio).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(ing.costo_con_desperdicio)}</td>
                  <td className="px-4 py-3 text-xs text-text-muted hidden sm:table-cell">{formatDate(ing.fecha_precio)}</td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    {(ing.uso_recetas ?? 0) > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-primary/10 text-primary text-xs font-bold" title={`Usado en ${ing.uso_recetas} receta(s)`}>
                        {ing.uso_recetas}
                      </span>
                    ) : (
                      <span className="text-[11px] text-text-muted/70">sin usar</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setUsoIngrediente({ id: ing.id, nombre: ing.nombre })}
                        className="p-1.5 text-text-muted hover:text-blue-600 cursor-pointer"
                        title="Ver recetas que usan este ingrediente"
                      >
                        <ChefHat size={14} />
                      </button>
                      <button onClick={() => openModal(ing.id)} className="p-1.5 text-text-muted hover:text-primary cursor-pointer" title="Editar">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteId(ing.id)} className="p-1.5 text-text-muted hover:text-danger cursor-pointer" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit/Create Modal */}
      {modalOpen && (
        <IngredienteModal
          ingredienteId={editingId}
          ingredientes={ingredientes}
          unidades={unidades}
          proveedoresList={proveedoresList}
          onClose={closeModal}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Eliminar ingrediente"
        message="Esta seguro que desea eliminar este ingrediente?"
        loading={deleteMutation.isPending}
      />

      {/* Modal de uso del ingrediente */}
      {usoIngrediente && (
        <UsoIngredienteModal
          ingredienteId={usoIngrediente.id}
          nombre={usoIngrediente.nombre}
          onClose={() => setUsoIngrediente(null)}
        />
      )}

      {/* Confirmacion de borrado masivo (con lista de nombres y desenlace por item) */}
      {bulkConfirmOpen && (
        <Modal
          isOpen
          onClose={() => setBulkConfirmOpen(false)}
          title="Eliminar ingredientes seleccionados"
          footer={
            <>
              <Button variant="secondary" onClick={() => setBulkConfirmOpen(false)}>Cancelar</Button>
              <button
                onClick={() => bulkDeleteMut.mutate(selectedVisible)}
                disabled={bulkDeleteMut.isPending}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleteMut.isPending ? 'Eliminando...' : `Eliminar (${selectedVisible.length})`}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              Se eliminan solo los que <strong>no se usan</strong> en ninguna receta. Los que estan en uso se <strong>saltean</strong> automaticamente (no se borran).
            </div>
            <p className="text-sm text-text-muted">{selectedVisible.length} ingrediente{selectedVisible.length === 1 ? '' : 's'} seleccionado{selectedVisible.length === 1 ? '' : 's'}:</p>
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {ingredientes.filter((i) => seleccionados.has(i.id)).map((i) => {
                const usado = (i.uso_recetas ?? 0) > 0;
                return (
                  <div key={i.id} className="flex items-center justify-between px-3 py-1.5 text-sm gap-2">
                    <span className="truncate">{i.nombre}</span>
                    {usado
                      ? <span className="text-[11px] text-amber-600 shrink-0">en {i.uso_recetas} receta{i.uso_recetas === 1 ? '' : 's'} — se saltea</span>
                      : <span className="text-[11px] text-green-600 shrink-0">sin usar — se elimina</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =============================================================================
// MODAL DE USO DEL INGREDIENTE
// Muestra productos y subrecetas que usan el ingrediente, con click-to-open.
// =============================================================================
function UsoIngredienteModal({ ingredienteId, nombre, onClose }: {
  ingredienteId: number;
  nombre: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['ingredientes', ingredienteId, 'uso'],
    queryFn: () => ingredientesApi.getUso(ingredienteId),
  });

  const uso: IngredienteUsoData | null = data?.data || null;

  function abrirProducto(id: number) {
    onClose();
    navigate(`/productos?openId=${id}`);
  }

  function abrirSubreceta(id: number) {
    onClose();
    navigate(`/subrecetas?openId=${id}`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="font-bold text-text-primary flex items-center gap-2">
              <ChefHat size={18} className="text-primary shrink-0" />
              <span className="truncate">Recetas que usan: {nombre}</span>
            </h3>
            {uso && (
              <p className="text-xs text-text-muted mt-0.5">
                {uso.total_productos} producto{uso.total_productos === 1 ? '' : 's'}
                {' · '}
                {uso.total_subrecetas} subreceta{uso.total_subrecetas === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="text-center py-12 text-text-muted text-sm">Cargando...</div>
          ) : error ? (
            <div className="text-center py-12 text-red-600 text-sm">
              Error al cargar el uso del ingrediente
            </div>
          ) : !uso || (uso.total_productos === 0 && uso.total_subrecetas === 0) ? (
            <div className="text-center py-12">
              <ChefHat size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-text-muted">
                Este ingrediente no se esta usando en ninguna receta todavia
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Productos */}
              {uso.productos.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-text-primary mb-2 flex items-center gap-2">
                    <Package size={16} className="text-blue-500" />
                    Productos ({uso.productos.length})
                  </h4>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {uso.productos.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => abrirProducto(p.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 last:border-0 hover:bg-blue-50/50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-text-primary truncate">{p.nombre}</span>
                            {p.es_borrador && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Borrador</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 text-xs text-text-muted mt-0.5">
                            <span>
                              Usa <strong className="text-text-primary font-mono">{Number(p.cantidad)}</strong> {p.unidad}
                            </span>
                            {p.categoria_nombre && (
                              <span>{p.categoria_icono} {p.categoria_nombre}</span>
                            )}
                          </div>
                        </div>
                        <ExternalLink size={14} className="text-gray-400 group-hover:text-blue-600 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Subrecetas */}
              {uso.subrecetas.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-text-primary mb-2 flex items-center gap-2">
                    <CookingPot size={16} className="text-amber-600" />
                    Subrecetas ({uso.subrecetas.length})
                  </h4>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {uso.subrecetas.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => abrirSubreceta(s.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 last:border-0 hover:bg-amber-50/50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-text-primary truncate">{s.nombre}</div>
                          <div className="flex flex-wrap gap-x-3 text-xs text-text-muted mt-0.5">
                            <span>
                              Usa <strong className="text-text-primary font-mono">{Number(s.cantidad)}</strong> {s.unidad}
                            </span>
                            <span>Rinde por {s.tipo_rendimiento}</span>
                          </div>
                        </div>
                        <ExternalLink size={14} className="text-gray-400 group-hover:text-amber-600 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-text-muted text-center pt-2 border-t border-gray-100">
                Click en cualquier item para abrir su modal de edicion
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function IngredienteModal({ ingredienteId, ingredientes, unidades, proveedoresList, onClose }: {
  ingredienteId: number | null;
  ingredientes: Ingrediente[];
  unidades: Unidad[];
  proveedoresList: Proveedor[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  // FIX Bug 1 & 3: Find ingredient directly from the passed array, not from cache with wrong key
  const existing = ingredienteId ? ingredientes.find((i) => i.id === ingredienteId) : null;

  const [form, setForm] = useState({
    nombre: existing?.nombre || '',
    categoria: existing?.categoria || '',
    unidad_id: existing?.unidad_id || 2,
    contenido_envase: Number(existing?.contenido_envase) || 1,
    desperdicio: Number(existing?.desperdicio) || 0,
    proveedor1: existing?.proveedor1 || '',
    precio1: Number(existing?.precio1) || 0,
    proveedor2: existing?.proveedor2 || '',
    precio2: Number(existing?.precio2) || 0,
    fecha_precio: existing?.fecha_precio?.split('T')[0] || new Date().toISOString().split('T')[0],
    notas: existing?.notas || '',
  });

  // FIX: Recalculate cost preview with proper number types
  const costoUnitario = form.contenido_envase > 0 ? form.precio1 / form.contenido_envase : 0;
  const costoConDesp = form.desperdicio > 0 && form.desperdicio < 100
    ? costoUnitario / (1 - form.desperdicio / 100)
    : costoUnitario;

  // Get the selected unit abbreviation for display
  const selectedUnit = unidades.find((u) => u.id === form.unidad_id);
  const unitLabel = selectedUnit?.abreviatura || '';

  const createMut = useMutation({
    mutationFn: () => ingredientesApi.create(form as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredientes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Ingrediente creado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => ingredientesApi.update(ingredienteId!, form as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredientes'] });
      queryClient.invalidateQueries({ queryKey: ['subrecetas'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Ingrediente actualizado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!form.nombre.trim()) return toast.error('Nombre es requerido');
    if (form.contenido_envase <= 0) return toast.error('Contenido envase debe ser mayor a 0');
    if (ingredienteId) updateMut.mutate();
    else createMut.mutate();
  };

  const set = (key: string, value: string | number) => setForm((f) => {
    const updated = { ...f, [key]: value };
    if (key === 'precio1') {
      updated.fecha_precio = new Date().toISOString().split('T')[0];
    }
    return updated;
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={ingredienteId ? 'Editar Ingrediente' : 'Nuevo Ingrediente'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={createMut.isPending || updateMut.isPending}>
            {ingredienteId ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
          <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Categoria</label>
          <input value={form.categoria} onChange={(e) => set('categoria', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Unidad de medida</label>
          <select value={form.unidad_id} onChange={(e) => set('unidad_id', Number(e.target.value))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            Contenido envase ({unitLabel})
          </label>
          <NumericInput value={form.contenido_envase} onChange={(v) => set('contenido_envase', v)} min={0.01} step="0.01"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Proveedor 1</label>
          <select value={form.proveedor1} onChange={(e) => set('proveedor1', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Sin proveedor</option>
            {proveedoresList.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Precio envase Prov. 1 ($)</label>
          <NumericInput value={form.precio1} onChange={(v) => set('precio1', v)} min={0} step="0.01"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Proveedor 2</label>
          <select value={form.proveedor2} onChange={(e) => set('proveedor2', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Sin proveedor</option>
            {proveedoresList.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Precio envase Prov. 2 ($)</label>
          <NumericInput value={form.precio2} onChange={(v) => set('precio2', v)} min={0} step="0.01"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Desperdicio %</label>
          <NumericInput value={form.desperdicio} onChange={(v) => set('desperdicio', v)} min={0} max={99} step="1"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Fecha precio</label>
          <input type="date" value={form.fecha_precio}
            onChange={(e) => set('fecha_precio', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-text-muted mb-1">Notas</label>
          <textarea value={form.notas} onChange={(e) => set('notas', e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>

      {/* Cost Preview */}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <p className="text-xs text-text-muted mb-2">Vista previa de costos (calculado automaticamente)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <span className="text-xs text-text-muted">Costo por {unitLabel || 'unidad'}</span>
            <div className="text-lg font-bold">{formatMoney(costoUnitario)}</div>
          </div>
          <div>
            <span className="text-xs text-text-muted">Costo con desperdicio</span>
            <div className="text-lg font-bold text-primary">{formatMoney(costoConDesp)}</div>
          </div>
          <div>
            <span className="text-xs text-text-muted">Calculo</span>
            <div className="text-xs text-text-muted mt-1">
              {formatMoney(form.precio1)} / {form.contenido_envase} {unitLabel} = {formatMoney(costoUnitario)}/{unitLabel}
              {form.desperdicio > 0 && <><br />+ {form.desperdicio}% desp. = {formatMoney(costoConDesp)}/{unitLabel}</>}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
