import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Pencil, Trash2, Search, X, Tag, Link2, ArrowLeft, Scale } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ofertasApi } from '../api/ofertas';
import { productosApi } from '../api/productos';
import { conceptosApi } from '../api/conceptos';
import { cartaApi } from '../api/carta';
import type { Oferta, TipoOferta, EstadoOferta, CategoriaCartaPromo, Producto, ResumenCanales } from '../types';
import { formatMoney, formatDate } from '../utils/formatters';
import { calcularMCNeto, calcularMarkup, calcularPrecioConPromo, getMCColor } from '../utils/calculators';
import { normalizarTexto } from '../utils/normalizers';
import Button from '../components/common/Button';
import MCBadge from '../components/common/MCBadge';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import NumericInput from '../components/common/NumericInput';

const tipoLabels: Record<TipoOferta, string> = {
  descuento_porcentaje: 'Descuento %',
  descuento_fijo: 'Descuento $',
  '2x1': '2x1',
  '3x2': '3x2',
  precio_especial: 'Precio especial',
  compra_regalo: 'Compra + Regalo 🎁',
};

const estadoColors: Record<EstadoOferta, string> = {
  activa: 'bg-green-100 text-green-700',
  pausada: 'bg-yellow-100 text-yellow-700',
  programada: 'bg-blue-100 text-blue-700',
  vencida: 'bg-gray-100 text-gray-500',
};

// Las 3 categorias fijas de carta que puede tener una promo (la Carta y el
// menu publico heredan esta categoria en vivo).
const CATEGORIAS_CARTA: { key: CategoriaCartaPromo; emoji: string; badge: string; activo: string }[] = [
  { key: 'Promo', emoji: '🏷️', badge: 'bg-amber-100 text-amber-700', activo: 'bg-amber-500 text-white border-amber-500' },
  { key: 'Combo', emoji: '🥪', badge: 'bg-sky-100 text-sky-700', activo: 'bg-sky-500 text-white border-sky-500' },
  { key: 'Boxs', emoji: '📦', badge: 'bg-fuchsia-100 text-fuchsia-700', activo: 'bg-fuchsia-500 text-white border-fuchsia-500' },
];
const categoriaBadge = (c?: string) => CATEGORIAS_CARTA.find((x) => x.key === c) || CATEGORIAS_CARTA[0];

function valorLabel(tipo: TipoOferta): string {
  switch (tipo) {
    case 'descuento_porcentaje': return 'Porcentaje (%)';
    case 'descuento_fijo': return 'Monto a descontar ($)';
    case 'precio_especial': return 'Precio nuevo ($)';
    case 'compra_regalo': return 'Precio combo ($ · 0 = automatico)';
    case '2x1':
    case '3x2': return '(no requiere valor)';
    default: return 'Valor';
  }
}

function formatValor(o: Oferta): string {
  if (o.tipo === 'descuento_porcentaje') return `${Number(o.valor)}%`;
  if (o.tipo === 'descuento_fijo' || o.tipo === 'precio_especial') return formatMoney(o.valor);
  if (o.tipo === 'compra_regalo') return Number(o.valor) > 0 ? formatMoney(o.valor) : 'Auto';
  return '—';
}

