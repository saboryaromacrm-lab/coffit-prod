import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Search, Send, AlertCircle, Package, Truck, Plus, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { colabBase as getColabBase } from '../utils/colabBase';
import toast from 'react-hot-toast';
import { enviosApi } from '../api/envios';
import { formatMoney } from '../utils/formatters';
import type { Envio, EnvioInput, EnvioCatalogo } from '../types';

type TabType = 'envios' | 'vencidos';

interface CarritoItem {
  producto_id: number | null;
  producto_nombre: string;
  cantidad_enviada: number;
  porciones: number;
  peso_total_g: number | null;
  costo_total: number;
  observacion: string;
}

export default function EnviosSaboryAroma() {
  const navigate = useNavigate();
  const location = useLocation();
  const colabBase = getColabBase(location.pathname);
  const [activeTab, setActiveTab] = useState<TabType>('envios');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-sidebar px-4 py-3 flex items-center justify-between">
        <span className="text-lg font-bold text-primary">Envios a Sabor y Aroma</span>
        <button
          onClick={() => navigate(`${colabBase}/envios-coffit`)}
          className="flex items-center gap-1 text-white/60 hover:text-white text-xs bg-white/10 px-2 py-1 rounded"
        >
          <Truck size={12} /> Envios a Coffit
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('envios')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'envios'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Send size={18} /> Envios
          </button>
          <button
            onClick={() => setActiveTab('vencidos')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'vencidos'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <AlertCircle size={18} /> Vencidos
          </button>
        </div>

        {activeTab === 'envios' && <TabEnvios />}
        {activeTab === 'vencidos' && <TabVencidos />}
      </div>
    </div>
  );
}

