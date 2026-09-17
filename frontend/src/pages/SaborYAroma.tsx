import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ClipboardPaste, Link2, Copy, Package, AlertTriangle, CircleCheck, Search,
  ArrowRight, Store, Apple, RefreshCw,
} from 'lucide-react';
import { syaApi } from '../api/sya';
import { enviosCoffitApi } from '../api/enviosCoffit';
import { configuracionApi } from '../api/configuracion';
import type {
  SyaArticulo, SyaEnvio, SyaEnvioItem, SyaResumen, SyaImportResultado,
  SyaModo, EnvioCoffitCatalogo,
} from '../types';
import { formatMoney } from '../utils/formatters';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';

// ============================================================================
// SABOR Y AROMA — envios de mercaderia del CRM de la distribuidora.
// Flujo: pegar el JSON del sync -> mapear cada articulo UNA vez (materia prima
// y/o "Para venta") -> los renglones se aplican solos (costo del ingrediente,
// costo del articulo de venta). El POS lee "Para venta" por la API publica.
// ============================================================================

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30';
const labelCls = 'block text-xs font-medium text-text-muted mb-1';

// Unidad "humana" del modo del CRM (en la que viene cantidad y costoUnitario)
const UNIDAD_MODO: Record<SyaModo, string> = { granel: 'kg', paquete: 'paq', unidad: 'un' };
const unidadModo = (modo: SyaModo | null | undefined) => (modo ? UNIDAD_MODO[modo] || modo : '?');

// Invalidaciones tras aplicar costos: la cascada toca ingredientes,
// subrecetas, productos y todo lo que deriva de sus costos.
const KEYS_COSTOS = [['sya'], ['ingredientes'], ['subrecetas'], ['productos'], ['dashboard'], ['carta']];

function EstadoItemBadge({ estado, nota }: { estado: string; nota?: string | null }) {
  const map: Record<string, { cls: string; label: string }> = {
    aplicado: { cls: 'bg-green-100 text-green-700', label: '✓ aplicado' },
    pendiente_mapeo: { cls: 'bg-amber-100 text-amber-700', label: 'sin mapear' },
    inconsistente: { cls: 'bg-red-100 text-red-700', label: '⚠ inconsistente' },
    anulado: { cls: 'bg-gray-200 text-gray-600', label: 'anulado' },
  };
  const m = map[estado] || { cls: 'bg-gray-100 text-gray-600', label: estado };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${m.cls}`} title={nota || undefined}>
      {m.label}
    </span>
  );
}

export default function SaborYAroma() {
  const [tab, setTab] = useState<'importar' | 'envios' | 'articulos' | 'venta'>('importar');
  const [mapeando, setMapeando] = useState<SyaArticulo | null>(null);

  const { data: resumenData } = useQuery({
    queryKey: ['sya', 'resumen'],
    queryFn: () => syaApi.getResumen(),
  });
  const resumen: SyaResumen | null = resumenData?.data || null;

  const tabs = [
    { key: 'importar' as const, label: 'Importar' },
    { key: 'envios' as const, label: 'Envíos' },
    { key: 'articulos' as const, label: 'Artículos' },
    { key: 'venta' as const, label: 'Para venta' },
  ];

  return (
    <div className="space-y-4">
      {/* Resumen */}
      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <p className="text-xs text-text-muted">Envíos recibidos</p>
            <p className="text-xl font-bold">{resumen.envios}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <p className="text-xs text-text-muted">Artículos sin mapear</p>
            <p className={`text-xl font-bold ${resumen.articulos_sin_mapear > 0 ? 'text-amber-600' : ''}`}>
              {resumen.articulos_sin_mapear} <span className="text-sm font-normal text-text-muted">/ {resumen.articulos}</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <p className="text-xs text-text-muted">Renglones pendientes</p>
            <p className={`text-xl font-bold ${(resumen.items_pendientes + resumen.items_inconsistentes) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {resumen.items_pendientes + resumen.items_inconsistentes}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <p className="text-xs text-text-muted">En venta</p>
            <p className="text-xl font-bold">{resumen.articulos_en_venta}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-full sm:w-fit overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm rounded-md cursor-pointer transition-colors whitespace-nowrap ${tab === t.key ? 'bg-white font-medium shadow-sm' : 'text-text-muted hover:text-text'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'importar' && <TabImportar />}
      {tab === 'envios' && <TabEnvios onMapear={setMapeando} />}
      {tab === 'articulos' && <TabArticulos onMapear={setMapeando} />}
      {tab === 'venta' && <TabVenta />}

      {mapeando && <MapeoModal articulo={mapeando} onClose={() => setMapeando(null)} />}
    </div>
  );
}

