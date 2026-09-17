import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Search, Truck, AlertCircle, Package, Send, Plus, X, Pencil } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { colabBase as getColabBase } from '../utils/colabBase';
import toast from 'react-hot-toast';
import { enviosCoffitApi } from '../api/enviosCoffit';
import { formatMoney } from '../utils/formatters';
import type { EnvioCoffit, EnvioCoffitInput, EnvioCoffitCatalogo } from '../types';

type TabType = 'envios' | 'devueltos';

// Item temporal del carrito antes de enviar.
// `modo` indica como se cargo: 'base' (en gramos) o 'envase' (cantidad de envases enteros)
// cantidad_enviada SIEMPRE esta en unidad base (g/ml/etc) — es lo que se persiste.
interface CarritoItem {
  ingrediente_id: number | null;
  ingrediente_nombre: string;
  cantidad_enviada: number;     // total en unidad base
  unidad: string;               // unidad base ('g', 'ml', etc)
  contenido_envase: number;     // tamaño del envase (snapshot)
  costo_unitario: number;
  observacion: string;
  modo: 'base' | 'envase';      // como se cargo
  cantidad_envases: number | null; // si modo='envase', cantidad de envases
}

export default function EnviosCoffit() {
  const navigate = useNavigate();
  const location = useLocation();
  // Si estamos en el area colaborador, la navegacion queda dentro del link (con key).
  const colabBase = getColabBase(location.pathname);
  const [activeTab, setActiveTab] = useState<TabType>('envios');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-sidebar px-4 py-3 flex items-center justify-between">
        <span className="text-lg font-bold text-primary">Envios a Coffit</span>
        <button
          onClick={() => navigate(`${colabBase}/envios-saboryaroma`)}
          className="flex items-center gap-1 text-white/60 hover:text-white text-xs bg-white/10 px-2 py-1 rounded"
        >
          <Send size={12} /> Envios a SyA
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
            <Truck size={18} /> Envios
          </button>
          <button
            onClick={() => setActiveTab('devueltos')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'devueltos'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <AlertCircle size={18} /> Devueltos
          </button>
        </div>

        {activeTab === 'envios' && <TabEnvios />}
        {activeTab === 'devueltos' && <TabDevueltos />}
      </div>
    </div>
  );
}