// =============================================================================
// TAB ENVIOS — carrito + historial editable
// =============================================================================
function TabEnvios() {
  const queryClient = useQueryClient();

  const [fecha, setFecha] = useState(new Date().toISOString().substring(0, 10));
  const [itemActual, setItemActual] = useState<CarritoItem | null>(null);
  const [cantidadActual, setCantidadActual] = useState<number>(0);
  const [obsActual, setObsActual] = useState<string>('');
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);

  const [buscar, setBuscar] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: enviosRes, isLoading } = useQuery({
    queryKey: ['envios', buscar, desde, hasta],
    queryFn: () =>
      enviosApi.getAll({
        buscar: buscar || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      }),
  });

  const { data: catalogoRes, isLoading: isLoadingCatalogo, error: catalogoError } = useQuery({
    queryKey: ['envios-catalogo'],
    queryFn: () => enviosApi.getCatalogo(),
    staleTime: 60_000,
  });

  const envios: Envio[] = enviosRes?.data || [];
  const catalogo: EnvioCatalogo[] = catalogoRes?.data || [];

  const filteredCatalogo = itemSearch.trim()
    ? catalogo.filter((item) =>
        item.nombre.toLowerCase().includes(itemSearch.toLowerCase())
      )
    : catalogo;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowItemDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const createBatchMut = useMutation({
    mutationFn: (payload: EnvioInput[]) => enviosApi.createBatch(payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['envios'] });
      toast.success(`${vars.length} producto${vars.length > 1 ? 's' : ''} registrado${vars.length > 1 ? 's' : ''}`);
      setCarrito([]);
      setItemActual(null);
      setCantidadActual(0);
      setObsActual('');
      setItemSearch('');
    },
    onError: (err: Error) => toast.error(err.message || 'Error al registrar'),
  });

  const updateVencidosMut = useMutation({
    mutationFn: ({ id, cantidad }: { id: number; cantidad: number }) =>
      enviosApi.updateVencidos(id, cantidad),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envios'] });
      toast.success('Vencidos actualizados');
    },
    onError: (err: Error) => toast.error(err.message || 'Error al actualizar'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => enviosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envios'] });
      toast.success('Envio eliminado');
    },
    onError: (err: Error) => toast.error(err.message || 'Error al eliminar'),
  });

  function selectItem(item: EnvioCatalogo) {
    setItemActual({
      producto_id: item.id,
      producto_nombre: item.nombre,
      porciones: Number(item.porciones) || 1,
      peso_total_g: item.peso_total_g != null ? Number(item.peso_total_g) : null,
      costo_total: Number(item.costo_total) || 0,
      cantidad_enviada: 0,
      observacion: '',
    });
    setItemSearch(item.nombre);
    setShowItemDropdown(false);
  }

  function agregarAlCarrito() {
    if (!itemActual) {
      toast.error('Selecciona un producto primero');
      return;
    }
    if (cantidadActual <= 0) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }
    setCarrito((prev) => [
      ...prev,
      { ...itemActual, cantidad_enviada: cantidadActual, observacion: obsActual },
    ]);
    setItemActual(null);
    setCantidadActual(0);
    setObsActual('');
    setItemSearch('');
    toast.success('Producto agregado');
  }

  function quitarDelCarrito(idx: number) {
    setCarrito((prev) => prev.filter((_, i) => i !== idx));
  }

  function registrarEnvio() {
    if (carrito.length === 0) {
      toast.error('Agrega al menos un producto al envio');
      return;
    }
    const payload: EnvioInput[] = carrito.map((c) => ({
      fecha,
      producto_id: c.producto_id,
      producto_nombre: c.producto_nombre,
      cantidad_enviada: c.cantidad_enviada,
      observacion: c.observacion || null,
    }));
    createBatchMut.mutate(payload);
  }

  function formatFecha(f: string) {
    const clean = typeof f === 'string' ? f.substring(0, 10) : '';
    const parts = clean.split('-');
    if (parts.length !== 3) return clean;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  const montoTotalCarrito = carrito.reduce(
    (sum, c) => sum + c.cantidad_enviada * c.costo_total,
    0
  );

  return (
    <div className="space-y-5">
      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-text-primary flex items-center gap-2">
          <Send size={18} className="text-primary" />
          Nuevo envio a Sabor y Aroma
        </h3>

        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Fecha del envio</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full md:w-64 border border-gray-300 rounded-lg px-3 py-3 text-sm"
          />
        </div>

        {/* Seccion agregar producto */}
        <div className="border border-dashed border-gray-300 rounded-lg p-4 space-y-3 bg-gray-50/50">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wide">Agregar producto</div>

          <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium text-text-muted mb-1">Producto</label>
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => {
                setItemSearch(e.target.value);
                if (!e.target.value.trim()) setItemActual(null);
                setShowItemDropdown(true);
              }}
              onFocus={() => setShowItemDropdown(true)}
              placeholder="Buscar producto..."
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            />
            {showItemDropdown && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {isLoadingCatalogo ? (
                  <div className="px-3 py-3 text-sm text-text-muted text-center">Cargando...</div>
                ) : catalogoError ? (
                  <div className="px-3 py-3 text-sm text-red-600 text-center">
                    Error al cargar productos. Verifica que el backend este desplegado.
                  </div>
                ) : catalogo.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-text-muted text-center">
                    No hay productos cargados en el sistema
                  </div>
                ) : filteredCatalogo.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-text-muted text-center">
                    Sin resultados para "{itemSearch}"
                  </div>
                ) : (
                  filteredCatalogo.slice(0, 30).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); selectItem(item); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <div className="font-medium">{item.nombre}</div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        {Number(item.porciones) > 0 && `${Number(item.porciones)} porcion${Number(item.porciones) === 1 ? '' : 'es'}`}
                        {item.peso_total_g != null && Number(item.peso_total_g) > 0 && ` · ${Number(item.peso_total_g)} g`}
                        {Number(item.costo_total) > 0 && ` · ${formatMoney(Number(item.costo_total))}`}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Badge info producto seleccionado */}
          {itemActual && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-primary">{itemActual.producto_nombre}</span>
              <span className="text-text-muted">
                🍽️ Porciones: <strong className="text-text-primary">{itemActual.porciones}</strong>
              </span>
              {itemActual.peso_total_g != null && itemActual.peso_total_g > 0 && (
                <span className="text-text-muted">
                  ⚖️ Peso: <strong className="text-text-primary">{itemActual.peso_total_g} g</strong>
                </span>
              )}
              {itemActual.costo_total > 0 && (
                <span className="text-text-muted">
                  💰 Costo: <strong className="text-text-primary">{formatMoney(itemActual.costo_total)}</strong>
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Cantidad</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cantidadActual || ''}
                onChange={(e) => setCantidadActual(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Observacion del item</label>
              <input
                type="text"
                value={obsActual}
                onChange={(e) => setObsActual(e.target.value)}
                placeholder="Opcional..."
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={agregarAlCarrito}
              disabled={!itemActual || cantidadActual <= 0}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              <Plus size={16} /> Agregar a la lista
            </button>
          </div>
        </div>

        {/* Carrito */}
        {carrito.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">
                Productos a enviar ({carrito.length})
              </span>
              <span className="text-xs text-text-muted">
                Total: <strong className="text-text-primary">{formatMoney(montoTotalCarrito)}</strong>
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {carrito.map((item, idx) => (
                <div key={idx} className="px-4 py-2.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{item.producto_nombre}</div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-text-muted mt-0.5">
                      <span>
                        <strong className="text-text-primary font-mono">{item.cantidad_enviada}</strong> unidad{item.cantidad_enviada === 1 ? '' : 'es'}
                      </span>
                      {item.costo_total > 0 && (
                        <span>Subtotal: <strong className="text-text-primary">{formatMoney(item.cantidad_enviada * item.costo_total)}</strong></span>
                      )}
                      {item.observacion && <span className="italic">"{item.observacion}"</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => quitarDelCarrito(idx)}
                    className="p-1.5 text-gray-400 hover:text-red-600 shrink-0"
                    title="Quitar"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={registrarEnvio}
            disabled={carrito.length === 0 || createBatchMut.isPending}
            className="px-5 py-3 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {createBatchMut.isPending
              ? 'Registrando...'
              : carrito.length === 0
              ? 'Registrar envio'
              : `Registrar envio (${carrito.length} ${carrito.length === 1 ? 'item' : 'items'})`}
          </button>
        </div>
      </div>

      {/* Historial */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-text-primary">Historial de envios</h3>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Desde"
          />
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Hasta"
          />
          {(desde || hasta) && (
            <button
              onClick={() => { setDesde(''); setHasta(''); }}
              className="text-xs text-primary hover:underline"
            >
              Limpiar
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-text-muted text-sm">Cargando...</div>
        ) : envios.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
            <Package className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-text-muted text-sm">No hay envios registrados</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 font-medium text-text-muted">Fecha</th>
                  <th className="text-left px-3 py-2.5 font-medium text-text-muted">Producto</th>
                  <th className="text-right px-3 py-2.5 font-medium text-text-muted">Enviados</th>
                  <th className="text-right px-3 py-2.5 font-medium text-text-muted w-28">Vencidos</th>
                  <th className="text-right px-3 py-2.5 font-medium text-text-muted">Vendidos</th>
                  <th className="text-left px-3 py-2.5 font-medium text-text-muted">Observacion</th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {envios.map((e) => (
                  <FilaEnvio
                    key={e.id}
                    envio={e}
                    onUpdateVencidos={(cantidad) => updateVencidosMut.mutate({ id: e.id, cantidad })}
                    onDelete={() => { if (confirm('Eliminar este envio?')) deleteMut.mutate(e.id); }}
                    formatFecha={formatFecha}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {envios.length > 0 && (
          <p className="text-xs text-text-muted text-right">{envios.length} envios</p>
        )}
      </div>
    </div>
  );
}

// Fila editable de envio
function FilaEnvio({ envio, onUpdateVencidos, onDelete, formatFecha }: {
  envio: Envio;
  onUpdateVencidos: (cantidad: number) => void;
  onDelete: () => void;
  formatFecha: (fecha: string) => string;
}) {
  const [vencidosLocal, setVencidosLocal] = useState(String(Number(envio.cantidad_vencida)));
  const originalRef = useRef(String(Number(envio.cantidad_vencida)));

  // Si cambia el valor desde fuera (refetch), sincronizar
  useEffect(() => {
    const current = String(Number(envio.cantidad_vencida));
    if (current !== originalRef.current) {
      setVencidosLocal(current);
      originalRef.current = current;
    }
  }, [envio.cantidad_vencida]);

  function handleBlur() {
    const nuevoValor = parseFloat(vencidosLocal) || 0;
    const originalValor = parseFloat(originalRef.current) || 0;
    if (nuevoValor === originalValor) return;
    if (nuevoValor < 0) {
      setVencidosLocal(originalRef.current);
      return;
    }
    if (nuevoValor > Number(envio.cantidad_enviada)) {
      setVencidosLocal(originalRef.current);
      return;
    }
    originalRef.current = String(nuevoValor);
    onUpdateVencidos(nuevoValor);
  }

  const enviados = Number(envio.cantidad_enviada);
  const vencidos = parseFloat(vencidosLocal) || 0;
  const vendidos = enviados - vencidos;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2.5 whitespace-nowrap">{formatFecha(envio.fecha)}</td>
      <td className="px-3 py-2.5 font-medium text-text-primary">{envio.producto_nombre}</td>
      <td className="px-3 py-2.5 text-right font-mono">{enviados}</td>
      <td className="px-3 py-2.5">
        <input
          type="number"
          step="0.01"
          min="0"
          max={enviados}
          value={vencidosLocal}
          onChange={(e) => setVencidosLocal(e.target.value)}
          onBlur={handleBlur}
          className={`w-full text-right px-2 py-1 text-sm border rounded font-mono ${
            vencidos > 0 ? 'border-red-300 bg-red-50 text-red-700 font-bold' : 'border-gray-300'
          }`}
        />
      </td>
      <td className="px-3 py-2.5 text-right font-mono font-bold text-green-700">{vendidos}</td>
      <td className="px-3 py-2.5 text-text-muted max-w-[180px] truncate">{envio.observacion || '-'}</td>
      <td className="px-3 py-2.5">
        <button
          onClick={onDelete}
          className="p-1.5 text-gray-400 hover:text-red-600"
          title="Eliminar"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

// =============================================================================
// TAB VENCIDOS — solo lectura, muestra los envios con vencidos > 0
// =============================================================================
function TabVencidos() {
  const [buscar, setBuscar] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const { data: enviosRes, isLoading } = useQuery({
    queryKey: ['envios', 'vencidos', buscar, desde, hasta],
    queryFn: () =>
      enviosApi.getAll({
        buscar: buscar || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
        solo_vencidos: true,
      }),
  });

  const envios: Envio[] = enviosRes?.data || [];

  function formatFecha(fecha: string) {
    const clean = typeof fecha === 'string' ? fecha.substring(0, 10) : '';
    const parts = clean.split('-');
    if (parts.length !== 3) return clean;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  const totalVencidos = envios.reduce((sum, e) => sum + Number(e.cantidad_vencida), 0);
  const totalEnviados = envios.reduce((sum, e) => sum + Number(e.cantidad_enviada), 0);

  return (
    <div className="space-y-4">
      {/* Stats */}
      {envios.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-red-100 p-3 flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg shrink-0">
              <AlertCircle size={20} className="text-red-500" />
            </div>
            <div>
              <div className="text-lg font-bold text-red-600 leading-tight">{totalVencidos}</div>
              <div className="text-[11px] text-text-muted">Total vencidos</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
            <div className="p-2 bg-gray-50 rounded-lg shrink-0">
              <Package size={20} className="text-text-muted" />
            </div>
            <div>
              <div className="text-lg font-bold text-text-primary leading-tight">{envios.length}</div>
              <div className="text-[11px] text-text-muted">Items con vencidos (de {totalEnviados} enviados)</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            type="text"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="text-center py-8 text-text-muted text-sm">Cargando...</div>
      ) : envios.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <AlertCircle className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-text-muted text-sm">No hay productos vencidos</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-medium text-text-muted">Fecha</th>
                <th className="text-left px-3 py-2.5 font-medium text-text-muted">Producto</th>
                <th className="text-right px-3 py-2.5 font-medium text-text-muted">Enviados</th>
                <th className="text-right px-3 py-2.5 font-medium text-text-muted">Vencidos</th>
                <th className="text-left px-3 py-2.5 font-medium text-text-muted">Observacion</th>
              </tr>
            </thead>
            <tbody>
              {envios.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatFecha(e.fecha)}</td>
                  <td className="px-3 py-2.5 font-medium text-text-primary">{e.producto_nombre}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{Number(e.cantidad_enviada)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-red-600">
                    {Number(e.cantidad_vencida)}
                  </td>
                  <td className="px-3 py-2.5 text-text-muted max-w-[200px] truncate">
                    {e.observacion || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