// ============================================================================
// TAB IMPORTAR: pegar el JSON del sync + configuracion (URL del CRM, sucursal)
// ============================================================================
function TabImportar() {
  const queryClient = useQueryClient();
  const [json, setJson] = useState('');
  const [resultado, setResultado] = useState<SyaImportResultado | null>(null);

  const { data: configData } = useQuery({
    queryKey: ['configuracion'],
    queryFn: () => configuracionApi.getAll(),
  });
  // El GET devuelve filas {clave, valor}: se reduce a un mapa
  const config = useMemo(() => {
    const rows = (configData?.data || []) as unknown as { clave: string; valor: string }[];
    return Object.fromEntries((Array.isArray(rows) ? rows : []).map((r) => [r.clave, r.valor ?? '']));
  }, [configData]);

  const [crmUrl, setCrmUrl] = useState<string | null>(null);
  const [sucursal, setSucursal] = useState<string | null>(null);
  const crmUrlVal = crmUrl ?? config.sya_crm_url ?? '';
  const sucursalVal = sucursal ?? config.sya_sucursal_id ?? '';
  const cursor = config.sya_cursor || '';

  const syncUrl = `${(crmUrlVal || 'http://<ip-del-crm>:3001').replace(/\/+$/, '')}/api/cafeteria/sync${cursor ? `?desde=${encodeURIComponent(cursor)}` : ''}`;

  const guardarConfig = useMutation({
    mutationFn: async () => {
      if (crmUrl !== null) await configuracionApi.update('sya_crm_url', crmUrl.trim());
      if (sucursal !== null) await configuracionApi.update('sya_sucursal_id', sucursal.trim());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion'] });
      toast.success('Configuración guardada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importar = useMutation({
    mutationFn: (payload: unknown) => syaApi.importar(payload),
    onSuccess: (res) => {
      setResultado(res.data);
      setJson('');
      KEYS_COSTOS.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
      queryClient.invalidateQueries({ queryKey: ['configuracion'] }); // cursor nuevo
      const r = res.data;
      if (r.errores.length > 0) toast.error(`Importado con ${r.errores.length} error(es)`);
      else toast.success(`Importado: ${r.nuevos} nuevos, ${r.actualizados} actualizados`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleImportar = () => {
    if (!json.trim()) return toast.error('Pegá el JSON del sync primero');
    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      return toast.error('El texto pegado no es un JSON válido');
    }
    importar.mutate(payload);
  };

  const copiarUrl = () => {
    navigator.clipboard.writeText(syncUrl).then(
      () => toast.success('URL copiada'),
      () => toast.error('No se pudo copiar')
    );
  };

  return (
    <div className="space-y-4">
      {/* Paso a paso */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2"><Link2 size={15} /> 1. Abrí esta URL estando en la red del local</p>
        <div className="flex gap-2 items-center">
          <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 overflow-x-auto whitespace-nowrap">{syncUrl}</code>
          <Button variant="secondary" onClick={copiarUrl}><Copy size={14} /> Copiar</Button>
        </div>
        <p className="text-[11px] text-text-muted">
          {cursor
            ? <>El link ya incluye el cursor: trae <strong>solo lo nuevo</strong> desde la última importación.</>
            : <>Primera vez: trae todo el historial. Después de importar, el link queda con el cursor para traer solo lo nuevo.</>}
        </p>

        <p className="text-sm font-medium flex items-center gap-2 pt-1"><ClipboardPaste size={15} /> 2. Pegá acá el JSON que te devuelve</p>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={6}
          placeholder='{"ahora": "...", "envios": [ ... ]}'
          className={`${inputCls} font-mono text-xs`}
        />
        <Button onClick={handleImportar} loading={importar.isPending}><RefreshCw size={14} /> Importar</Button>
      </div>

      {/* Resultado del ultimo import */}
      {resultado && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2"><CircleCheck size={15} className="text-green-600" /> Resultado</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div>Nuevos: <strong>{resultado.nuevos}</strong></div>
            <div>Actualizados: <strong>{resultado.actualizados}</strong></div>
            <div>Anulados: <strong>{resultado.anulados}</strong></div>
            <div>Sin cambios: <strong>{resultado.sin_cambios}</strong></div>
            <div>Ignorados (otra sucursal): <strong>{resultado.ignorados}</strong></div>
            <div className="text-green-700">Renglones aplicados: <strong>{resultado.items_aplicados}</strong></div>
            <div className={resultado.items_pendientes > 0 ? 'text-amber-700' : ''}>Sin mapear: <strong>{resultado.items_pendientes}</strong></div>
            <div className={resultado.items_inconsistentes > 0 ? 'text-red-700' : ''}>Inconsistentes: <strong>{resultado.items_inconsistentes}</strong></div>
          </div>
          {resultado.ingredientes_actualizados > 0 && (
            <p className="text-xs text-text-muted">
              💰 Se actualizó el costo de <strong>{resultado.ingredientes_actualizados}</strong> renglón(es) de materia prima (cascadeó a subrecetas y productos).
            </p>
          )}
          {resultado.items_pendientes > 0 && (
            <p className="text-xs text-amber-700">
              Hay renglones sin mapear: andá a la pestaña <strong>Artículos</strong> y mapealos — se aplican solos al guardar.
            </p>
          )}
          {resultado.errores.length > 0 && (
            <div className="text-xs text-red-700 space-y-0.5">
              {resultado.errores.map((e, i) => <p key={i}>⚠ {e.codigo || e.crm_id ? `Envío ${e.codigo || e.crm_id}` : 'Aviso'}: {e.error}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Configuracion */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-sm font-medium">Configuración</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>URL del CRM (red local)</label>
            <input value={crmUrlVal} onChange={(e) => setCrmUrl(e.target.value)} placeholder="http://192.168.0.10:3001" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Filtrar por sucursal (ID del CRM, vacío = todas)</label>
            <input value={sucursalVal} onChange={(e) => setSucursal(e.target.value.replace(/[^\d]/g, ''))} placeholder="1" className={inputCls} />
          </div>
        </div>
        {cursor && <p className="text-[11px] text-text-muted">Cursor actual: <code>{cursor}</code></p>}
        <Button variant="secondary" onClick={() => guardarConfig.mutate()} loading={guardarConfig.isPending}
          disabled={crmUrl === null && sucursal === null}>
          Guardar configuración
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// TAB ENVIOS: historial con estados + detalle por renglon
// ============================================================================
function TabEnvios({ onMapear }: { onMapear: (a: SyaArticulo) => void }) {
  const [estado, setEstado] = useState('');
  const [detalleId, setDetalleId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sya', 'envios', estado],
    queryFn: () => syaApi.getEnvios(estado ? { estado } : undefined),
  });
  const envios: SyaEnvio[] = data?.data || [];

  return (
    <div className="space-y-3">
      <select value={estado} onChange={(e) => setEstado(e.target.value)} className="px-2.5 py-2 text-sm border border-gray-300 rounded-lg bg-white">
        <option value="">Estado: todos</option>
        <option value="enviado">Vigentes</option>
        <option value="anulado">Anulados</option>
        <option value="ignorado">Ignorados (otra sucursal)</option>
      </select>

      {isLoading ? <LoadingSpinner /> : envios.length === 0 ? (
        <EmptyState message="No hay envíos todavía. Importá el primero desde la pestaña Importar." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-gray-100">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2 hidden sm:table-cell">Fecha</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Costo total</th>
                <th className="px-3 py-2 text-center hidden sm:table-cell">Renglones</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {envios.map((e) => {
                const pend = (Number(e.items_pendientes) || 0) + (Number(e.items_inconsistentes) || 0);
                return (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 font-medium">{e.codigo || `#${e.crm_id}`}
                      {e.version > 1 && <span className="ml-1 text-[10px] text-text-muted">v{e.version}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-text-muted hidden sm:table-cell">{e.fecha ? new Date(e.fecha).toLocaleDateString('es-AR') : '—'}</td>
                    <td className="px-3 py-2.5">
                      {e.estado === 'enviado' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">vigente</span>}
                      {e.estado === 'anulado' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium" title={e.motivo_anulacion || undefined}>anulado</span>}
                      {e.estado === 'ignorado' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">ignorado</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">{e.total_costo != null ? formatMoney(e.total_costo) : '—'}</td>
                    <td className="px-3 py-2.5 text-center hidden sm:table-cell">
                      {Number(e.items_total) || 0}
                      {pend > 0 && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">{pend} pend.</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => setDetalleId(e.id)} className="text-primary text-xs font-medium cursor-pointer hover:underline">Ver detalle</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detalleId != null && <EnvioDetalleModal envioId={detalleId} onClose={() => setDetalleId(null)} onMapear={onMapear} />}
    </div>
  );
}

function EnvioDetalleModal({ envioId, onClose, onMapear }: {
  envioId: number;
  onClose: () => void;
  onMapear: (a: SyaArticulo) => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['sya', 'envio', envioId],
    queryFn: () => syaApi.getEnvio(envioId),
  });
  const envio = data?.data || null;
  const [repartoEdit, setRepartoEdit] = useState<{ itemId: number; mp: string } | null>(null);

  const repartoMut = useMutation({
    mutationFn: ({ itemId, mp, venta }: { itemId: number; mp: number; venta: number }) =>
      syaApi.setReparto(envioId, itemId, mp, venta),
    onSuccess: () => {
      KEYS_COSTOS.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
      toast.success('Reparto guardado');
      setRepartoEdit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Al mapear desde aca, primero buscamos el articulo para abrir el modal
  const abrirMapeo = async (item: SyaEnvioItem) => {
    const res = await syaApi.getArticulos();
    const art = (res.data || []).find(
      (a) => a.crm_producto_id === item.crm_producto_id && a.crm_presentacion_id === item.crm_presentacion_id
    );
    if (art) { onClose(); onMapear(art); }
    else toast.error('Artículo no encontrado');
  };

  const cantidadStr = (i: SyaEnvioItem) => {
    const base = `${Number(i.cantidad)} ${unidadModo(i.modo)}`;
    if (i.modo === 'paquete' && i.tam_kg) return `${base} × ${Number(i.tam_kg)} kg = ${Number(i.total_kg)} kg`;
    if (i.modo === 'granel') return base;
    return base;
  };

  return (
    <Modal isOpen onClose={onClose} title={envio ? `Envío ${envio.codigo || `#${envio.crm_id}`}` : 'Envío'}>
      {isLoading || !envio ? <LoadingSpinner /> : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
            <span>Fecha: {envio.fecha ? new Date(envio.fecha).toLocaleString('es-AR') : '—'}</span>
            <span>Versión: {envio.version}</span>
            {envio.total_costo != null && <span>Costo total: {formatMoney(envio.total_costo)}</span>}
            {envio.estado === 'anulado' && <span className="text-red-600 font-medium">ANULADO {envio.motivo_anulacion ? `— ${envio.motivo_anulacion}` : ''}</span>}
          </div>
          {envio.observaciones && <p className="text-xs text-text-muted">Obs: {envio.observaciones}</p>}

          <div className="space-y-2">
            {envio.items.map((i) => {
              const ambos = !!i.usa_mp && !!i.usa_venta;
              const editando = repartoEdit?.itemId === i.id;
              const mpNum = editando ? parseFloat(repartoEdit.mp) || 0 : Number(i.cant_mp) || 0;
              return (
                <div key={i.id} className="border border-gray-100 rounded-lg p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{i.nombre_crm}</p>
                      <p className="text-[11px] text-text-muted">
                        {cantidadStr(i)} · {formatMoney(i.costo_unitario)}/{unidadModo(i.modo)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <EstadoItemBadge estado={i.estado} nota={i.nota} />
                      {i.estado === 'pendiente_mapeo' && (
                        <button onClick={() => abrirMapeo(i)} className="text-xs text-primary font-medium cursor-pointer hover:underline">Mapear</button>
                      )}
                    </div>
                  </div>

                  {i.nota && <p className="text-[11px] text-red-600">{i.nota}</p>}

                  {i.estado === 'aplicado' && (
                    <div className="text-[11px] text-text-muted flex flex-wrap gap-x-3">
                      {(Number(i.cant_mp) || 0) > 0 && i.ingrediente_nombre && (
                        <span className="flex items-center gap-1">
                          <Apple size={11} /> {Number(i.cant_mp)} {unidadModo(i.modo)} <ArrowRight size={10} />
                          <strong>{Number(i.cantidad_ingrediente)} {i.ingrediente_unidad || ''}</strong> de {i.ingrediente_nombre}
                          {!!i.costo_aplicado && <span className="text-green-700">(costo actualizado)</span>}
                        </span>
                      )}
                      {(Number(i.cant_venta) || 0) > 0 && (
                        <span className="flex items-center gap-1"><Store size={11} /> {Number(i.cant_venta)} un a "Para venta"</span>
                      )}
                    </div>
                  )}

                  {/* Reparto MP/venta (solo articulos con los dos destinos) */}
                  {ambos && envio.estado === 'enviado' && i.estado === 'aplicado' && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="text-text-muted">Reparto:</span>
                      {editando ? (
                        <>
                          <input
                            value={repartoEdit.mp}
                            onChange={(e) => setRepartoEdit({ itemId: i.id, mp: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') })}
                            className="w-16 px-1.5 py-0.5 border border-gray-300 rounded text-xs"
                          />
                          <span>MP / {Math.max(0, Math.round((Number(i.cantidad) - mpNum) * 1000) / 1000)} venta</span>
                          <button
                            onClick={() => repartoMut.mutate({ itemId: i.id, mp: mpNum, venta: Math.round((Number(i.cantidad) - mpNum) * 1000) / 1000 })}
                            className="text-primary font-medium cursor-pointer hover:underline"
                          >Guardar</button>
                          <button onClick={() => setRepartoEdit(null)} className="text-text-muted cursor-pointer hover:underline">Cancelar</button>
                        </>
                      ) : (
                        <>
                          <span><strong>{Number(i.cant_mp) || 0}</strong> materia prima · <strong>{Number(i.cant_venta) || 0}</strong> venta</span>
                          <button onClick={() => setRepartoEdit({ itemId: i.id, mp: String(Number(i.cant_mp) || 0) })}
                            className="text-primary font-medium cursor-pointer hover:underline">Editar</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ============================================================================
// TAB ARTICULOS: catalogo del CRM + estado de mapeo
// ============================================================================
function TabArticulos({ onMapear }: { onMapear: (a: SyaArticulo) => void }) {
  const [estado, setEstado] = useState('');
  const [buscar, setBuscar] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sya', 'articulos', estado, buscar],
    queryFn: () => syaApi.getArticulos({ estado: estado || undefined, buscar: buscar || undefined }),
  });
  const articulos: SyaArticulo[] = data?.data || [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:flex-1 sm:min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar artículo..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="px-2.5 py-2 text-sm border border-gray-300 rounded-lg bg-white">
          <option value="">Mapeo: todos</option>
          <option value="sin_mapear">🔗 Sin mapear</option>
          <option value="mp">🍎 Materia prima</option>
          <option value="venta">🏪 Para venta</option>
          <option value="ambos">Ambos destinos</option>
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : articulos.length === 0 ? (
        <EmptyState message="No hay artículos. Aparecen solos al importar el primer envío." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-gray-100">
                <th className="px-3 py-2">Artículo (CRM)</th>
                <th className="px-3 py-2 hidden sm:table-cell">Último envío</th>
                <th className="px-3 py-2">Destino</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {articulos.map((a) => {
                const sinMapear = !a.usa_mp && !a.usa_venta;
                const pend = Number(a.items_pendientes) || 0;
                return (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{a.nombre_crm}</div>
                      <div className="text-[11px] text-text-muted">
                        {a.codigo_propio && <span>{a.codigo_propio} · </span>}
                        modo {a.ultimo_modo || '?'}
                        {pend > 0 && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">{pend} renglón(es) pendiente(s)</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-text-muted text-xs hidden sm:table-cell">
                      {a.ultima_cantidad != null ? `${Number(a.ultima_cantidad)} ${unidadModo(a.ultimo_modo)}` : '—'}
                      {a.ultimo_costo_unitario != null && <div>{formatMoney(a.ultimo_costo_unitario)}/{unidadModo(a.ultimo_modo)}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {sinMapear ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">sin mapear</span>
                      ) : (
                        <div className="space-y-0.5">
                          {!!a.usa_mp && (
                            <div className="text-xs flex items-center gap-1">
                              <Apple size={11} className="text-green-700" />
                              {a.ingrediente_nombre || '?'}
                              <span className="text-text-muted">(×{Number(a.factor_mp)} → {a.ingrediente_unidad || ''})</span>
                            </div>
                          )}
                          {!!a.usa_venta && (
                            <div className="text-xs flex items-center gap-1">
                              <Store size={11} className="text-blue-700" />
                              {a.venta_nombre || a.nombre_crm}
                              <span className="text-text-muted">{a.venta_precio != null ? formatMoney(a.venta_precio) : 'sin precio'}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button variant={sinMapear ? 'primary' : 'secondary'} onClick={() => onMapear(a)}>
                        {sinMapear ? 'Mapear' : 'Editar'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MODAL MAPEO: destino(s) + ingrediente + factor con conversor en la linea
// ============================================================================
function MapeoModal({ articulo, onClose }: { articulo: SyaArticulo; onClose: () => void }) {
  const queryClient = useQueryClient();

  const [usaMp, setUsaMp] = useState(!!articulo.usa_mp);
  const [ingredienteId, setIngredienteId] = useState<number | null>(articulo.ingrediente_id);
  const [factor, setFactor] = useState(articulo.factor_mp != null ? String(Number(articulo.factor_mp)) : '');
  const [actualizarCosto, setActualizarCosto] = useState(articulo.actualizar_costo !== 0);
  const [usaVenta, setUsaVenta] = useState(!!articulo.usa_venta);
  const [ventaNombre, setVentaNombre] = useState(articulo.venta_nombre || articulo.nombre_crm);
  const [ventaPrecio, setVentaPrecio] = useState(articulo.venta_precio != null ? String(Number(articulo.venta_precio)) : '');
  const [buscarIng, setBuscarIng] = useState('');

  const { data: sugData } = useQuery({
    queryKey: ['sya', 'sugerencias', articulo.id],
    queryFn: () => syaApi.getSugerencias(articulo.id),
  });
  const sugerencias = sugData?.data || [];

  const { data: catData } = useQuery({
    queryKey: ['envios-coffit', 'catalogo'],
    queryFn: () => enviosCoffitApi.getCatalogo(),
  });
  const catalogo: EnvioCoffitCatalogo[] = catData?.data || [];
  const ingrediente = catalogo.find((c) => c.id === ingredienteId) || null;

  const filtrados = buscarIng
    ? catalogo.filter((c) => c.nombre.toLowerCase().includes(buscarIng.toLowerCase())).slice(0, 8)
    : [];

  const modo = articulo.ultimo_modo;
  const uModo = unidadModo(modo);
  const factorNum = parseFloat(factor) || 0;

  // Sugerencia automatica del factor segun unidades (los liquidos van a mano)
  const sugerirFactor = (unidadIng: string): number | null => {
    const u = (unidadIng || '').toLowerCase();
    if (modo === 'granel') {
      if (u === 'g') return 1000;
      if (u === 'kg') return 1;
    }
    if (modo === 'unidad' && (u === 'u' || u === 'un')) return 1;
    return null;
  };

  const elegirIngrediente = (id: number, unidad: string) => {
    setIngredienteId(id);
    setBuscarIng('');
    if (!factor) {
      const sug = sugerirFactor(unidad);
      if (sug != null) setFactor(String(sug));
    }
  };

  // Vista previa con el ultimo envio real (para confirmar que toma todo bien)
  const previewCantidad = articulo.ultima_cantidad != null && factorNum > 0
    ? Math.round(Number(articulo.ultima_cantidad) * factorNum * 1000) / 1000
    : null;
  const previewCosto = articulo.ultimo_costo_unitario != null && factorNum > 0
    ? Number(articulo.ultimo_costo_unitario) / factorNum
    : null;

  const guardar = useMutation({
    mutationFn: () => syaApi.mapear(articulo.id, {
      usa_mp: usaMp,
      ingrediente_id: usaMp ? ingredienteId : null,
      factor_mp: usaMp ? factorNum : null,
      actualizar_costo: actualizarCosto,
      usa_venta: usaVenta,
      venta_nombre: usaVenta ? ventaNombre : null,
      venta_precio: usaVenta && ventaPrecio !== '' ? parseFloat(ventaPrecio) : null,
    }),
    onSuccess: (res) => {
      KEYS_COSTOS.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
      const n = res.data?.renglones_reaplicados || 0;
      toast.success(n > 0 ? `Mapeo guardado — ${n} renglón(es) aplicados` : 'Mapeo guardado');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleGuardar = () => {
    if (!usaMp && !usaVenta) return toast.error('Elegí al menos un destino');
    if (usaMp && !ingredienteId) return toast.error('Elegí el ingrediente');
    if (usaMp && factorNum <= 0) return toast.error('El factor de conversión debe ser mayor a 0');
    if (usaVenta && !ventaNombre.trim()) return toast.error('Poné el nombre de venta');
    guardar.mutate();
  };

  return (
    <Modal isOpen onClose={onClose} title={`Mapear: ${articulo.nombre_crm}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={handleGuardar} loading={guardar.isPending}>Guardar</Button></>}>
      <div className="space-y-4">
        <p className="text-xs text-text-muted">
          Último envío: {articulo.ultima_cantidad != null ? `${Number(articulo.ultima_cantidad)} ${uModo}` : '—'}
          {articulo.ultimo_costo_unitario != null && <> · costo {formatMoney(articulo.ultimo_costo_unitario)}/{uModo}</>}
          {articulo.codigo_propio && <> · {articulo.codigo_propio}</>}
        </p>

        {/* ------- DESTINO MATERIA PRIMA ------- */}
        <div className={`border rounded-xl p-3 space-y-3 ${usaMp ? 'border-green-300 bg-green-50/40' : 'border-gray-200'}`}>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={usaMp} onChange={(e) => setUsaMp(e.target.checked)} className="rounded" />
            <Apple size={15} className="text-green-700" /> Materia prima (va a un ingrediente)
          </label>

          {usaMp && (
            <>
              {/* Selector de ingrediente con sugerencias */}
              <div>
                <label className={labelCls}>Ingrediente</label>
                {ingrediente ? (
                  <div className="flex items-center justify-between bg-white border border-gray-300 rounded-lg px-3 py-2">
                    <span className="text-sm">{ingrediente.nombre} <span className="text-text-muted text-xs">({ingrediente.unidad})</span></span>
                    <button onClick={() => { setIngredienteId(null); setFactor(''); }} className="text-xs text-text-muted cursor-pointer hover:text-danger">Cambiar</button>
                  </div>
                ) : (
                  <>
                    <input value={buscarIng} onChange={(e) => setBuscarIng(e.target.value)} placeholder="Buscar ingrediente..." className={inputCls} />
                    {sugerencias.length > 0 && !buscarIng && (
                      <div className="mt-1.5 space-y-1">
                        <p className="text-[10px] text-text-muted">Sugerencias por nombre:</p>
                        {sugerencias.map((s) => (
                          <button key={s.id} onClick={() => elegirIngrediente(s.id, s.unidad)}
                            className="w-full text-left px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5 flex justify-between">
                            <span>{s.nombre} <span className="text-text-muted text-xs">({s.unidad})</span></span>
                            <span className={`text-xs font-bold ${s.score >= 88 ? 'text-green-600' : 'text-text-muted'}`}>{s.score}%</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {filtrados.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {filtrados.map((c) => (
                          <button key={c.id} onClick={() => elegirIngrediente(c.id, c.unidad)}
                            className="w-full text-left px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5">
                            {c.nombre} <span className="text-text-muted text-xs">({c.unidad})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Conversor de unidades EN LA LINEA */}
              {ingrediente && (
                <div>
                  <label className={labelCls}>Conversión de unidades</label>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span>1 {uModo} =</span>
                    <input value={factor} onChange={(e) => setFactor(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
                      className="w-28 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm" placeholder="factor" />
                    <span>{ingrediente.unidad}</span>
                    <button onClick={() => setFactor('1000')} className="text-[11px] px-1.5 py-0.5 border border-gray-300 rounded cursor-pointer hover:bg-gray-100">×1000</button>
                    <button onClick={() => setFactor('1')} className="text-[11px] px-1.5 py-0.5 border border-gray-300 rounded cursor-pointer hover:bg-gray-100">×1</button>
                  </div>
                  {(ingrediente.unidad === 'ml' || ingrediente.unidad === 'L') && modo !== 'unidad' && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      ⚠ El CRM manda kg y tu ingrediente está en {ingrediente.unidad}: escribí a mano cuántos {ingrediente.unidad} son 1 {uModo} (depende del producto). Queda guardado.
                    </p>
                  )}
                  {/* Vista previa con datos reales del ultimo envio */}
                  {previewCantidad != null && (
                    <div className="mt-2 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 space-y-0.5">
                      <p>📦 {Number(articulo.ultima_cantidad)} {uModo} → <strong>{previewCantidad} {ingrediente.unidad}</strong> de {ingrediente.nombre}</p>
                      {previewCosto != null && (
                        <p>💰 Costo: {formatMoney(articulo.ultimo_costo_unitario)}/{uModo} → <strong>{formatMoney(previewCosto)}/{ingrediente.unidad}</strong>
                          <span className="text-text-muted"> (actual: {formatMoney(ingrediente.costo_unitario)}/{ingrediente.unidad})</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={actualizarCosto} onChange={(e) => setActualizarCosto(e.target.checked)} className="rounded" />
                Actualizar el costo del ingrediente con cada envío (proveedor "Sabor y Aroma", cascadea a recetas y productos)
              </label>
            </>
          )}
        </div>

        {/* ------- DESTINO PARA VENTA ------- */}
        <div className={`border rounded-xl p-3 space-y-3 ${usaVenta ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'}`}>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={usaVenta} onChange={(e) => setUsaVenta(e.target.checked)} className="rounded" />
            <Store size={15} className="text-blue-700" /> Para venta (se vende tal cual llega)
          </label>

          {usaVenta && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nombre de venta</label>
                <input value={ventaNombre} onChange={(e) => setVentaNombre(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Precio de venta (lo definís vos)</label>
                <input value={ventaPrecio} onChange={(e) => setVentaPrecio(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
                  placeholder="0" className={inputCls} />
              </div>
              {modo && modo !== 'unidad' && (
                <p className="sm:col-span-2 text-[11px] text-amber-700">
                  ⚠ Este artículo vino en modo "{modo}" y venta espera unidades. Si un renglón llega así, queda marcado para revisar.
                </p>
              )}
            </div>
          )}
        </div>

        {(Number(articulo.items_pendientes) || 0) > 0 && (
          <p className="text-xs text-amber-700 flex items-center gap-1">
            <AlertTriangle size={13} /> Al guardar se aplican solos los {articulo.items_pendientes} renglón(es) pendientes de este artículo.
          </p>
        )}
      </div>
    </Modal>
  );
}

// ============================================================================
// TAB PARA VENTA: reventa tal cual + API del POS
// ============================================================================
function TabVenta() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['sya', 'articulos', 'venta', ''],
    queryFn: () => syaApi.getArticulos({ estado: 'venta' }),
  });
  const articulos: SyaArticulo[] = data?.data || [];
  const [editPrecio, setEditPrecio] = useState<{ id: number; valor: string } | null>(null);

  const update = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: { venta_precio?: number | null; venta_activo?: boolean } }) =>
      syaApi.updateVenta(id, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sya'] });
      toast.success('Actualizado');
      setEditPrecio(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const posUrl = 'https://coffitcost.saboryaroma.com/api/public/pos/productos';

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
        <p className="font-medium flex items-center gap-1.5"><Package size={13} /> API para tu POS de ventas</p>
        <p className="mt-1">Estos artículos (activos y con precio) salen en vivo por: <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200">{posUrl}</code></p>
        <p className="mt-0.5 text-blue-700">Solo lectura, sin costos. Cambiar un precio acá se refleja al instante.</p>
      </div>

      {isLoading ? <LoadingSpinner /> : articulos.length === 0 ? (
        <EmptyState message='No hay artículos para venta. Mapeá alguno con destino "Para venta" desde la pestaña Artículos.' />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-gray-100">
                <th className="px-3 py-2">Artículo</th>
                <th className="px-3 py-2 text-right">Último costo</th>
                <th className="px-3 py-2 text-right">Precio venta</th>
                <th className="px-3 py-2 text-right">Margen</th>
                <th className="px-3 py-2 text-center">En el POS</th>
              </tr>
            </thead>
            <tbody>
              {articulos.map((a) => {
                const costo = a.venta_costo_unitario != null ? Number(a.venta_costo_unitario) : null;
                const precio = a.venta_precio != null ? Number(a.venta_precio) : null;
                const margen = costo != null && precio != null && precio > 0
                  ? ((precio - costo) / precio) * 100 : null;
                const editando = editPrecio?.id === a.id;
                const visible = !!a.venta_activo && precio != null && precio > 0;
                return (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{a.venta_nombre || a.nombre_crm}</div>
                      <div className="text-[11px] text-text-muted">{a.nombre_crm}{a.codigo_propio ? ` · ${a.codigo_propio}` : ''}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-text-muted">{costo != null ? formatMoney(costo) : '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      {editando ? (
                        <span className="inline-flex items-center gap-1">
                          <input autoFocus value={editPrecio.valor}
                            onChange={(e) => setEditPrecio({ id: a.id, valor: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') update.mutate({ id: a.id, data: { venta_precio: parseFloat(editPrecio.valor) || 0 } });
                              if (e.key === 'Escape') setEditPrecio(null);
                            }}
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                          <button onClick={() => update.mutate({ id: a.id, data: { venta_precio: parseFloat(editPrecio.valor) || 0 } })}
                            className="text-xs text-primary font-medium cursor-pointer">OK</button>
                        </span>
                      ) : (
                        <button onClick={() => setEditPrecio({ id: a.id, valor: precio != null ? String(precio) : '' })}
                          className={`cursor-pointer hover:underline ${precio == null ? 'text-amber-600 text-xs' : 'font-medium'}`}>
                          {precio != null ? formatMoney(precio) : 'Poner precio'}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {margen != null ? (
                        <span className={`text-xs font-bold ${margen < 15 ? 'text-red-600' : margen < 30 ? 'text-amber-600' : 'text-green-600'}`}>
                          {margen.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => update.mutate({ id: a.id, data: { venta_activo: !a.venta_activo } })}
                        title={visible ? 'Visible en el POS' : (precio == null || precio <= 0 ? 'Sin precio: no sale en el POS' : 'Pausado')}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium cursor-pointer ${a.venta_activo ? (visible ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700') : 'bg-gray-200 text-gray-600'}`}
                      >
                        {a.venta_activo ? (visible ? 'activo' : 'sin precio') : 'pausado'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