function TabEnvios() {
  const queryClient = useQueryClient();

  // Envio en edicion (modal)
  const [editingEnvio, setEditingEnvio] = useState<EnvioCoffit | null>(null);

  // Fecha compartida del envio
  const [fecha, setFecha] = useState(new Date().toISOString().substring(0, 10));

  // Item en edicion (antes de agregar al carrito)
  const [itemActual, setItemActual] = useState<CarritoItem | null>(null);
  const [cantidadActual, setCantidadActual] = useState<number>(0);
  const [modoCarga, setModoCarga] = useState<'base' | 'envase'>('base');
  const [obsActual, setObsActual] = useState<string>('');

  // Carrito
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);

  const [buscar, setBuscar] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: enviosRes, isLoading } = useQuery({
    queryKey: ['envios-coffit', buscar, desde, hasta],
    queryFn: () =>
      enviosCoffitApi.getAll({
        buscar: buscar || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      }),
  });

  const { data: catalogoRes, isLoading: isLoadingCatalogo, error: catalogoError } = useQuery({
    queryKey: ['envios-coffit-catalogo'],
    queryFn: () => enviosCoffitApi.getCatalogo(),
    staleTime: 60_000,
  });

  const envios: EnvioCoffit[] = enviosRes?.data || [];
  const catalogo: EnvioCoffitCatalogo[] = catalogoRes?.data || [];

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
    mutationFn: (payload: EnvioCoffitInput[]) => enviosCoffitApi.createBatch(payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['envios-coffit'] });
      toast.success(`${vars.length} ingrediente${vars.length > 1 ? 's' : ''} registrado${vars.length > 1 ? 's' : ''}`);
      setCarrito([]);
      setItemActual(null);
      setCantidadActual(0);
      setObsActual('');
      setItemSearch('');
    },
    onError: (err: Error) => toast.error(err.message || 'Error al registrar'),
  });

  const updateDevueltosMut = useMutation({
    mutationFn: ({ id, cantidad }: { id: number; cantidad: number }) =>
      enviosCoffitApi.updateDevueltos(id, cantidad),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envios-coffit'] });
      toast.success('Devueltos actualizados');
    },
    onError: (err: Error) => toast.error(err.message || 'Error al actualizar'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => enviosCoffitApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envios-coffit'] });
      toast.success('Envio eliminado');
    },
    onError: (err: Error) => toast.error(err.message || 'Error al eliminar'),
  });

  function selectItem(item: EnvioCoffitCatalogo) {
    const contEnv = Number(item.contenido_envase) || 0;
    setItemActual({
      ingrediente_id: item.id,
      ingrediente_nombre: item.nombre,
      unidad: item.unidad,
      contenido_envase: contEnv,
      costo_unitario: Number(item.costo_unitario) || 0,
      cantidad_enviada: 0,
      observacion: '',
      modo: 'base',
      cantidad_envases: null,
    });
    // Si el ingrediente no tiene envase configurado, forzar modo base
    if (contEnv <= 0 && modoCarga === 'envase') {
      setModoCarga('base');
    }
    setItemSearch(item.nombre);
    setShowItemDropdown(false);
  }

  function agregarAlCarrito() {
    if (!itemActual) {
      toast.error('Selecciona un ingrediente primero');
      return;
    }
    if (cantidadActual <= 0) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }
    if (modoCarga === 'envase' && itemActual.contenido_envase <= 0) {
      toast.error('Este ingrediente no tiene tamaño de envase configurado. Cargalo en su ficha.');
      return;
    }

    // Calcular cantidad en unidad base segun modo
    const totalBase = modoCarga === 'envase'
      ? cantidadActual * itemActual.contenido_envase
      : cantidadActual;

    setCarrito((prev) => [
      ...prev,
      {
        ...itemActual,
        cantidad_enviada: totalBase,
        modo: modoCarga,
        cantidad_envases: modoCarga === 'envase' ? cantidadActual : null,
        observacion: obsActual,
      },
    ]);
    // Reset para agregar otro
    setItemActual(null);
    setCantidadActual(0);
    setObsActual('');
    setItemSearch('');
    toast.success('Ingrediente agregado');
  }

  function quitarDelCarrito(idx: number) {
    setCarrito((prev) => prev.filter((_, i) => i !== idx));
  }

  function registrarEnvio() {
    if (carrito.length === 0) {
      toast.error('Agrega al menos un ingrediente al envio');
      return;
    }
    const payload: EnvioCoffitInput[] = carrito.map((c) => ({
      fecha,
      ingrediente_id: c.ingrediente_id,
      ingrediente_nombre: c.ingrediente_nombre,
      cantidad_enviada: c.cantidad_enviada,
      observacion: c.observacion || null,
      // Si fue cargado por envase, mandamos los snapshots para que queden guardados
      cantidad_envases: c.modo === 'envase' ? c.cantidad_envases : null,
      contenido_envase: c.modo === 'envase' ? c.contenido_envase : null,
      unidad_base: c.modo === 'envase' ? c.unidad : null,
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
    (sum, c) => sum + c.cantidad_enviada * c.costo_unitario,
    0
  );

  return (
    <div className="space-y-5">
      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-text-primary flex items-center gap-2">
          <Truck size={18} className="text-primary" />
          Nuevo envio de SyA a Coffit
        </h3>

        {/* Fecha */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Fecha del envio</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full md:w-64 border border-gray-300 rounded-lg px-3 py-3 text-sm"
          />
        </div>

        {/* Seccion agregar ingrediente */}
        <div className="border border-dashed border-gray-300 rounded-lg p-4 space-y-3 bg-gray-50/50">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wide">Agregar ingrediente</div>

          <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium text-text-muted mb-1">Ingrediente</label>
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => {
                setItemSearch(e.target.value);
                if (!e.target.value.trim()) setItemActual(null);
                setShowItemDropdown(true);
              }}
              onFocus={() => setShowItemDropdown(true)}
              placeholder="Buscar ingrediente..."
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
            />
            {showItemDropdown && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {isLoadingCatalogo ? (
                  <div className="px-3 py-3 text-sm text-text-muted text-center">Cargando...</div>
                ) : catalogoError ? (
                  <div className="px-3 py-3 text-sm text-red-600 text-center">
                    Error al cargar ingredientes. Verifica que el backend este desplegado.
                  </div>
                ) : catalogo.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-text-muted text-center">
                    No hay ingredientes cargados en el sistema
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
                        {item.unidad}
                        {Number(item.contenido_envase) > 0 && ` · Envase: ${Number(item.contenido_envase)} ${item.unidad}`}
                        {Number(item.costo_unitario) > 0 && ` · ${formatMoney(Number(item.costo_unitario))}/${item.unidad}`}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Badge info ingrediente seleccionado */}
          {itemActual && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-primary">{itemActual.ingrediente_nombre}</span>
              <span className="text-text-muted">
                📏 Unidad: <strong className="text-text-primary">{itemActual.unidad}</strong>
              </span>
              {itemActual.contenido_envase > 0 && (
                <span className="text-text-muted">
                  📦 Envase: <strong className="text-text-primary">{itemActual.contenido_envase} {itemActual.unidad}</strong>
                </span>
              )}
              {itemActual.costo_unitario > 0 && (
                <span className="text-text-muted">
                  💰 Costo: <strong className="text-text-primary">{formatMoney(itemActual.costo_unitario)}/{itemActual.unidad}</strong>
                </span>
              )}
            </div>
          )}

          {/* Toggle modo de carga: por unidad base o por envase entero */}
          {itemActual && (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Modo de carga</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setModoCarga('base'); setCantidadActual(0); }}
                  className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    modoCarga === 'base'
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-text-muted border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Por unidad ({itemActual.unidad})
                </button>
                <button
                  type="button"
                  onClick={() => { setModoCarga('envase'); setCantidadActual(0); }}
                  disabled={itemActual.contenido_envase <= 0}
                  className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    modoCarga === 'envase'
                      ? 'bg-primary text-white border-primary'
                      : itemActual.contenido_envase <= 0
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'bg-white text-text-muted border-gray-300 hover:bg-gray-50'
                  }`}
                  title={itemActual.contenido_envase <= 0 ? 'Configura tamaño del envase en el ingrediente' : ''}
                >
                  📦 Por envase entero
                </button>
              </div>
              {itemActual.contenido_envase <= 0 && (
                <p className="text-[11px] text-amber-600 mt-1">
                  ⚠ Este ingrediente no tiene tamaño de envase configurado. Solo se puede cargar por unidad.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">
                {itemActual && modoCarga === 'envase'
                  ? `Cantidad de envases (de ${itemActual.contenido_envase} ${itemActual.unidad} c/u)`
                  : `Cantidad ${itemActual ? `(${itemActual.unidad})` : ''}`}
              </label>
              <input
                type="number"
                step={modoCarga === 'envase' ? '1' : '0.01'}
                min="0"
                value={cantidadActual || ''}
                onChange={(e) => setCantidadActual(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm"
              />
              {/* Calculo en vivo del total cuando es envase */}
              {itemActual && modoCarga === 'envase' && cantidadActual > 0 && itemActual.contenido_envase > 0 && (
                <p className="text-[11px] text-primary mt-1 font-medium">
                  = {(cantidadActual * itemActual.contenido_envase).toLocaleString('es-AR')} {itemActual.unidad} en total
                </p>
              )}
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
                Ingredientes a enviar ({carrito.length})
              </span>
              <span className="text-xs text-text-muted">
                Total: <strong className="text-text-primary">{formatMoney(montoTotalCarrito)}</strong>
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {carrito.map((item, idx) => (
                <div key={idx} className="px-4 py-2.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {item.ingrediente_nombre}
                      {item.modo === 'envase' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">📦 envase</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-text-muted mt-0.5">
                      {item.modo === 'envase' && item.cantidad_envases != null ? (
                        <span>
                          <strong className="text-text-primary font-mono">{item.cantidad_envases}</strong> envase{item.cantidad_envases === 1 ? '' : 's'}
                          <span className="text-text-muted"> = </span>
                          <strong className="text-primary font-mono">{item.cantidad_enviada.toLocaleString('es-AR')}</strong> {item.unidad}
                        </span>
                      ) : (
                        <span>
                          <strong className="text-text-primary font-mono">{item.cantidad_enviada}</strong> {item.unidad}
                        </span>
                      )}
                      {item.costo_unitario > 0 && (
                        <span>Subtotal: <strong className="text-text-primary">{formatMoney(item.cantidad_enviada * item.costo_unitario)}</strong></span>
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
              placeholder="Buscar ingrediente..."
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
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 font-medium text-text-muted">Fecha</th>
                  <th className="text-left px-3 py-2.5 font-medium text-text-muted">Ingrediente</th>
                  <th className="text-right px-3 py-2.5 font-medium text-text-muted">Enviados</th>
                  <th className="text-right px-3 py-2.5 font-medium text-text-muted w-28">Devueltos</th>
                  <th className="text-right px-3 py-2.5 font-medium text-text-muted">Utilizados</th>
                  <th className="text-left px-3 py-2.5 font-medium text-text-muted">Observacion</th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {envios.map((e) => (
                  <FilaEnvio
                    key={e.id}
                    envio={e}
                    onUpdateDevueltos={(cantidad) => updateDevueltosMut.mutate({ id: e.id, cantidad })}
                    onEdit={() => setEditingEnvio(e)}
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

      {/* Modal de edicion de envio */}
      {editingEnvio && (
        <EditEnvioModal
          envio={editingEnvio}
          onClose={() => setEditingEnvio(null)}
        />
      )}
    </div>
  );
}

function FilaEnvio({ envio, onUpdateDevueltos, onEdit, onDelete, formatFecha }: {
  envio: EnvioCoffit;
  onUpdateDevueltos: (cantidad: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  formatFecha: (fecha: string) => string;
}) {
  const [devueltosLocal, setDevueltosLocal] = useState(String(Number(envio.cantidad_devuelta)));
  const originalRef = useRef(String(Number(envio.cantidad_devuelta)));

  useEffect(() => {
    const current = String(Number(envio.cantidad_devuelta));
    if (current !== originalRef.current) {
      setDevueltosLocal(current);
      originalRef.current = current;
    }
  }, [envio.cantidad_devuelta]);

  function handleBlur() {
    const nuevoValor = parseFloat(devueltosLocal) || 0;
    const originalValor = parseFloat(originalRef.current) || 0;
    if (nuevoValor === originalValor) return;
    if (nuevoValor < 0 || nuevoValor > Number(envio.cantidad_enviada)) {
      setDevueltosLocal(originalRef.current);
      return;
    }
    originalRef.current = String(nuevoValor);
    onUpdateDevueltos(nuevoValor);
  }

  const enviados = Number(envio.cantidad_enviada);
  const devueltos = parseFloat(devueltosLocal) || 0;
  const utiles = enviados - devueltos;

  const fueEnvase = envio.cantidad_envases != null && Number(envio.cantidad_envases) > 0;
  const unidadBase = envio.unidad_base || 'g';

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2.5 whitespace-nowrap">{formatFecha(envio.fecha)}</td>
      <td className="px-3 py-2.5 font-medium text-text-primary">
        {envio.ingrediente_nombre}
        {fueEnvase && (
          <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium align-middle">
            📦 envase
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        {fueEnvase ? (
          <div>
            <div className="font-mono font-semibold">
              {Number(envio.cantidad_envases)} x {Number(envio.contenido_envase)} {unidadBase}
            </div>
            <div className="text-[10px] text-text-muted font-mono">
              = {enviados.toLocaleString('es-AR')} {unidadBase}
            </div>
          </div>
        ) : (
          <span className="font-mono">{enviados} {unidadBase}</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <input
          type="number"
          step="0.01"
          min="0"
          max={enviados}
          value={devueltosLocal}
          onChange={(e) => setDevueltosLocal(e.target.value)}
          onBlur={handleBlur}
          className={`w-full text-right px-2 py-1 text-sm border rounded font-mono ${
            devueltos > 0 ? 'border-amber-300 bg-amber-50 text-amber-700 font-bold' : 'border-gray-300'
          }`}
        />
      </td>
      <td className="px-3 py-2.5 text-right font-mono font-bold text-green-700">{utiles}</td>
      <td className="px-3 py-2.5 text-text-muted max-w-[180px] truncate">{envio.observacion || '-'}</td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-primary" title="Editar">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600" title="Eliminar">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function TabDevueltos() {
  const [buscar, setBuscar] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const { data: enviosRes, isLoading } = useQuery({
    queryKey: ['envios-coffit', 'devueltos', buscar, desde, hasta],
    queryFn: () =>
      enviosCoffitApi.getAll({
        buscar: buscar || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
        solo_devueltos: true,
      }),
  });

  const envios: EnvioCoffit[] = enviosRes?.data || [];

  function formatFecha(fecha: string) {
    const clean = typeof fecha === 'string' ? fecha.substring(0, 10) : '';
    const parts = clean.split('-');
    if (parts.length !== 3) return clean;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  const totalDevueltos = envios.reduce((sum, e) => sum + Number(e.cantidad_devuelta), 0);
  const totalEnviados = envios.reduce((sum, e) => sum + Number(e.cantidad_enviada), 0);

  return (
    <div className="space-y-4">
      {envios.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-amber-100 p-3 flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg shrink-0">
              <AlertCircle size={20} className="text-amber-500" />
            </div>
            <div>
              <div className="text-lg font-bold text-amber-600 leading-tight">{totalDevueltos}</div>
              <div className="text-[11px] text-text-muted">Total devueltos</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
            <div className="p-2 bg-gray-50 rounded-lg shrink-0">
              <Package size={20} className="text-text-muted" />
            </div>
            <div>
              <div className="text-lg font-bold text-text-primary leading-tight">{envios.length}</div>
              <div className="text-[11px] text-text-muted">Items con devueltos (de {totalEnviados} enviados)</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            type="text"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar ingrediente..."
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-text-muted text-sm">Cargando...</div>
      ) : envios.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <AlertCircle className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-text-muted text-sm">No hay ingredientes devueltos</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-medium text-text-muted">Fecha</th>
                <th className="text-left px-3 py-2.5 font-medium text-text-muted">Ingrediente</th>
                <th className="text-right px-3 py-2.5 font-medium text-text-muted">Enviados</th>
                <th className="text-right px-3 py-2.5 font-medium text-text-muted">Devueltos</th>
                <th className="text-left px-3 py-2.5 font-medium text-text-muted">Observacion</th>
              </tr>
            </thead>
            <tbody>
              {envios.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatFecha(e.fecha)}</td>
                  <td className="px-3 py-2.5 font-medium text-text-primary">{e.ingrediente_nombre}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{Number(e.cantidad_enviada)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-amber-600">
                    {Number(e.cantidad_devuelta)}
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

// =============================================================================
// MODAL EDITAR ENVIO
// Permite modificar fecha, cantidad (en modo unidad base o envase), devueltos y observacion.
// El ingrediente NO se puede cambiar — para eso conviene borrar y crear uno nuevo.
// =============================================================================
function EditEnvioModal({ envio, onClose }: { envio: EnvioCoffit; onClose: () => void }) {
  const queryClient = useQueryClient();

  // Detectar modo inicial segun lo que viene guardado
  const fueEnvase = envio.cantidad_envases != null && Number(envio.cantidad_envases) > 0;
  const initialContEnvase = fueEnvase ? Number(envio.contenido_envase) || 0 : 0;
  const initialUnidad = envio.unidad_base || 'g';

  const [fecha, setFecha] = useState(envio.fecha?.substring(0, 10) || '');
  const [modo, setModo] = useState<'base' | 'envase'>(fueEnvase ? 'envase' : 'base');
  const [cantidad, setCantidad] = useState<number>(
    fueEnvase ? Number(envio.cantidad_envases) || 0 : Number(envio.cantidad_enviada) || 0
  );
  const [contenidoEnvase, setContenidoEnvase] = useState<number>(initialContEnvase);
  const [devueltos, setDevueltos] = useState<number>(Number(envio.cantidad_devuelta) || 0);
  const [observacion, setObservacion] = useState<string>(envio.observacion || '');

  // Catalogo del ingrediente — para obtener tamaño de envase actual y la unidad correcta
  const { data: catalogoRes } = useQuery({
    queryKey: ['envios-coffit-catalogo'],
    queryFn: () => enviosCoffitApi.getCatalogo(),
    staleTime: 60_000,
  });
  const catalogo: EnvioCoffitCatalogo[] = catalogoRes?.data || [];
  const ingDelCatalogo = catalogo.find((c) => c.id === envio.ingrediente_id);
  const contenidoEnvaseSugerido = Number(ingDelCatalogo?.contenido_envase) || initialContEnvase;
  const unidadBase = ingDelCatalogo?.unidad || initialUnidad;

  // Si el ingrediente del catalogo no tiene envase configurado, no permitir modo envase
  const puedeUsarEnvase = contenidoEnvaseSugerido > 0;

  // Si esta en modo envase y el ingrediente ya no tiene envase, forzar base
  useEffect(() => {
    if (modo === 'envase' && !puedeUsarEnvase) {
      setModo('base');
    }
  }, [modo, puedeUsarEnvase]);

  // Calcular cantidad final en unidad base
  const cantidadFinalBase = modo === 'envase' ? cantidad * contenidoEnvase : cantidad;

  const updateMut = useMutation({
    mutationFn: () => {
      const payload: EnvioCoffitInput & { cantidad_devuelta?: number } = {
        fecha,
        ingrediente_id: envio.ingrediente_id,
        ingrediente_nombre: envio.ingrediente_nombre,
        cantidad_enviada: cantidadFinalBase,
        cantidad_devuelta: devueltos,
        observacion: observacion || null,
      };
      if (modo === 'envase') {
        payload.cantidad_envases = cantidad;
        payload.contenido_envase = contenidoEnvase;
        payload.unidad_base = unidadBase;
      } else {
        // Modo base: explicitamente NULL para limpiar el snapshot anterior
        payload.cantidad_envases = null;
        payload.contenido_envase = null;
        payload.unidad_base = null;
      }
      return enviosCoffitApi.update(envio.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envios-coffit'] });
      toast.success('Envio actualizado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Error al actualizar'),
  });

  function handleSubmit() {
    if (!fecha) {
      toast.error('La fecha es requerida');
      return;
    }
    if (cantidad <= 0) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }
    if (modo === 'envase' && contenidoEnvase <= 0) {
      toast.error('El contenido del envase debe ser mayor a 0');
      return;
    }
    if (devueltos < 0) {
      toast.error('Los devueltos no pueden ser negativos');
      return;
    }
    if (devueltos > cantidadFinalBase) {
      toast.error('Los devueltos no pueden ser mayores a lo enviado');
      return;
    }
    updateMut.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="font-bold text-text-primary flex items-center gap-2">
              <Pencil size={18} className="text-primary shrink-0" />
              Editar envio
            </h3>
            <p className="text-xs text-text-muted mt-0.5 truncate">{envio.ingrediente_nombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-text-primary shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Fecha */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
            />
          </div>

          {/* Modo de carga */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Modo de carga</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (modo === 'envase') {
                    // Al cambiar a base, dejamos la cantidad total en base
                    setCantidad(cantidadFinalBase);
                  }
                  setModo('base');
                }}
                className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  modo === 'base'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-text-muted border-gray-300 hover:bg-gray-50'
                }`}
              >
                Por unidad ({unidadBase})
              </button>
              <button
                type="button"
                onClick={() => {
                  if (modo === 'base' && puedeUsarEnvase) {
                    // Al cambiar a envase, usamos el contenido sugerido y dividimos
                    setContenidoEnvase(contenidoEnvaseSugerido);
                    setCantidad(Math.max(1, Math.round(cantidad / contenidoEnvaseSugerido)));
                  }
                  setModo('envase');
                }}
                disabled={!puedeUsarEnvase}
                className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  modo === 'envase'
                    ? 'bg-primary text-white border-primary'
                    : !puedeUsarEnvase
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-white text-text-muted border-gray-300 hover:bg-gray-50'
                }`}
                title={!puedeUsarEnvase ? 'El ingrediente no tiene tamaño de envase configurado' : ''}
              >
                📦 Por envase entero
              </button>
            </div>
            {!puedeUsarEnvase && (
              <p className="text-[11px] text-amber-600 mt-1">
                ⚠ El ingrediente no tiene tamaño de envase configurado. Solo se puede editar por unidad.
              </p>
            )}
          </div>

          {/* Cantidad + contenido envase si aplica */}
          {modo === 'envase' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Cantidad de envases</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={cantidad || ''}
                  onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">
                  Contenido del envase ({unidadBase})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={contenidoEnvase || ''}
                  onChange={(e) => setContenidoEnvase(parseFloat(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">
                Cantidad enviada ({unidadBase})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cantidad || ''}
                onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
            </div>
          )}

          {/* Total visible */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-sm">
            <span className="text-text-muted">Total enviado:</span>{' '}
            <strong className="text-primary font-mono">
              {cantidadFinalBase.toLocaleString('es-AR')} {unidadBase}
            </strong>
            {modo === 'envase' && cantidad > 0 && contenidoEnvase > 0 && (
              <span className="text-text-muted text-xs">
                {' '}({cantidad} envase{cantidad === 1 ? '' : 's'} × {contenidoEnvase} {unidadBase})
              </span>
            )}
          </div>

          {/* Devueltos */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">
              Devueltos ({unidadBase})
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={cantidadFinalBase}
              value={devueltos || ''}
              onChange={(e) => setDevueltos(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
            />
            {devueltos > cantidadFinalBase && (
              <p className="text-[11px] text-red-600 mt-1">
                ⚠ No puede ser mayor a lo enviado
              </p>
            )}
          </div>

          {/* Observacion */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Observacion</label>
            <textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={2}
              placeholder="Opcional..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={updateMut.isPending}
            className="px-5 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 font-medium"
          >
            {updateMut.isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