export default function Ofertas() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['ofertas'], queryFn: () => ofertasApi.getAll() });
  const deleteMut = useMutation({
    mutationFn: (id: number) => ofertasApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ofertas'] }); toast.success('Promo eliminada'); setDeleteId(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const ofertas = data?.data || [];
  const editorAbierto = modalOpen;

  // Reverse lookup: que promos ya estan en la carta (no bloqueante).
  const { data: mapeoData } = useQuery({
    queryKey: ['carta-mapeo-ofertas'],
    queryFn: () => cartaApi.getMapeoOfertas(),
    retry: false,
    staleTime: 30_000,
  });
  const cartaDisponible = mapeoData?.data?.disponible ?? false;
  const cartaPorOferta = mapeoData?.data?.ofertas || {};

  // Crear el item de carta mapeado a la promo. La categoria queda como snapshot
  // de respaldo: la efectiva se hereda EN VIVO de la promo (Promo/Combo/Boxs).
  const agregarCartaMut = useMutation({
    mutationFn: (o: Oferta) => cartaApi.create({
      nombre: o.nombre,
      precio_venta: 0,          // hereda el precio del combo (precio_manual=0)
      precio_manual: 0,
      categoria: o.categoria_carta || 'Promo',
      oferta_id: o.id,
    }),
    onSuccess: (_res, o) => {
      toast.success(`Promo agregada a la carta (categoria "${o.categoria_carta || 'Promo'}")`);
      queryClient.invalidateQueries({ queryKey: ['carta-mapeo-ofertas'] });
      queryClient.invalidateQueries({ queryKey: ['carta'] });
      queryClient.invalidateQueries({ queryKey: ['carta-resumen'] });
      queryClient.invalidateQueries({ queryKey: ['carta-categorias'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleAgregarCarta = (o: Oferta) => {
    const esBox = o.tipo === 'precio_especial' && (o.productos?.length || 0) >= 2;
    if (!esBox) {
      const ok = window.confirm(
        `"${o.nombre}" no es un box (precio especial con 2+ productos). ` +
        `Si sus productos ya estan en la carta como items propios, esto podria duplicarlos en el menu. Agregar igual?`
      );
      if (!ok) return;
    }
    agregarCartaMut.mutate(o);
  };

  // Editor a pantalla completa: reemplaza la lista (mas espacio de trabajo que un modal)
  if (editorAbierto) {
    return (
      <PromoEditor
        ofertaId={editingId}
        ofertas={ofertas}
        onClose={() => setModalOpen(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <p className="text-sm text-text-muted">{ofertas.length} promo{ofertas.length === 1 ? '' : 's'} cargadas</p>
        <Button onClick={() => { setEditingId(null); setModalOpen(true); }}>
          <Plus size={16} /> Nueva promo
        </Button>
      </div>

      {isLoading ? <LoadingSpinner /> : ofertas.length === 0 ? <EmptyState message="No hay promos cargadas" /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Categoria</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Tipo</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Inicio</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Fin</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Productos</th>
                <th className="px-4 py-3 font-medium text-center">Carta</th>
                <th className="px-4 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {ofertas.map((o) => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium">{o.nombre}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {(() => { const c = categoriaBadge(o.categoria_carta); return (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${c.badge}`}>{c.emoji} {c.key}</span>
                    ); })()}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">{tipoLabels[o.tipo] || o.tipo}</td>
                  <td className="px-4 py-3 text-right">{formatValor(o)}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">{formatDate(o.fecha_inicio)}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">{formatDate(o.fecha_fin)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoColors[o.estado]}`}>{o.estado}</span>
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">{o.productos?.length || 0}</td>
                  <td className="px-4 py-3 text-center">
                    {!cartaDisponible ? (
                      <span className="text-xs text-text-muted">—</span>
                    ) : cartaPorOferta[o.id] ? (
                      <a
                        href={`/carta?buscar=${encodeURIComponent(cartaPorOferta[o.id].carta_nombre)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`En carta como "${cartaPorOferta[o.id].carta_nombre}". Click para abrir la Carta.`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700 hover:bg-green-200"
                      >
                        <Link2 size={11} /> En carta
                      </a>
                    ) : (
                      <button
                        onClick={() => handleAgregarCarta(o)}
                        disabled={agregarCartaMut.isPending}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                        title="Crear el item de carta de esta promo (hereda precio del combo)"
                      >
                        <Plus size={11} /> Agregar a carta
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingId(o.id); setModalOpen(true); }} className="p-1.5 text-text-muted hover:text-primary cursor-pointer"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteId(o.id)} className="p-1.5 text-text-muted hover:text-danger cursor-pointer"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar promo"
        message="Esta seguro que desea eliminar esta promo?"
        loading={deleteMut.isPending}
      />
    </div>
  );
}

// =============================================================================
// METRICAS DE UN BORRADOR DE PROMO (resumen compacto + comparador A/B)
// Sirve para cualquier tipo: combo (precio_especial) o por-producto.
// =============================================================================
interface MetricasDraft {
  unidades: number;
  costoTotal: number;
  precioLista: number;
  precioFinal: number;
  descuento: number;
  pctDescuento: number;
  markup: number;
  foodCost: number; // % del precio final que se va en costo
  mcTarjeta: number;
  mcEfectivo: number;
  gananciaTarjeta: number;
  gananciaEfectivo: number;
}

function calcularMetricasDraft(
  productos: (Producto & { cantidad?: number; rol?: string; descuento_pct?: number })[],
  tipo: TipoOferta,
  valor: number,
  resumenCanales: ResumenCanales,
): MetricasDraft | null {
  if (productos.length === 0) return null;
  let unidades = 0, costoTotal = 0, precioLista = 0, precioFinal = 0;
  for (const p of productos) {
    const cant = Number(p.cantidad) || 1;
    const costo = Number(p.costo_total) || 0;
    const precio = Number(p.precio_publico) || 0;
    unidades += cant;
    costoTotal += costo * cant; // el costo del regalo SIEMPRE cuenta
    precioLista += precio * cant;
    if (tipo === 'compra_regalo') {
      // pagados a precio lista; regalos con su descuento aplicado
      const esRegalo = p.rol === 'regalo';
      const desc = Math.min(100, Number(p.descuento_pct) || 100);
      precioFinal += esRegalo ? precio * cant * (1 - desc / 100) : precio * cant;
    } else if (tipo !== 'precio_especial') {
      precioFinal += calcularPrecioConPromo(precio, tipo, valor) * cant;
    }
  }
  // Precio especial = precio del combo entero
  if (tipo === 'precio_especial') precioFinal = Math.max(0, Number(valor) || 0);
  // Compra+regalo con precio escrito a mano: pisa el automatico
  if (tipo === 'compra_regalo' && Number(valor) > 0) precioFinal = Number(valor);
  const descuento = precioLista - precioFinal;
  const pctDescuento = precioLista > 0 ? (descuento / precioLista) * 100 : 0;
  const markup = calcularMarkup(precioFinal, costoTotal);
  const foodCost = precioFinal > 0 ? (costoTotal / precioFinal) * 100 : 0;
  const mcT = precioFinal > 0 ? calcularMCNeto(precioFinal, costoTotal, resumenCanales.tarjeta) : null;
  const mcE = precioFinal > 0 ? calcularMCNeto(precioFinal, costoTotal, resumenCanales.efectivo) : null;
  return {
    unidades, costoTotal, precioLista, precioFinal, descuento, pctDescuento,
    markup, foodCost,
    mcTarjeta: mcT?.mc ?? 0,
    mcEfectivo: mcE?.mc ?? 0,
    gananciaTarjeta: mcT?.ganancia ?? 0,
    gananciaEfectivo: mcE?.ganancia ?? 0,
  };
}

// =============================================================================
// SELECTOR DE PRODUCTOS (buscador + lista con cantidades) — reutilizable A/B
// Cada seleccion lleva rol ('pago' | 'regalo') y descuento_pct (solo regalo).
// El toggle 🎁 aparece solo en promos tipo "Compra + Regalo".
// =============================================================================
export interface SelProducto { cantidad: number; rol: 'pago' | 'regalo'; descuento_pct: number }
export type Selecciones = Map<number, SelProducto>;

const selDefault = (): SelProducto => ({ cantidad: 1, rol: 'pago', descuento_pct: 100 });

function ProductSelector({ allProducts, selecciones, onChange, conRegalo }: {
  allProducts: Producto[];
  selecciones: Selecciones;
  onChange: (next: Selecciones) => void;
  conRegalo?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedProducts = useMemo(() => {
    return Array.from(selecciones.keys())
      .map((id) => {
        const p = allProducts.find((x) => x.id === id);
        const sel = selecciones.get(id) || selDefault();
        return p ? { ...p, cantidad: sel.cantidad, rol: sel.rol, descuento_pct: sel.descuento_pct } : null;
      })
      .filter((x): x is Producto & SelProducto => x != null);
  }, [allProducts, selecciones]);

  const filtered = useMemo(() => {
    const term = normalizarTexto(search.trim());
    if (!term) return [];
    return allProducts.filter((p) => !selecciones.has(p.id) && normalizarTexto(p.nombre).includes(term)).slice(0, 8);
  }, [allProducts, search, selecciones]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const patch = (id: number, cambios: Partial<SelProducto>) => {
    const n = new Map(selecciones);
    n.set(id, { ...(n.get(id) || selDefault()), ...cambios });
    onChange(n);
  };
  const add = (p: Producto) => {
    if (!selecciones.has(p.id)) {
      const n = new Map(selecciones);
      n.set(p.id, selDefault());
      onChange(n);
    }
    setSearch('');
    setShowDropdown(false);
  };
  const setCant = (id: number, c: number) => patch(id, { cantidad: c > 0 ? c : 1 });
  const remove = (id: number) => { const n = new Map(selecciones); n.delete(id); onChange(n); };

  return (
    <div>
      <div ref={dropdownRef} className="relative">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Buscar producto para agregar..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {showDropdown && search.trim().length > 0 && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-text-muted text-center">Sin resultados</div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); add(p); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center justify-between"
                >
                  <span className="font-medium">{p.nombre}</span>
                  <span className="text-xs text-text-muted">{formatMoney(p.precio_publico)}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedProducts.length > 0 && (
        <div className="mt-3 border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
          {selectedProducts.map((p) => {
            const esRegalo = conRegalo && p.rol === 'regalo';
            return (
            <div key={p.id} className={`px-3 py-2 hover:bg-gray-50 ${esRegalo ? 'bg-emerald-50/50' : ''}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <div className="text-sm font-medium text-text-primary truncate">
                    {p.nombre}
                    {esRegalo && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                        🎁 {p.descuento_pct >= 100 ? 'GRATIS' : `-${p.descuento_pct}%`}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    Costo {formatMoney(p.costo_total)} · Precio {formatMoney(p.precio_publico)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {conRegalo && (
                    <button
                      type="button"
                      onClick={() => patch(p.id, { rol: p.rol === 'regalo' ? 'pago' : 'regalo' })}
                      className={`px-2 h-7 rounded border text-xs font-medium ${p.rol === 'regalo'
                        ? 'border-emerald-400 bg-emerald-100 text-emerald-700'
                        : 'border-gray-300 text-text-muted hover:bg-gray-100'}`}
                      title={p.rol === 'regalo' ? 'Es regalo (clic para que se pague)' : 'Marcar como regalo'}
                    >🎁</button>
                  )}
                  <button type="button" onClick={() => setCant(p.id, Math.max(1, (p.cantidad || 1) - 1))}
                    className="w-7 h-7 rounded border border-gray-300 text-text-muted hover:bg-gray-100 font-bold" title="Disminuir">−</button>
                  <input
                    type="number" min="1" step="1" value={p.cantidad || 1}
                    onChange={(e) => setCant(p.id, parseInt(e.target.value, 10) || 1)}
                    className="w-12 text-center px-1 py-1 text-sm border border-gray-300 rounded font-mono"
                  />
                  <button type="button" onClick={() => setCant(p.id, (p.cantidad || 1) + 1)}
                    className="w-7 h-7 rounded border border-gray-300 text-text-muted hover:bg-gray-100 font-bold" title="Aumentar">+</button>
                  <button type="button" onClick={() => remove(p.id)} className="ml-1 p-1.5 text-gray-400 hover:text-red-600" title="Quitar">
                    <X size={14} />
                  </button>
                </div>
              </div>
              {esRegalo && (
                <div className="flex items-center gap-2 mt-1.5 pl-0.5">
                  <span className="text-[11px] text-emerald-700">Descuento del regalo:</span>
                  <input
                    type="number" min="1" max="100" step="1"
                    value={p.descuento_pct}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      patch(p.id, { descuento_pct: isNaN(v) ? 100 : Math.max(1, Math.min(100, v)) });
                    }}
                    className="w-16 text-right px-1.5 py-0.5 text-xs border border-emerald-300 rounded font-mono"
                  />
                  <span className="text-[11px] text-emerald-700">% {p.descuento_pct >= 100 ? '(gratis)' : `(paga ${formatMoney((Number(p.precio_publico) || 0) * (1 - p.descuento_pct / 100))} c/u)`}</span>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// RESUMEN COMPACTO de un borrador (cards con las metricas clave)
// =============================================================================
function MetricasCompactas({ m }: { m: MetricasDraft | null }) {
  if (!m) return <p className="text-xs text-text-muted italic py-2">Agrega productos para ver metricas.</p>;
  const Cell = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-lg border border-gray-100 px-2.5 py-2">
      <div className="text-[9px] uppercase text-text-muted font-medium mb-0.5 truncate">{label}</div>
      <div className="text-sm font-bold leading-tight">{children}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Cell label={`Precio final (${m.unidades} un.)`}>
        <span className="text-amber-700">{formatMoney(m.precioFinal)}</span>
      </Cell>
      <Cell label="Costo total">{formatMoney(m.costoTotal)}</Cell>
      <Cell label="Descuento cliente">
        <span className={m.descuento >= 0 ? 'text-green-700' : 'text-red-700'}>
          {formatMoney(Math.abs(m.descuento))} <span className="text-[10px] font-normal">({m.descuento >= 0 ? '-' : '+'}{Math.abs(m.pctDescuento).toFixed(1)}%)</span>
        </span>
      </Cell>
      <Cell label="Food cost">
        <span style={{ color: m.foodCost > 45 ? '#dc3545' : m.foodCost > 35 ? '#f57c00' : '#2e7d32' }}>{m.foodCost.toFixed(1)}%</span>
      </Cell>
      <Cell label="Markup promo">
        <span style={{ color: getMCColor(m.markup) }}>{m.markup.toFixed(0)}%</span>
      </Cell>
      <Cell label="💳 MC / Ganancia">
        <span className="flex items-center gap-1.5">
          <MCBadge value={m.mcTarjeta} size="sm" />
          <span className="text-[11px] font-mono" style={{ color: m.gananciaTarjeta >= 0 ? '#2e7d32' : '#dc3545' }}>{formatMoney(m.gananciaTarjeta)}</span>
        </span>
      </Cell>
      <Cell label="💵 MC / Ganancia">
        <span className="flex items-center gap-1.5">
          <MCBadge value={m.mcEfectivo} size="sm" />
          <span className="text-[11px] font-mono" style={{ color: m.gananciaEfectivo >= 0 ? '#2e7d32' : '#dc3545' }}>{formatMoney(m.gananciaEfectivo)}</span>
        </span>
      </Cell>
      <Cell label="Precio lista (suma)">{formatMoney(m.precioLista)}</Cell>
    </div>
  );
}

// =============================================================================
// COMPARADOR A vs B — resalta el mejor valor de cada metrica
// =============================================================================
function ComparadorAB({ a, b }: { a: MetricasDraft | null; b: MetricasDraft | null }) {
  if (!a || !b) {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-xs text-violet-800">
        Carga productos en ambas promos para ver la comparacion.
      </div>
    );
  }
  // dir: 1 = mayor es mejor, -1 = menor es mejor, 0 = neutro (sin ganador)
  const filas: { label: string; va: number; vb: number; fmt: (v: number) => string; dir: 1 | -1 | 0 }[] = [
    { label: 'Precio final', va: a.precioFinal, vb: b.precioFinal, fmt: formatMoney, dir: 0 },
    { label: 'Costo total', va: a.costoTotal, vb: b.costoTotal, fmt: formatMoney, dir: -1 },
    { label: 'Descuento al cliente', va: a.descuento, vb: b.descuento, fmt: formatMoney, dir: 0 },
    { label: 'Descuento %', va: a.pctDescuento, vb: b.pctDescuento, fmt: (v) => `${v.toFixed(1)}%`, dir: 0 },
    { label: 'Food cost %', va: a.foodCost, vb: b.foodCost, fmt: (v) => `${v.toFixed(1)}%`, dir: -1 },
    { label: 'Markup', va: a.markup, vb: b.markup, fmt: (v) => `${v.toFixed(0)}%`, dir: 1 },
    { label: '💳 MC Tarjeta', va: a.mcTarjeta, vb: b.mcTarjeta, fmt: (v) => `${v.toFixed(1)}%`, dir: 1 },
    { label: '💳 Ganancia $', va: a.gananciaTarjeta, vb: b.gananciaTarjeta, fmt: formatMoney, dir: 1 },
    { label: '💵 MC Efectivo', va: a.mcEfectivo, vb: b.mcEfectivo, fmt: (v) => `${v.toFixed(1)}%`, dir: 1 },
    { label: '💵 Ganancia $', va: a.gananciaEfectivo, vb: b.gananciaEfectivo, fmt: formatMoney, dir: 1 },
  ];

  const winCls = 'bg-green-50 text-green-800 font-bold';
  const loseCls = 'text-text-muted';

  return (
    <div className="bg-white border-2 border-violet-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-violet-50 border-b border-violet-200 flex items-center justify-between">
        <h4 className="text-xs font-bold text-violet-800 uppercase tracking-wide">⚖️ Comparacion en vivo — Promo A vs Variante B</h4>
        <span className="text-[10px] text-violet-600">verde = mejor en esa metrica</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead className="bg-gray-50">
            <tr className="text-text-muted">
              <th className="px-3 py-2 font-medium text-left">Metrica</th>
              <th className="px-3 py-2 font-medium text-right w-36 bg-amber-50/60">Promo A</th>
              <th className="px-3 py-2 font-medium text-right w-36 bg-violet-50/60">Variante B</th>
              <th className="px-3 py-2 font-medium text-right w-32">Diferencia (B−A)</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const aGana = f.dir !== 0 && (f.dir === 1 ? f.va > f.vb : f.va < f.vb);
              const bGana = f.dir !== 0 && (f.dir === 1 ? f.vb > f.va : f.vb < f.va);
              const diff = f.vb - f.va;
              return (
                <tr key={f.label} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium">{f.label}</td>
                  <td className={`px-3 py-2 text-right font-mono ${aGana ? winCls : bGana ? loseCls : ''}`}>{f.fmt(f.va)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${bGana ? winCls : aGana ? loseCls : ''}`}>{f.fmt(f.vb)}</td>
                  <td className="px-3 py-2 text-right font-mono text-text-muted">
                    {diff === 0 ? '=' : `${diff > 0 ? '+' : ''}${f.fmt(Math.abs(diff)).replace(/^/, diff < 0 ? '-' : '')}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// EDITOR DE PROMO a pantalla completa (reemplaza al modal) + comparador A/B
// =============================================================================
function PromoEditor({ ofertaId, ofertas, onClose }: { ofertaId: number | null; ofertas: Oferta[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const existing = ofertaId ? ofertas.find((o) => o.id === ofertaId) : null;

  // ---- PROMO A (la real, se guarda) ----
  const [nombre, setNombre] = useState(existing?.nombre || '');
  const [tipo, setTipo] = useState<TipoOferta>(existing?.tipo || 'descuento_porcentaje');
  const [categoriaCarta, setCategoriaCarta] = useState<CategoriaCartaPromo>(existing?.categoria_carta || 'Promo');
  const [valor, setValor] = useState(Number(existing?.valor) || 0);
  const [descripcion, setDescripcion] = useState(existing?.descripcion || '');
  const [fechaInicio, setFechaInicio] = useState(existing?.fecha_inicio?.split('T')[0] || '');
  const [fechaFin, setFechaFin] = useState(existing?.fecha_fin?.split('T')[0] || '');
  const [estado, setEstado] = useState<EstadoOferta>(existing?.estado || 'activa');
  const [selecciones, setSelecciones] = useState<Selecciones>(() => {
    const m: Selecciones = new Map();
    existing?.productos?.forEach((p) => m.set(p.id, {
      cantidad: Number(p.cantidad) || 1,
      rol: p.rol === 'regalo' ? 'regalo' : 'pago',
      descuento_pct: Number(p.descuento_pct) || 100,
    }));
    return m;
  });

  // ---- VARIANTE B (borrador de prueba, NO se guarda) ----
  const [comparar, setComparar] = useState(false);
  const [tipoB, setTipoB] = useState<TipoOferta>('precio_especial');
  const [valorB, setValorB] = useState(0);
  const [seleccionesB, setSeleccionesB] = useState<Selecciones>(new Map());

  const { data: prodData } = useQuery({
    queryKey: ['productos', { es_borrador: 0 }],
    queryFn: () => productosApi.getAll({ es_borrador: 0 }),
  });
  const allProducts: Producto[] = prodData?.data || [];

  const { data: conceptosData } = useQuery({ queryKey: ['conceptos'], queryFn: () => conceptosApi.getAll() });
  const resumenCanales = conceptosData?.data?.resumen_canales as ResumenCanales | undefined;

  const toProductos = (sel: Selecciones) =>
    Array.from(sel.keys())
      .map((id) => {
        const p = allProducts.find((x) => x.id === id);
        const s = sel.get(id) || selDefault();
        return p ? { ...p, cantidad: s.cantidad, rol: s.rol, descuento_pct: s.descuento_pct } : null;
      })
      .filter((x): x is Producto & SelProducto => x != null);

  const productosA = useMemo(() => toProductos(selecciones), [allProducts, selecciones]);
  const productosB = useMemo(() => toProductos(seleccionesB), [allProducts, seleccionesB]);

  const metricasA = useMemo(
    () => (resumenCanales ? calcularMetricasDraft(productosA, tipo, valor, resumenCanales) : null),
    [productosA, tipo, valor, resumenCanales]
  );
  const metricasB = useMemo(
    () => (resumenCanales ? calcularMetricasDraft(productosB, tipoB, valorB, resumenCanales) : null),
    [productosB, tipoB, valorB, resumenCanales]
  );

  // Activar comparador: si B esta vacia, arranca como copia de A (para ir jugando)
  const toggleComparar = () => {
    if (!comparar && seleccionesB.size === 0) {
      setSeleccionesB(new Map(selecciones));
      setTipoB(tipo);
      setValorB(valor);
    }
    setComparar(!comparar);
  };
  const copiarAaB = () => {
    setSeleccionesB(new Map(selecciones));
    setTipoB(tipo);
    setValorB(valor);
    toast.success('Variante B ahora es una copia de la promo A');
  };
  // Aplicar B sobre A (te gusto como quedo B -> pasa a ser la promo real)
  const usarBcomoA = () => {
    setSelecciones(new Map(seleccionesB));
    setTipo(tipoB);
    setValor(valorB);
    toast.success('La promo A ahora usa la configuracion de B');
  };

  const valorParaGuardar = (tipo === '2x1' || tipo === '3x2') ? 0 : valor;
  const productosPayload = useMemo(
    () => Array.from(selecciones.entries()).map(([id, s]) => ({
      id, cantidad: s.cantidad, rol: s.rol, descuento_pct: s.descuento_pct,
    })),
    [selecciones]
  );

  const createMut = useMutation({
    mutationFn: () => ofertasApi.create({
      nombre, tipo, categoria_carta: categoriaCarta, valor: valorParaGuardar,
      descripcion: descripcion || undefined,
      fecha_inicio: fechaInicio || undefined,
      fecha_fin: fechaFin || undefined,
      estado,
      productos: productosPayload,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ofertas'] }); toast.success('Promo creada'); onClose(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => ofertasApi.update(ofertaId!, {
      nombre, tipo, categoria_carta: categoriaCarta, valor: valorParaGuardar,
      descripcion: descripcion || undefined,
      fecha_inicio: fechaInicio || undefined,
      fecha_fin: fechaFin || undefined,
      estado,
      productos: productosPayload,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ofertas'] }); toast.success('Promo actualizada'); onClose(); },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit() {
    if (!nombre.trim()) return toast.error('Nombre es requerido');
    if (tipo === 'descuento_porcentaje' && (valor <= 0 || valor > 100)) {
      return toast.error('El porcentaje debe ser entre 0 y 100');
    }
    if ((tipo === 'descuento_fijo' || tipo === 'precio_especial') && valor <= 0) {
      return toast.error('El valor debe ser mayor a 0');
    }
    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
      return toast.error('La fecha de inicio debe ser anterior a la fecha fin');
    }
    if (selecciones.size === 0) {
      return toast.error('Selecciona al menos 1 producto para la promo');
    }
    if (tipo === 'compra_regalo') {
      const roles = Array.from(selecciones.values());
      if (!roles.some((s) => s.rol === 'regalo')) {
        return toast.error('Marca al menos un producto como regalo 🎁');
      }
      if (!roles.some((s) => s.rol === 'pago')) {
        return toast.error('Al menos un producto se tiene que pagar (no todo puede ser regalo)');
      }
    }
    if (ofertaId) updateMut.mutate(); else createMut.mutate();
  }

  const inputSm = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="space-y-4">
      {/* Barra superior fija: volver + guardar siempre a mano */}
      <div className="sticky top-0 z-30 -mx-6 px-6 py-3 bg-white/95 backdrop-blur border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="flex items-center gap-1 text-sm text-text-muted hover:text-primary shrink-0">
            <ArrowLeft size={16} /> Volver
          </button>
          <h2 className="text-base font-bold truncate">{ofertaId ? `Editar: ${existing?.nombre || 'Promo'}` : 'Nueva Promo'}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <button
            onClick={toggleComparar}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border ${
              comparar ? 'bg-violet-600 text-white border-violet-600' : 'text-violet-700 border-violet-300 hover:bg-violet-50'
            }`}
            title="Compara en vivo contra una variante de prueba que armas al momento (no se guarda)"
          >
            <Scale size={14} /> {comparar ? 'Comparando A vs B' : 'Comparar con variante B'}
          </button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={createMut.isPending || updateMut.isPending}>
            {ofertaId ? 'Guardar' : 'Crear promo'}
          </Button>
        </div>
      </div>

      {/* DATOS DE LA PROMO A */}
      <section className="bg-white rounded-xl border border-gray-100 p-4">
        <h4 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
          <Tag size={14} /> Datos de la promo
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder='Ej: "Happy hour cafe", "Combo desayuno"' className={inputSm} />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Categoria en carta <span className="font-normal">(la hereda el menú)</span>
            </label>
            <div className="flex gap-1">
              {CATEGORIAS_CARTA.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategoriaCarta(c.key)}
                  className={`flex-1 px-2 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                    categoriaCarta === c.key ? c.activo : 'border-gray-300 text-text-muted hover:bg-gray-50'
                  }`}
                  title={`El item de carta de esta promo aparece en la categoria "${c.key}"`}
                >
                  {c.emoji} {c.key}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Tipo de promo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoOferta)} className={`${inputSm} bg-white`}>
              {Object.entries(tipoLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">{valorLabel(tipo)}</label>
            {(tipo === '2x1' || tipo === '3x2') ? (
              <input disabled value="—" className={`${inputSm} bg-gray-100 text-text-muted`} />
            ) : (
              <NumericInput value={valor} onChange={(v) => setValor(v)} min={0}
                max={tipo === 'descuento_porcentaje' ? 100 : undefined} step="0.01" className={inputSm} />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Fecha inicio</label>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={inputSm} />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Fecha fin</label>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={inputSm} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-text-muted mb-1">Estado</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoOferta)} className={`${inputSm} bg-white`}>
              <option value="activa">Activa</option>
              <option value="pausada">Pausada</option>
              <option value="programada">Programada</option>
            </select>
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-text-muted mb-1">Descripcion (opcional)</label>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripcion opcional..." className={inputSm} />
          </div>
        </div>
      </section>

      {/* COMPARADOR (arriba, siempre visible mientras jugas) */}
      {comparar && <ComparadorAB a={metricasA} b={metricasB} />}

      {/* PANELES A / B lado a lado */}
      <div className={`grid grid-cols-1 gap-4 ${comparar ? 'xl:grid-cols-2' : ''}`}>
        {/* ---- PROMO A ---- */}
        <section className="bg-amber-50/40 border-2 border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wide">
              {comparar ? '🅰️ Promo A (la real — se guarda)' : `Productos incluidos (${selecciones.size})`}
            </h4>
            {comparar && <span className="text-[10px] text-amber-700">{tipoLabels[tipo]}{(tipo !== '2x1' && tipo !== '3x2') ? ` · ${tipo === 'descuento_porcentaje' ? `${valor}%` : formatMoney(valor)}` : ''}</span>}
          </div>
          <ProductSelector allProducts={allProducts} selecciones={selecciones} onChange={setSelecciones} conRegalo={tipo === 'compra_regalo'} />
          <MetricasCompactas m={metricasA} />
        </section>

        {/* ---- VARIANTE B ---- */}
        {comparar && (
          <section className="bg-violet-50/40 border-2 border-violet-300 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="text-xs font-bold text-violet-800 uppercase tracking-wide">
                🅱️ Variante B (prueba — no se guarda)
              </h4>
              <div className="flex gap-1.5">
                <button onClick={copiarAaB} className="text-[10px] px-2 py-1 rounded border border-violet-300 text-violet-700 hover:bg-violet-100" title="Reinicia B como copia de A">
                  ⟲ Copiar de A
                </button>
                <button onClick={usarBcomoA} className="text-[10px] px-2 py-1 rounded border border-violet-300 text-violet-700 hover:bg-violet-100 font-bold" title="Te gusto B? Pasa su configuracion a la promo A (despues guarda)">
                  ✓ Usar B como promo
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Tipo</label>
                <select value={tipoB} onChange={(e) => setTipoB(e.target.value as TipoOferta)} className={`${inputSm} bg-white`}>
                  {Object.entries(tipoLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">{valorLabel(tipoB)}</label>
                {(tipoB === '2x1' || tipoB === '3x2') ? (
                  <input disabled value="—" className={`${inputSm} bg-gray-100 text-text-muted`} />
                ) : (
                  <NumericInput value={valorB} onChange={(v) => setValorB(v)} min={0}
                    max={tipoB === 'descuento_porcentaje' ? 100 : undefined} step="0.01" className={inputSm} />
                )}
              </div>
            </div>
            <ProductSelector allProducts={allProducts} selecciones={seleccionesB} onChange={setSeleccionesB} conRegalo={tipoB === 'compra_regalo'} />
            <MetricasCompactas m={metricasB} />
          </section>
        )}
      </div>

      {/* ANALISIS COMPLETO A */}
      {productosA.length > 0 && resumenCanales && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          {comparar && <h3 className="text-sm font-bold text-amber-800 mb-3">🅰️ Analisis completo — Promo A</h3>}
          <AnalisisPromo productos={productosA} tipo={tipo} valor={valor} resumenCanales={resumenCanales} />
        </div>
      )}

      {/* ANALISIS COMPLETO B */}
      {comparar && productosB.length > 0 && resumenCanales && (
        <div className="bg-white rounded-xl border-2 border-violet-200 p-4">
          <h3 className="text-sm font-bold text-violet-800 mb-3">🅱️ Analisis completo — Variante B</h3>
          <AnalisisPromo productos={productosB} tipo={tipoB} valor={valorB} resumenCanales={resumenCanales} />
        </div>
      )}
    </div>
  );
}


// =============================================================================
// RESUMEN COMPACTO "flujo de precio": sin promo (tachado) → CON PROMO (grande)
// + pill de descuento + chips secundarios con separadores. Denso y escaneable.
// =============================================================================
function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wide text-text-muted font-medium mb-0.5 whitespace-nowrap">{label}</div>
      <div className="text-sm font-bold leading-none whitespace-nowrap" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

function FlujoPrecioResumen({
  unidades, sinPromo, conPromo, descuento, pctDescuento, costoTotal,
  gananciaTarjeta, gananciaEfectivo, markupSin, markupCon, titulo, subtitulo, costoRegalo,
}: {
  unidades: number;
  sinPromo: number;
  conPromo: number;
  descuento: number;
  pctDescuento: number;
  costoTotal: number;
  gananciaTarjeta?: number;
  gananciaEfectivo?: number;
  markupSin?: number;
  markupCon?: number;
  titulo?: string;
  subtitulo?: string;
  costoRegalo?: number; // compra_regalo: costo de lo que regalas (ya incluido en costoTotal)
}) {
  const foodCost = conPromo > 0 ? (costoTotal / conPromo) * 100 : 0;
  const fcColor = foodCost > 45 ? '#dc3545' : foodCost > 35 ? '#f57c00' : '#2e7d32';
  const ganColor = (g: number) => (g >= 0 ? '#2e7d32' : '#dc3545');

  return (
    <div className="bg-gradient-to-r from-amber-50 via-amber-50/50 to-white border border-amber-200 rounded-xl px-4 py-3 mb-3">
      {titulo && (
        <div className="mb-2">
          <span className="text-[10px] uppercase text-amber-800 font-bold tracking-wide">{titulo}</span>
          {subtitulo && <span className="text-xs text-text-muted ml-2">{subtitulo}</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Flujo de precio: lo primero que lee el ojo */}
        <div className="flex items-end gap-2.5">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-text-muted font-medium mb-0.5">Sin promo</div>
            <div className="text-base font-semibold text-text-muted/70 line-through decoration-red-300 leading-none">{formatMoney(sinPromo)}</div>
          </div>
          <span className="text-amber-400 text-xl leading-none pb-px">→</span>
          <div>
            <div className="text-[9px] uppercase tracking-wide text-amber-700 font-bold mb-0.5">Con promo · {unidades} un.</div>
            <div className="text-2xl font-bold text-amber-700 leading-none">{formatMoney(conPromo)}</div>
          </div>
          <span className={`self-center ml-1 px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap ${descuento >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {descuento >= 0 ? '−' : '+'}{formatMoney(Math.abs(descuento))} ({descuento >= 0 ? '-' : '+'}{Math.abs(pctDescuento).toFixed(1)}%)
          </span>
        </div>

        <div className="hidden md:block self-stretch w-px bg-amber-200" />

        {/* Chips secundarios, alineados y densos */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <MiniStat label="Costo total" value={formatMoney(costoTotal)} />
          {costoRegalo !== undefined && costoRegalo > 0 && (
            <MiniStat label="🎁 Costo del regalo" value={formatMoney(costoRegalo)} color="#b45309" />
          )}
          <MiniStat label="Food cost" value={`${foodCost.toFixed(1)}%`} color={fcColor} />
          {markupSin !== undefined && markupCon !== undefined && (
            <MiniStat label="Markup" value={`${markupSin.toFixed(0)}% → ${markupCon.toFixed(0)}%`} color={getMCColor(markupCon)} />
          )}
          {gananciaTarjeta !== undefined && (
            <MiniStat label="💳 Ganancia" value={formatMoney(gananciaTarjeta)} color={ganColor(gananciaTarjeta)} />
          )}
          {gananciaEfectivo !== undefined && (
            <MiniStat label="💵 Ganancia" value={formatMoney(gananciaEfectivo)} color={ganColor(gananciaEfectivo)} />
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ANALISIS DE PROMO
// precio_especial = SIEMPRE el precio del paquete completo (aunque sea un solo
// producto con cantidad > 1, ej: "6 medialunas por $12.000"). Los demas tipos
// (%, fijo, 2x1, 3x2) se aplican producto por producto.
// =============================================================================
function AnalisisPromo({
  productos,
  tipo,
  valor,
  resumenCanales,
}: {
  productos: Producto[];
  tipo: TipoOferta;
  valor: number;
  resumenCanales: ResumenCanales;
}) {
  if (tipo === 'precio_especial') {
    return <AnalisisCombo productos={productos} precioCombo={valor} resumenCanales={resumenCanales} />;
  }

  if (tipo === 'compra_regalo') {
    // Precio del combo: override manual (valor > 0) o automatico
    // (pagados a precio lista + regalos con su descuento).
    const auto = productos.reduce((s, p: Producto & { cantidad?: number; rol?: string; descuento_pct?: number }) => {
      const cant = Number(p.cantidad) || 1;
      const precio = Number(p.precio_publico) || 0;
      if (p.rol === 'regalo') {
        const desc = Math.min(100, Number(p.descuento_pct) || 100);
        return s + precio * cant * (1 - desc / 100);
      }
      return s + precio * cant;
    }, 0);
    const precioEfectivo = Number(valor) > 0 ? Number(valor) : auto;
    return <AnalisisCombo productos={productos} precioCombo={precioEfectivo} resumenCanales={resumenCanales} esRegalo />;
  }

  return <AnalisisIndividual productos={productos} tipo={tipo} valor={valor} resumenCanales={resumenCanales} />;
}

// =============================================================================
// ANALISIS COMBO - los productos se agregan como un solo paquete
// Considera la cantidad de cada producto en el combo.
// =============================================================================
function AnalisisCombo({
  productos,
  precioCombo,
  resumenCanales,
  esRegalo,
}: {
  productos: (Producto & { cantidad?: number; rol?: string; descuento_pct?: number })[];
  precioCombo: number;
  resumenCanales: ResumenCanales;
  esRegalo?: boolean; // tipo compra_regalo: muestra roles y costo del regalo
}) {
  const datos = useMemo(() => {
    // Sumas agregadas (multiplicando por cantidad de cada producto)
    const costoTotal = productos.reduce(
      (s, p) => s + (Number(p.costo_total) || 0) * (Number(p.cantidad) || 1),
      0
    );
    const precioListaTotal = productos.reduce(
      (s, p) => s + (Number(p.precio_publico) || 0) * (Number(p.cantidad) || 1),
      0
    );

    const precioPromo = Math.max(0, Number(precioCombo) || 0);
    const ahorroCliente = precioListaTotal - precioPromo;
    const pctDescuento = precioListaTotal > 0 ? (ahorroCliente / precioListaTotal) * 100 : 0;

    const markupOriginal = calcularMarkup(precioListaTotal, costoTotal);
    const markupConPromo = calcularMarkup(precioPromo, costoTotal);

    // Calculos completos (con deducciones) por canal SIN promo y CON promo
    const mcTarjetaSin = precioListaTotal > 0
      ? calcularMCNeto(precioListaTotal, costoTotal, resumenCanales.tarjeta)
      : null;
    const mcTarjetaCon = precioPromo > 0
      ? calcularMCNeto(precioPromo, costoTotal, resumenCanales.tarjeta)
      : null;

    const mcEfectivoSin = precioListaTotal > 0
      ? calcularMCNeto(precioListaTotal, costoTotal, resumenCanales.efectivo)
      : null;
    const mcEfectivoCon = precioPromo > 0
      ? calcularMCNeto(precioPromo, costoTotal, resumenCanales.efectivo)
      : null;

    const alerta =
      precioPromo < costoTotal ||
      (mcTarjetaCon != null && mcTarjetaCon.mc < 15) ||
      (mcEfectivoCon != null && mcEfectivoCon.mc < 15);

    return {
      costoTotal,
      precioListaTotal,
      precioPromo,
      ahorroCliente,
      pctDescuento,
      markupOriginal,
      markupConPromo,
      mcTarjetaSin, mcTarjetaCon,
      mcEfectivoSin, mcEfectivoCon,
      alerta,
    };
  }, [productos, precioCombo, resumenCanales]);

  const totalItems = productos.reduce((s, p) => s + (Number(p.cantidad) || 1), 0);

  return (
    <section>
      <h4 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">
        Analisis del combo
      </h4>

      {datos.alerta && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-xs text-red-800">
          ⚠ <strong>Atencion:</strong> el precio del combo esta por debajo del costo o tiene MC muy bajo.
          Revisa antes de aplicarla.
        </div>
      )}

      {/* Resumen compacto: flujo de precio + chips */}
      <FlujoPrecioResumen
        titulo={`Combo de ${totalItems} ${totalItems === 1 ? 'item' : 'items'}${esRegalo ? ' · Compra + Regalo 🎁' : ''}`}
        subtitulo={productos.map((p) => `${p.cantidad || 1}× ${p.nombre}${esRegalo && p.rol === 'regalo' ? ' 🎁' : ''}`).join(' + ')}
        unidades={totalItems}
        sinPromo={datos.precioListaTotal}
        conPromo={datos.precioPromo}
        descuento={datos.ahorroCliente}
        pctDescuento={datos.pctDescuento}
        costoTotal={datos.costoTotal}
        markupSin={datos.markupOriginal}
        markupCon={datos.markupConPromo}
        gananciaTarjeta={datos.mcTarjetaCon?.ganancia}
        gananciaEfectivo={datos.mcEfectivoCon?.ganancia}
        costoRegalo={esRegalo
          ? productos.reduce((s, p) => s + (p.rol === 'regalo' ? (Number(p.costo_total) || 0) * (Number(p.cantidad) || 1) : 0), 0)
          : undefined}
      />

      {/* MC por canal con desglose detallado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CanalCardDetalle
          label="💳 Tarjeta"
          precioSin={datos.precioListaTotal}
          precioCon={datos.precioPromo}
          costo={datos.costoTotal}
          mcSin={datos.mcTarjetaSin}
          mcCon={datos.mcTarjetaCon}
        />
        <CanalCardDetalle
          label="💵 Efectivo"
          precioSin={datos.precioListaTotal}
          precioCon={datos.precioPromo}
          costo={datos.costoTotal}
          mcSin={datos.mcEfectivoSin}
          mcCon={datos.mcEfectivoCon}
        />
      </div>

      {/* Detalle de productos del combo con cantidades y markup individual */}
      <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <h5 className="text-xs font-bold text-text-muted uppercase">Detalle por producto del combo</h5>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-gray-50">
              <tr className="text-left text-text-muted">
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium text-center">Cant.</th>
                <th className="px-3 py-2 font-medium text-right">Costo unit.</th>
                <th className="px-3 py-2 font-medium text-right">Precio lista</th>
                {esRegalo && <th className="px-3 py-2 font-medium text-right bg-emerald-50">Aporte al precio</th>}
                <th className="px-3 py-2 font-medium text-right">Markup individual</th>
                <th className="px-3 py-2 font-medium text-right">Subtotal costo</th>
                <th className="px-3 py-2 font-medium text-right">Subtotal precio</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const cant = Number(p.cantidad) || 1;
                const costo = Number(p.costo_total) || 0;
                const precio = Number(p.precio_publico) || 0;
                const markupInd = calcularMarkup(precio, costo);
                const esProdRegalo = esRegalo && p.rol === 'regalo';
                const desc = Math.min(100, Number(p.descuento_pct) || 100);
                const aporte = esProdRegalo ? precio * cant * (1 - desc / 100) : precio * cant;
                return (
                  <tr key={p.id} className={`border-t border-gray-100 ${esProdRegalo ? 'bg-emerald-50/40' : ''}`}>
                    <td className="px-3 py-2 font-medium">
                      {p.nombre}
                      {esProdRegalo && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                          🎁 {desc >= 100 ? 'GRATIS' : `-${desc}%`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-mono">{cant}</td>
                    <td className="px-3 py-2 text-right text-text-muted">{formatMoney(costo)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(precio)}</td>
                    {esRegalo && (
                      <td className="px-3 py-2 text-right font-semibold bg-emerald-50/40">
                        {formatMoney(aporte)}
                        {esProdRegalo && aporte < precio * cant && (
                          <div className="text-[9px] text-emerald-700 font-normal">regalás {formatMoney(precio * cant - aporte)}</div>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-bold" style={{ color: getMCColor(markupInd) }}>
                      {markupInd.toFixed(0)}%
                    </td>
                    <td className="px-3 py-2 text-right text-text-muted">{formatMoney(costo * cant)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(precio * cant)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                <td className="px-3 py-2" colSpan={esRegalo ? 6 : 5}>Totales del combo</td>
                <td className="px-3 py-2 text-right">{formatMoney(datos.costoTotal)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(datos.precioListaTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-text-muted mt-2 italic">
        {esRegalo
          ? '🎁 El costo de los productos de regalo SIEMPRE cuenta en el costo del combo: el margen que ves es el real. "Aporte al precio" muestra lo que cada producto suma al precio final (vender en promo no es lo mismo que vender individual).'
          : '💡 El precio especial se aplica al combo entero. Las metricas se calculan sobre la suma de costos y precios (multiplicados por cantidad).'}
      </p>
    </section>
  );
}

function CanalCardDetalle({
  label,
  precioCon,
  costo,
  mcCon,
}: {
  label: string;
  precioSin: number;
  precioCon: number;
  costo: number;
  mcSin: { mc: number; ganancia: number; deducciones: { nombre: string; porcentaje: number; monto: number }[] } | null;
  mcCon: { mc: number; ganancia: number; deducciones: { nombre: string; porcentaje: number; monto: number }[] } | null;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="text-xs font-bold text-text-primary mb-2">{label}</div>

      <div className="rounded border-2 border-amber-300 p-2.5 bg-amber-50/50">
        <div className="text-[10px] font-bold text-amber-800 uppercase mb-2">Con promo</div>
        {mcCon ? (
          <div className="space-y-1 text-xs text-text-muted">
            <div className="flex justify-between">
              <span>Precio</span>
              <span className="font-mono font-bold text-amber-700">{formatMoney(precioCon)}</span>
            </div>
            {mcCon.deducciones.map((d, i) => (
              <div key={i} className="flex justify-between">
                <span className="truncate">(-) {d.nombre} {d.porcentaje}%</span>
                <span className="font-mono shrink-0">{formatMoney(d.monto)}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span>(-) Costo</span>
              <span className="font-mono">{formatMoney(costo)}</span>
            </div>
            <div className="flex justify-between font-bold text-text-primary pt-1 mt-1 border-t border-amber-300">
              <span>Ganancia</span>
              <span className="font-mono" style={{ color: getMCColor(mcCon.mc) }}>{formatMoney(mcCon.ganancia)}</span>
            </div>
            <div className="flex justify-between items-center font-semibold pt-1">
              <span>MC</span>
              <MCBadge value={mcCon.mc} size="sm" />
            </div>
          </div>
        ) : (
          <div className="text-xs text-text-muted">Sin precio definido</div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// ANALISIS INDIVIDUAL - aplica la promo a cada producto por separado
// (porcentaje, fijo, 2x1, 3x2, o precio especial con un solo producto)
// =============================================================================
function AnalisisIndividual({
  productos,
  tipo,
  valor,
  resumenCanales,
}: {
  productos: (Producto & { cantidad?: number })[];
  tipo: TipoOferta;
  valor: number;
  resumenCanales: ResumenCanales;
}) {
  // Calcula metricas para cada producto (unitarias y TOTALES por cantidad)
  const filas = useMemo(() => {
    return productos.map((p) => {
      const cantidad = Number(p.cantidad) || 1;
      const costo = Number(p.costo_total) || 0;
      const precioLocal = Number(p.precio_publico) || 0;

      const precioLocalPromo = calcularPrecioConPromo(precioLocal, tipo, valor);

      const markupOriginal = calcularMarkup(precioLocal, costo);
      const markupConPromo = calcularMarkup(precioLocalPromo, costo);

      const mcTarjetaOriginal = precioLocal > 0 ? calcularMCNeto(precioLocal, costo, resumenCanales.tarjeta).mc : 0;
      const mcTarjetaPromoCalc = precioLocalPromo > 0 ? calcularMCNeto(precioLocalPromo, costo, resumenCanales.tarjeta) : null;
      const mcTarjetaPromo = mcTarjetaPromoCalc?.mc ?? 0;

      const mcEfectivoOriginal = precioLocal > 0 ? calcularMCNeto(precioLocal, costo, resumenCanales.efectivo).mc : 0;
      const mcEfectivoPromoCalc = precioLocalPromo > 0 ? calcularMCNeto(precioLocalPromo, costo, resumenCanales.efectivo) : null;
      const mcEfectivoPromo = mcEfectivoPromoCalc?.mc ?? 0;

      const diferenciaLocal = precioLocalPromo - precioLocal;

      // Totales por cantidad (los importes reales de la oferta)
      const costoTotal = costo * cantidad;
      const totalSinPromo = precioLocal * cantidad;
      const totalConPromo = precioLocalPromo * cantidad;
      const gananciaTarjetaTotal = (mcTarjetaPromoCalc?.ganancia ?? 0) * cantidad;
      const gananciaEfectivoTotal = (mcEfectivoPromoCalc?.ganancia ?? 0) * cantidad;

      const alerta = (
        precioLocalPromo < costo ||
        mcTarjetaPromo < 15 ||
        mcEfectivoPromo < 15
      );

      return {
        producto: p,
        cantidad,
        costo, costoTotal,
        precioLocal, precioLocalPromo, diferenciaLocal,
        totalSinPromo, totalConPromo,
        gananciaTarjetaTotal, gananciaEfectivoTotal,
        markupOriginal, markupConPromo,
        mcTarjetaOriginal, mcTarjetaPromo,
        mcEfectivoOriginal, mcEfectivoPromo,
        alerta,
      };
    });
  }, [productos, tipo, valor, resumenCanales]);

  // Totales de la oferta completa + promedios de porcentajes
  const totales = useMemo(() => {
    if (filas.length === 0) return null;
    const sum = filas.reduce(
      (acc, f) => ({
        unidades: acc.unidades + f.cantidad,
        costoTotal: acc.costoTotal + f.costoTotal,
        totalSinPromo: acc.totalSinPromo + f.totalSinPromo,
        totalConPromo: acc.totalConPromo + f.totalConPromo,
        gananciaTarjeta: acc.gananciaTarjeta + f.gananciaTarjetaTotal,
        gananciaEfectivo: acc.gananciaEfectivo + f.gananciaEfectivoTotal,
        markupOriginal: acc.markupOriginal + f.markupOriginal,
        markupConPromo: acc.markupConPromo + f.markupConPromo,
        mcTarjetaOriginal: acc.mcTarjetaOriginal + f.mcTarjetaOriginal,
        mcTarjetaPromo: acc.mcTarjetaPromo + f.mcTarjetaPromo,
        mcEfectivoOriginal: acc.mcEfectivoOriginal + f.mcEfectivoOriginal,
        mcEfectivoPromo: acc.mcEfectivoPromo + f.mcEfectivoPromo,
      }),
      { unidades: 0, costoTotal: 0, totalSinPromo: 0, totalConPromo: 0, gananciaTarjeta: 0, gananciaEfectivo: 0, markupOriginal: 0, markupConPromo: 0, mcTarjetaOriginal: 0, mcTarjetaPromo: 0, mcEfectivoOriginal: 0, mcEfectivoPromo: 0 }
    );
    const n = filas.length;
    const descuento = sum.totalSinPromo - sum.totalConPromo;
    const pctDescuento = sum.totalSinPromo > 0 ? (descuento / sum.totalSinPromo) * 100 : 0;
    return {
      unidades: sum.unidades,
      costoTotal: sum.costoTotal,
      totalSinPromo: sum.totalSinPromo,
      totalConPromo: sum.totalConPromo,
      descuento, pctDescuento,
      gananciaTarjeta: sum.gananciaTarjeta,
      gananciaEfectivo: sum.gananciaEfectivo,
      markupOriginal: sum.markupOriginal / n,
      markupConPromo: sum.markupConPromo / n,
      mcTarjetaOriginal: sum.mcTarjetaOriginal / n,
      mcTarjetaPromo: sum.mcTarjetaPromo / n,
      mcEfectivoOriginal: sum.mcEfectivoOriginal / n,
      mcEfectivoPromo: sum.mcEfectivoPromo / n,
    };
  }, [filas]);

  const alertasCount = filas.filter((f) => f.alerta).length;

  return (
    <section>
      <h4 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">
        Analisis de la promo (producto por producto)
      </h4>

      {alertasCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-xs text-red-800">
          ⚠ <strong>{alertasCount}</strong> producto{alertasCount === 1 ? '' : 's'} con MC bajo o por debajo del costo.
          Revisa que la promo no genere perdida.
        </div>
      )}

      {/* RESUMEN compacto: flujo de precio + chips (sin desparramar) */}
      {totales && (
        <FlujoPrecioResumen
          unidades={totales.unidades}
          sinPromo={totales.totalSinPromo}
          conPromo={totales.totalConPromo}
          descuento={totales.descuento}
          pctDescuento={totales.pctDescuento}
          costoTotal={totales.costoTotal}
          gananciaTarjeta={totales.gananciaTarjeta}
          gananciaEfectivo={totales.gananciaEfectivo}
        />
      )}

      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[1100px] text-xs">
          <thead className="bg-gray-50">
            <tr className="text-left text-text-muted">
              <th className="px-2 py-2 font-medium">Producto</th>
              <th className="px-2 py-2 font-medium text-center">Cant.</th>
              <th className="px-2 py-2 font-medium text-right">Costo u.</th>
              <th className="px-2 py-2 font-medium text-right">P. Local u.</th>
              <th className="px-2 py-2 font-medium text-right bg-amber-50">P. Promo u.</th>
              <th className="px-2 py-2 font-medium text-right">Total s/promo</th>
              <th className="px-2 py-2 font-medium text-right bg-amber-50">Total c/promo</th>
              <th className="px-2 py-2 font-medium text-right">Markup</th>
              <th className="px-2 py-2 font-medium text-right bg-amber-50">Markup Promo</th>
              <th className="px-2 py-2 font-medium text-center">💳 MC</th>
              <th className="px-2 py-2 font-medium text-center bg-amber-50">💳 MC Promo</th>
              <th className="px-2 py-2 font-medium text-center">💵 MC</th>
              <th className="px-2 py-2 font-medium text-center bg-amber-50">💵 MC Promo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.producto.id} className={`border-t border-gray-50 ${f.alerta ? 'bg-red-50/40' : 'hover:bg-gray-50/50'}`}>
                <td className="px-2 py-2 font-medium">
                  {f.producto.nombre}
                  {f.alerta && <span className="ml-1 text-red-600" title="MC bajo o precio menor al costo">⚠</span>}
                </td>
                <td className="px-2 py-2 text-center font-mono">{f.cantidad}</td>
                <td className="px-2 py-2 text-right text-text-muted">
                  {formatMoney(f.costo)}
                  {f.cantidad > 1 && <div className="text-[9px]">×{f.cantidad} = {formatMoney(f.costoTotal)}</div>}
                </td>
                <td className="px-2 py-2 text-right">{formatMoney(f.precioLocal)}</td>
                <td className="px-2 py-2 text-right bg-amber-50/30 font-semibold">
                  {formatMoney(f.precioLocalPromo)}
                  {f.diferenciaLocal !== 0 && (
                    <div className="text-[9px] text-red-600">
                      {f.diferenciaLocal < 0 ? '-' : '+'}{formatMoney(Math.abs(f.diferenciaLocal))}/u
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-right font-semibold">{formatMoney(f.totalSinPromo)}</td>
                <td className="px-2 py-2 text-right bg-amber-50/30 font-bold text-amber-800">
                  {formatMoney(f.totalConPromo)}
                  {f.totalConPromo !== f.totalSinPromo && (
                    <div className="text-[9px] text-red-600 font-normal">
                      {f.totalConPromo < f.totalSinPromo ? '-' : '+'}{formatMoney(Math.abs(f.totalSinPromo - f.totalConPromo))}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-right" style={{ color: getMCColor(f.markupOriginal) }}>
                  {f.markupOriginal.toFixed(0)}%
                </td>
                <td className="px-2 py-2 text-right bg-amber-50/30 font-semibold" style={{ color: getMCColor(f.markupConPromo) }}>
                  {f.markupConPromo.toFixed(0)}%
                </td>
                <td className="px-2 py-2 text-center"><MCBadge value={f.mcTarjetaOriginal} size="sm" /></td>
                <td className="px-2 py-2 text-center bg-amber-50/30"><MCBadge value={f.mcTarjetaPromo} size="sm" /></td>
                <td className="px-2 py-2 text-center"><MCBadge value={f.mcEfectivoOriginal} size="sm" /></td>
                <td className="px-2 py-2 text-center bg-amber-50/30"><MCBadge value={f.mcEfectivoPromo} size="sm" /></td>
              </tr>
            ))}
          </tbody>
          {totales && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold">
                <td className="px-2 py-2" colSpan={2}>Totales / Promedio</td>
                <td className="px-2 py-2 text-right">{formatMoney(totales.costoTotal)}</td>
                <td className="px-2 py-2"></td>
                <td className="px-2 py-2 bg-amber-50/30"></td>
                <td className="px-2 py-2 text-right">{formatMoney(totales.totalSinPromo)}</td>
                <td className="px-2 py-2 text-right bg-amber-50/30 text-amber-800">{formatMoney(totales.totalConPromo)}</td>
                <td className="px-2 py-2 text-right" style={{ color: getMCColor(totales.markupOriginal) }}>
                  {totales.markupOriginal.toFixed(0)}%
                </td>
                <td className="px-2 py-2 text-right bg-amber-50/30" style={{ color: getMCColor(totales.markupConPromo) }}>
                  {totales.markupConPromo.toFixed(0)}%
                </td>
                <td className="px-2 py-2 text-center"><MCBadge value={totales.mcTarjetaOriginal} size="sm" /></td>
                <td className="px-2 py-2 text-center bg-amber-50/30"><MCBadge value={totales.mcTarjetaPromo} size="sm" /></td>
                <td className="px-2 py-2 text-center"><MCBadge value={totales.mcEfectivoOriginal} size="sm" /></td>
                <td className="px-2 py-2 text-center bg-amber-50/30"><MCBadge value={totales.mcEfectivoPromo} size="sm" /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-[11px] text-text-muted mt-2 italic">
        Las columnas con fondo ambar muestran las metricas <strong>aplicando la promo</strong>.
        {tipo === '2x1' && ' En 2x1, "P. Promo" es el precio efectivo unitario (precio dividido 2).'}
        {tipo === '3x2' && ' En 3x2, "P. Promo" es el precio efectivo unitario (precio x 2/3).'}
      </p>
    </section>
  );
}
