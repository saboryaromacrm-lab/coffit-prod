import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Link2, Link2Off, Sparkles, AlertTriangle, CheckCircle2,
  Tag, Star, Trash2, Wand2, X, Plus, Pencil, RefreshCw, Pause, Play, Package,
  Info, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { cartaApi, type CartaFilters, type CartaItemInput } from '../api/carta';
import { productosApi } from '../api/productos';
import { ofertasApi } from '../api/ofertas';
import type {
  CartaItem, CartaResumen, CartaSugerencia, CartaCategoria, Producto, CartaAutoMapResult,
  VarianteTamano, VarianteSabor, VarianteTopping, VarianteTemperatura, VarianteAdicion,
  AdicionDisponible, Oferta,
} from '../types';
import { formatMoney } from '../utils/formatters';
import { normalizarTexto } from '../utils/normalizers';
import { rutaCategoria } from '../utils/categoriasTree';
import { useDebounce } from '../hooks/useDebounce';
import MCBadge from '../components/common/MCBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import ImagenUploader from '../components/common/ImagenUploader';

type EstadoFiltro = '' | 'con_costo' | 'sin_mapear' | 'sin_costo';
type SiNoFiltro = '' | 'si' | 'no';

// Opciones que se siembran al tildar "Frío o caliente". Son editables: se
// pueden renombrar, borrar o agregar otras (ej: "Tibio").
const TEMPERATURAS_DEFAULT: VarianteTemperatura[] = [
  { nombre: 'Frío', precio: null },
  { nombre: 'Caliente', precio: null },
];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Reconstruye el input completo de un item (para guardados parciales sin perder variantes)
function itemToInput(item: CartaItem, overrides: Partial<CartaItemInput> = {}): CartaItemInput {
  return {
    nombre: item.nombre,
    // Mapeado a producto sin override: mandar el precio EFECTIVO (el del
    // producto). Si mandaramos el precio_venta crudo (posiblemente viejo),
    // el write-through del backend pisaria el precio del producto con un
    // valor desactualizado al hacer un toggle rapido (destacar/pausar).
    precio_venta: item.tipo_mapeo === 'producto' && item.precio_manual === 0
      ? (Number(item.precio_efectivo) || 0)
      : (Number(item.precio_venta) || 0),
    precio_manual: item.precio_manual,
    categoria: item.categoria,
    subcategoria: item.subcategoria,
    etiqueta: item.etiqueta,
    descripcion: item.descripcion,
    imagen: item.imagen,
    // Fallback por si el item viene de una cache anterior a esta feature:
    // sin la lista, la bandera vieja reconstruye las dos opciones.
    temperaturas: item.temperaturas || (item.frio_caliente === 1 ? TEMPERATURAS_DEFAULT : []),
    destacado: item.destacado,
    desactivar: item.desactivar,
    fecha_lanzamiento: item.fecha_lanzamiento,
    tamanos: item.tamanos,
    sabores: item.sabores,
    toppings: item.toppings,
    // Solo se persiste producto_id + override; el resto se resuelve en vivo
    adiciones: (item.adiciones || []).map((a) => ({ producto_id: a.producto_id, precio: a.precio_override })),
    ...overrides,
  };
}

export default function Carta() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [buscar, setBuscar] = useState(searchParams.get('buscar') || '');
  const [categoria, setCategoria] = useState('');
  const [subcategoria, setSubcategoria] = useState('');
  const [estado, setEstado] = useState<EstadoFiltro>('');
  const [etiquetaFiltro, setEtiquetaFiltro] = useState('');
  const [destacadoFiltro, setDestacadoFiltro] = useState<SiNoFiltro>('');
  const [soloNuevos, setSoloNuevos] = useState(false);
  const [incluirDesactivados, setIncluirDesactivados] = useState(true);
  const [editItem, setEditItem] = useState<CartaItem | 'nuevo' | null>(null);
  const [mapeandoItem, setMapeandoItem] = useState<CartaItem | null>(null);
  const [autoMapOpen, setAutoMapOpen] = useState(false);
  const debouncedBuscar = useDebounce(buscar);

  const filters: CartaFilters = {
    buscar: debouncedBuscar || undefined,
    categoria: categoria || undefined,
    subcategoria: subcategoria || undefined,
    estado: estado || undefined,
    solo_nuevos: soloNuevos ? 1 : undefined,
    incluir_desactivados: incluirDesactivados ? 1 : undefined,
  };

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['carta', debouncedBuscar, categoria, subcategoria, estado, soloNuevos, incluirDesactivados],
    queryFn: () => cartaApi.getAll(filters),
  });
  const itemsRaw: CartaItem[] = itemsData?.data || [];

  const { data: resumenData } = useQuery({
    queryKey: ['carta-resumen'],
    queryFn: () => cartaApi.getResumen(),
  });
  const resumen: CartaResumen | null = resumenData?.data || null;

  const { data: categoriasData } = useQuery({
    queryKey: ['carta-categorias'],
    queryFn: () => cartaApi.getCategorias(),
  });
  const categorias: CartaCategoria[] = categoriasData?.data || [];
  // Subcategorias de la categoria elegida (el filtro de subcategoria solo
  // tiene sentido dentro de una categoria: los nombres pueden repetirse).
  const subcatsDeCategoria = categoria
    ? (categorias.find((c) => c.categoria === categoria)?.subcategorias || [])
    : [];

  const etiquetasDisponibles = useMemo(() => {
    const set = new Set<string>();
    itemsRaw.forEach((i) => (i.etiqueta || '').split(',').map((e) => e.trim()).filter(Boolean).forEach((e) => set.add(e)));
    return Array.from(set).sort();
  }, [itemsRaw]);

  const items = useMemo(() => {
    return itemsRaw.filter((i) => {
      if (etiquetaFiltro && !(i.etiqueta || '').toLowerCase().includes(etiquetaFiltro.toLowerCase())) return false;
      if (destacadoFiltro === 'si' && i.destacado !== 1) return false;
      if (destacadoFiltro === 'no' && i.destacado === 1) return false;
      return true;
    });
  }, [itemsRaw, etiquetaFiltro, destacadoFiltro]);

  const limpiarFiltros = () => {
    setBuscar(''); setCategoria(''); setEstado(''); setEtiquetaFiltro('');
    setDestacadoFiltro(''); setSoloNuevos(false);
  };

  const invalidarCarta = () => {
    queryClient.invalidateQueries({ queryKey: ['carta'] });
    queryClient.invalidateQueries({ queryKey: ['carta-resumen'] });
    queryClient.invalidateQueries({ queryKey: ['carta-categorias'] });
    queryClient.invalidateQueries({ queryKey: ['carta-mapeo-productos'] });
    // El precio editado en carta puede escribir en el producto (write-through):
    // refrescamos productos y todo lo que depende de sus precios.
    queryClient.invalidateQueries({ queryKey: ['productos'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const migrarMut = useMutation({
    mutationFn: () => cartaApi.normalizarVariantes(),
    onSuccess: (res) => {
      const n = res?.data?.migrados ?? 0;
      toast.success(`${n} items normalizados a variantes`);
      invalidarCarta();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      {/* Banner informativo: como funciona esta seccion */}
      <CartaInfoBanner />

      {/* Stat cards + acciones */}
      <div className="flex flex-col lg:flex-row gap-3">
        {resumen && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 flex-1">
            <StatCard label="Items" value={String(resumen.total)} icon={<Tag size={18} className="text-primary" />} />
            <StatCard label="Con costo" value={String(resumen.con_costo)} icon={<CheckCircle2 size={18} className="text-green-500" />}
              sub={`${resumen.total > 0 ? Math.round((resumen.con_costo / resumen.total) * 100) : 0}% mapeado`} />
            <StatCard label="Sin mapear" value={String(resumen.sin_mapear)} icon={<Link2Off size={18} className="text-amber-500" />} />
            <StatCard label="Nuevos" value={String(resumen.nuevos)} icon={<Sparkles size={18} className="text-fuchsia-500" />} sub="en 'Ver lo nuevo'" />
            <StatCard label="MC prom. 💳" value={`${resumen.margen_promedio_tarjeta.toFixed(1)}%`} icon={<Sparkles size={18} className="text-blue-500" />} sub="items con costo" />
          </div>
        )}
        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={() => setEditItem('nuevo')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90">
            <Plus size={18} /> Nuevo item
          </button>
          <div className="flex gap-2">
            <button onClick={() => setAutoMapOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-primary border border-primary rounded-lg hover:bg-primary/5"
              title="Mapear automaticamente por nombre">
              <Wand2 size={14} /> Auto-mapear
            </button>
            <button
              onClick={() => { if (window.confirm('Migrar variantes legacy (sabores/toppings/tamaño) a la estructura nueva y sembrar fecha de lanzamiento? Es seguro re-ejecutarlo.')) migrarMut.mutate(); }}
              disabled={migrarMut.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-text-muted border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              title="Convierte los datos viejos a la estructura de variantes (una vez)">
              <RefreshCw size={14} className={migrarMut.isPending ? 'animate-spin' : ''} /> Migrar variantes
            </button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative w-full sm:flex-1 sm:min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar item..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setSubcategoria(''); }} className="px-2.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white">
            <option value="">Categoria: todas</option>
            {categorias.map((c) => <option key={c.categoria} value={c.categoria}>{c.categoria} ({c.cantidad})</option>)}
          </select>
          {/* Solo aparece si la categoria elegida tiene subcategorias.
              Los nombres pueden repetirse entre categorias, por eso siempre
              va acotado a una categoria. */}
          {subcatsDeCategoria.length > 0 && (
            <select value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} className="px-2.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="">Subcategoria: todas</option>
              {subcatsDeCategoria.map((s) => <option key={s.subcategoria} value={s.subcategoria}>{s.subcategoria} ({s.cantidad})</option>)}
              <option value="__sin__">— Sin subcategoria —</option>
            </select>
          )}
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoFiltro)} className="px-2.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white">
            <option value="">Mapeo: todos</option>
            <option value="con_costo">✅ Con costo</option>
            <option value="sin_mapear">🔗 Sin mapear</option>
            <option value="sin_costo">⚠️ Mapeado sin costo</option>
          </select>
          <select value={etiquetaFiltro} onChange={(e) => setEtiquetaFiltro(e.target.value)} className="px-2.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white">
            <option value="">Etiqueta: todas</option>
            {etiquetasDisponibles.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={destacadoFiltro} onChange={(e) => setDestacadoFiltro(e.target.value as SiNoFiltro)} className="px-2.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white">
            <option value="">Destacado: todos</option>
            <option value="si">⭐ Solo destacados</option>
            <option value="no">Sin destacar</option>
          </select>
          <label className="flex items-center gap-1.5 px-2.5 py-2.5 text-sm border border-gray-300 rounded-lg cursor-pointer select-none">
            <input type="checkbox" checked={soloNuevos} onChange={(e) => setSoloNuevos(e.target.checked)} className="rounded" />
            🆕 Solo nuevos
          </label>
          <label className="flex items-center gap-1.5 px-2.5 py-2.5 text-sm border border-gray-300 rounded-lg cursor-pointer select-none">
            <input type="checkbox" checked={incluirDesactivados} onChange={(e) => setIncluirDesactivados(e.target.checked)} className="rounded" />
            Ver pausados
          </label>
          <button onClick={limpiarFiltros} className="px-3 py-2.5 text-sm text-text-muted hover:text-primary border border-gray-300 rounded-lg flex items-center gap-1">
            <X size={14} /> Limpiar
          </button>
        </div>
        <div className="mt-2 text-xs text-text-muted">{items.length} items</div>
      </div>

      {/* Grilla de vista */}
      {isLoading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <EmptyState message="No hay items de carta para estos filtros" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-text-muted">
                <th className="px-3 py-2.5 font-semibold">Item</th>
                <th className="px-3 py-2.5 font-semibold text-right">Precio</th>
                <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Categoria</th>
                <th className="px-3 py-2.5 font-semibold hidden lg:table-cell">Variantes</th>
                <th className="px-3 py-2.5 font-semibold hidden lg:table-cell">Incluye</th>
                <th className="px-3 py-2.5 font-semibold">Mapeo (costo)</th>
                <th className="px-3 py-2.5 font-semibold text-center hidden md:table-cell">Rentab.</th>
                <th className="px-3 py-2.5 font-semibold text-center w-32">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <CartaRowView
                  key={item.id}
                  item={item}
                  onEdit={() => setEditItem(item)}
                  onMapear={() => setMapeandoItem(item)}
                  onChanged={invalidarCarta}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editItem && (
        <EditarItemModal
          item={editItem === 'nuevo' ? null : editItem}
          categorias={categorias}
          onClose={() => setEditItem(null)}
          onSaved={() => { invalidarCarta(); setEditItem(null); }}
        />
      )}
      {mapeandoItem && (
        <MapeoModal item={mapeandoItem} onClose={() => setMapeandoItem(null)} onMapped={() => { invalidarCarta(); setMapeandoItem(null); }} />
      )}
      {autoMapOpen && (
        <AutoMapModal onClose={() => setAutoMapOpen(false)} onApplied={() => { invalidarCarta(); setAutoMapOpen(false); }} />
      )}
    </div>
  );
}

// ============================================================================
// FILA DE VISTA (con toggles rapidos)
// ============================================================================
function CartaRowView({ item, onEdit, onMapear, onChanged }: {
  item: CartaItem; onEdit: () => void; onMapear: () => void; onChanged: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  const quickMut = useMutation({
    mutationFn: (overrides: Partial<CartaItemInput>) => cartaApi.update(item.id, itemToInput(item, overrides)),
    onSuccess: onChanged,
    onError: (err: Error) => toast.error(err.message),
  });
  const deleteMut = useMutation({
    mutationFn: () => cartaApi.delete(item.id),
    onSuccess: () => { toast.success('Item eliminado'); setConfirmDel(false); onChanged(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const nT = item.tamanos.length, nS = item.sabores.length, nTo = item.toppings.length;
  const nA = (item.adiciones || []).length;
  const variantesResumen = [
    nT ? `${nT} tamaño${nT > 1 ? 's' : ''}` : '',
    nS ? `${nS} sabor${nS > 1 ? 'es' : ''}` : '',
    nTo ? `${nTo} topping${nTo > 1 ? 's' : ''}` : '',
    nA ? `${nA} adicion${nA > 1 ? 'es' : ''}` : '',
  ].filter(Boolean);
  const variantesTitle = [
    ...item.tamanos.map((t) => `Tamaño: ${t.nombre}`),
    ...item.sabores.map((s) => `Sabor: ${s.nombre}${s.es_nuevo ? ' (nuevo)' : ''}`),
    ...item.toppings.map((t) => `Topping: ${t.nombre}${t.precio ? ` +${formatMoney(t.precio)}` : ''}`),
    ...(item.adiciones || []).map((a) => `Adicion: ${a.nombre} +${formatMoney(a.precio_extra)}`),
  ].join('\n');

  const rowBg = item.estado_mapeo === 'con_costo' ? 'bg-green-50/20' : item.estado_mapeo === 'sin_costo' ? 'bg-amber-50/20' : '';

  return (
    <tr className={`border-b border-gray-50 hover:bg-gray-50/50 ${rowBg} ${item.desactivar ? 'opacity-50' : ''}`}>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.destacado === 1 && <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />}
          <button onClick={onEdit} className="font-medium text-left hover:text-primary hover:underline cursor-pointer" title="Editar item">
            {item.nombre_efectivo}
          </button>
          {item.mapeado && <Link2 size={11} className="text-primary shrink-0" />}
          {item.es_nuevo_total && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700 font-bold">🆕 NUEVO</span>}
          {(item.temperaturas || []).length > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600"
              title={item.temperaturas
                .map((t) => `${t.nombre}: ${t.precio != null ? formatMoney(t.precio) : 'precio base'}`)
                .join(' · ')}
            >
              {item.temperaturas.map((t) => t.nombre).join('/').toLowerCase()}
              {item.temperaturas.some((t) => t.precio != null) && ' 💲'}
            </span>
          )}
          {item.desactivar === 1 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-text-muted">pausado</span>}
          {item.tipo_mapeo === 'oferta' && item.oferta_estado && item.oferta_estado !== 'activa' && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold"
              title={`La promo esta ${item.oferta_estado}: este item NO se muestra en el menu publico hasta que la promo vuelva a estar activa.`}
            >
              ⚠ promo {item.oferta_estado}
            </span>
          )}
        </div>
        {item.etiqueta && <div className="text-[11px] text-text-muted mt-0.5">{item.etiqueta}</div>}
      </td>
      <PrecioCell item={item} onChanged={onChanged} />
      <td className="px-3 py-2.5 text-text-muted hidden sm:table-cell">
        {item.categoria_efectiva}
        {item.subcategoria_efectiva && (
          <div className="text-[11px] text-text-muted/80">↳ {item.subcategoria_efectiva}</div>
        )}
      </td>
      <td className="px-3 py-2.5 hidden lg:table-cell">
        {variantesResumen.length > 0 ? (
          <span title={variantesTitle} className="text-xs text-text-muted cursor-help underline decoration-dotted">
            {variantesResumen.join(' · ')}
          </span>
        ) : <span className="text-xs text-text-muted/50">—</span>}
      </td>
      {/* Incluye: composicion del box/combo (solo items mapeados a promo) */}
      <td className="px-3 py-2.5 hidden lg:table-cell">
        {item.tipo_mapeo === 'oferta' && item.incluye && item.incluye.length > 0 ? (
          <div
            className="flex flex-wrap gap-1 max-w-[220px]"
            title={item.incluye.map((c) => `${c.cantidad}× ${c.nombre}`).join('\n')}
          >
            {item.incluye.map((c, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100 whitespace-nowrap">
                {c.cantidad}× {c.nombre}
              </span>
            ))}
          </div>
        ) : <span className="text-xs text-text-muted/50">—</span>}
      </td>
      <td className="px-3 py-2.5">
        {item.tipo_mapeo === 'producto' ? (
          <button onClick={onMapear} className="text-left text-primary text-xs font-medium hover:underline flex items-center gap-1">
            <Package size={11} className="shrink-0" /> {item.producto_nombre}
            <span className="text-text-muted ml-1">{item.tiene_costo ? formatMoney(Number(item.costo_total) || 0) : '(s/costo)'}</span>
          </button>
        ) : item.tipo_mapeo === 'oferta' ? (
          <button onClick={onMapear} className="text-left text-fuchsia-700 text-xs font-medium hover:underline flex items-center gap-1">
            <Tag size={11} className="shrink-0" /> {item.oferta_nombre} <span className="text-[10px] text-fuchsia-500">(promo)</span>
            <span className="text-text-muted ml-1">{item.tiene_costo ? formatMoney(Number(item.costo_total) || 0) : '(s/costo)'}</span>
          </button>
        ) : (
          <button onClick={onMapear} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-medium">
            <Link2Off size={11} /> Mapear
          </button>
        )}
      </td>
      <td className="px-3 py-2.5 text-center hidden md:table-cell">
        {item.estado_mapeo === 'con_costo' && item.rentabilidad ? (
          <div className="flex items-center justify-center gap-1">
            <MCBadge value={item.rentabilidad.tarjeta.mc_neto} size="sm" />
          </div>
        ) : item.estado_mapeo === 'sin_costo' ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600"><AlertTriangle size={10} /> s/costo</span>
        ) : <span className="text-[10px] text-text-muted">—</span>}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-center gap-0.5">
          <button onClick={() => quickMut.mutate({ destacado: item.destacado ? 0 : 1 })}
            className={`p-1.5 rounded hover:bg-gray-100 ${item.destacado ? 'text-amber-500' : 'text-gray-300'}`} title="Destacar">
            <Star size={14} className={item.destacado ? 'fill-amber-400' : ''} />
          </button>
          <button onClick={() => quickMut.mutate({ desactivar: item.desactivar ? 0 : 1 })}
            className={`p-1.5 rounded hover:bg-gray-100 ${item.desactivar ? 'text-gray-400' : 'text-green-500'}`} title={item.desactivar ? 'Reactivar' : 'Pausar'}>
            {item.desactivar ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button onClick={onEdit} className="p-1.5 rounded text-text-muted hover:text-primary hover:bg-primary/10" title="Editar todo">
            <Pencil size={14} />
          </button>
          <button onClick={() => setConfirmDel(true)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" title="Eliminar">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
      {confirmDel && (
        <td>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDel(false); }}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
              <h3 className="font-bold text-sm mb-2">Eliminar "{item.nombre_efectivo}"?</h3>
              <p className="text-xs text-text-muted mb-4">Se quita de la carta (no afecta al producto ni su costo).</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmDel(false)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg">Cancelar</button>
                <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg disabled:opacity-50">
                  {deleteMut.isPending ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </td>
      )}
    </tr>
  );
}

// ============================================================================
// CELDA DE PRECIO editable inline.
// - Item mapeado a PRODUCTO (sin override): al guardar escribe el precio EN EL
//   PRODUCTO (write-through del backend) -> Carta y Productos quedan en sync.
// - Item sin mapear u override manual: guarda en el item de carta.
// - Item mapeado a PROMO (sin override): no editable (el precio es del combo).
// ============================================================================
function PrecioCell({ item, onChanged }: { item: CartaItem; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [valor, setValor] = useState<string>('');

  const esComboSinOverride = item.tipo_mapeo === 'oferta' && item.precio_manual === 0;

  const saveMut = useMutation({
    mutationFn: (nuevo: number) => cartaApi.update(item.id, itemToInput(item, { precio_venta: nuevo })),
    onSuccess: (res) => {
      const proU = (res?.data as { producto_actualizado?: boolean } | undefined)?.producto_actualizado;
      toast.success(proU ? 'Precio actualizado (tambien en el producto)' : 'Precio actualizado');
      setEditing(false);
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const empezar = () => {
    if (esComboSinOverride) return;
    setValor(String(item.precio_efectivo || ''));
    setEditing(true);
  };

  const guardar = () => {
    const n = parseFloat(valor);
    if (Number.isNaN(n) || n < 0) { setEditing(false); return; }
    if (n === item.precio_efectivo) { setEditing(false); return; }
    saveMut.mutate(n);
  };

  if (editing) {
    return (
      <td className="px-3 py-2.5 text-right">
        <input
          type="number" min="0" step="1" autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={guardar}
          onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditing(false); }}
          disabled={saveMut.isPending}
          className="w-24 px-2 py-1 text-sm text-right font-mono border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </td>
    );
  }

  return (
    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
      {esComboSinOverride ? (
        <span title="Precio del combo — editalo en Promos" className="cursor-not-allowed">
          {formatMoney(item.precio_efectivo)}
          <div className="text-[9px] text-fuchsia-500 font-sans">del combo</div>
        </span>
      ) : (
        <button
          onClick={empezar}
          className="hover:bg-primary/5 hover:outline hover:outline-1 hover:outline-primary/30 rounded px-1.5 py-0.5 cursor-pointer"
          title={item.tipo_mapeo === 'producto' && item.precio_manual === 0
            ? 'Editar precio (se actualiza tambien en el producto)'
            : 'Editar precio de carta'}
        >
          {formatMoney(item.precio_efectivo)}
          {item.tipo_mapeo === 'producto' && item.precio_manual === 0 && (
            <div className="text-[9px] text-text-muted font-sans">sync producto ✎</div>
          )}
        </button>
      )}
    </td>
  );
}

// ============================================================================
// MODAL editar/crear item completo (con editores de variantes)
// ============================================================================
const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30';
const labelCls = 'block text-xs font-medium text-text-muted mb-1';
// Input para filas de variantes: SIN w-full (el ancho lo controla flex-1 / w-24).
const vInput = 'px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30';

function EditarItemModal({ item, categorias, onClose, onSaved }: {
  item: CartaItem | null;
  categorias: CartaCategoria[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const esMapeado = !!item?.mapeado;
  const esMapeadoProducto = item?.tipo_mapeo === 'producto';
  const esMapeadoOferta = item?.tipo_mapeo === 'oferta';
  const [nombre, setNombre] = useState(item?.nombre || '');
  // Mapeado a producto sin override: arranca con el precio del producto (editable,
  // al guardar el backend lo escribe en el producto -> sync con Productos).
  const [precioVenta, setPrecioVenta] = useState(
    item?.tipo_mapeo === 'producto' && item?.precio_manual === 0
      ? (Number(item?.precio_efectivo) || 0)
      : (Number(item?.precio_venta) || 0)
  );
  const [precioManual, setPrecioManual] = useState(item?.precio_manual === 1);
  const [categoria, setCategoria] = useState(item?.categoria || '');
  const [subcategoria, setSubcategoria] = useState(item?.subcategoria || '');
  // Subcategorias que YA existen en la categoria escrita (evita typos que
  // crearian una subcategoria fantasma en el menu publico).
  const subcatsDisponibles = categorias.find((c) => c.categoria === categoria)?.subcategorias || [];
  const precioInherido = Number(item?.precio_inherido) || 0; // del producto o del combo
  // Precio base para mostrar y heredar en variantes. Solo el combo sin override
  // queda fijo al precio heredado; en el resto sigue lo que escribas.
  const baseEfectiva = esMapeadoOferta && !precioManual ? precioInherido : precioVenta;
  const [etiqueta, setEtiqueta] = useState(item?.etiqueta || '');
  const [descripcion, setDescripcion] = useState(item?.descripcion || '');
  const [imagen, setImagen] = useState(item?.imagen || '');
  const [temperaturas, setTemperaturas] = useState<VarianteTemperatura[]>((item?.temperaturas || []).filter((t) => t.nombre?.trim()));
  const [destacado, setDestacado] = useState(item?.destacado === 1);
  const [desactivar, setDesactivar] = useState(item?.desactivar === 1);
  const [fechaLanzamiento, setFechaLanzamiento] = useState(item?.fecha_lanzamiento || '');
  // Filtra defensivamente cualquier fila con nombre vacio que pudiera venir del back.
  const [tamanos, setTamanos] = useState<VarianteTamano[]>((item?.tamanos || []).filter((t) => t.nombre?.trim()));
  const [sabores, setSabores] = useState<VarianteSabor[]>((item?.sabores || []).filter((s) => s.nombre?.trim()));
  const [toppings, setToppings] = useState<VarianteTopping[]>((item?.toppings || []).filter((t) => t.nombre?.trim()));
  const [adiciones, setAdiciones] = useState<VarianteAdicion[]>(item?.adiciones || []);

  // Productos de la categoria "Adiciones" (para el selector)
  const { data: adicionesDispData } = useQuery({
    queryKey: ['carta-adiciones-disponibles'],
    queryFn: () => cartaApi.getAdicionesDisponibles(),
    staleTime: 60_000,
  });
  const adicionesDisponibles: AdicionDisponible[] = adicionesDispData?.data || [];
  const adicionesParaAgregar = adicionesDisponibles.filter((d) => !adiciones.some((a) => a.producto_id === d.id));

  const agregarAdicion = (id: number) => {
    const d = adicionesDisponibles.find((x) => x.id === id);
    if (!d) return;
    setAdiciones([...adiciones, {
      producto_id: d.id, nombre: d.nombre,
      precio_extra: d.precio, precio_override: null,
      precio_producto: d.precio, costo: d.costo,
    }]);
  };
  const setAdicionPrecio = (i: number, v: number | null) => {
    setAdiciones(adiciones.map((a, idx) => idx === i
      ? { ...a, precio_override: v, precio_extra: v != null ? v : a.precio_producto }
      : a));
  };

  const buildInput = (): CartaItemInput => ({
    // Mapeado: nombre/categoria vienen del producto (snapshot). Sin mapear: propios.
    nombre: esMapeado ? (item?.nombre_efectivo || nombre).trim() : nombre.trim(),
    precio_venta: precioVenta,
    precio_manual: precioManual ? 1 : 0,
    // Solo el producto impone la categoria; las promos conservan la propia.
    // Mapeado (producto o promo): snapshot de la efectiva; sin mapear: la propia
    categoria: esMapeado ? (item?.categoria_efectiva || null) : (categoria || null),
    subcategoria: esMapeado ? (item?.subcategoria_efectiva || null) : (subcategoria || null),
    etiqueta: etiqueta || null,
    descripcion: descripcion || null,
    imagen: imagen || null,
    temperaturas: temperaturas.filter((t) => t.nombre.trim()),
    destacado: destacado ? 1 : 0,
    desactivar: desactivar ? 1 : 0,
    fecha_lanzamiento: fechaLanzamiento || null,
    tamanos: tamanos.filter((t) => t.nombre.trim()),
    sabores: sabores.filter((s) => s.nombre.trim()),
    toppings: toppings.filter((t) => t.nombre.trim()),
    adiciones: adiciones.map((a) => ({ producto_id: a.producto_id, precio: a.precio_override })),
  });

  const saveMut = useMutation({
    mutationFn: (): Promise<unknown> => item ? cartaApi.update(item.id, buildInput()) : cartaApi.create(buildInput()),
    onSuccess: () => { toast.success(item ? 'Item actualizado' : 'Item creado'); onSaved(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!esMapeado && !nombre.trim()) return toast.error('El nombre es requerido');
    saveMut.mutate();
  };

  return (
    <Modal isOpen onClose={onClose} title={item ? `Editar: ${item.nombre_efectivo}` : 'Nuevo item de carta'} size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={handleSave} loading={saveMut.isPending}>{item ? 'Guardar' : 'Crear'}</Button></>}>
      <div className="space-y-4">
        {/* Aviso si esta vinculado a un producto */}
        {esMapeadoProducto && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-900 flex items-center gap-2">
            <Package size={14} className="shrink-0" />
            <span>
              Vinculado al producto <strong>{item?.producto_nombre}</strong>. El <strong>nombre</strong> y la{' '}
              <strong>categoría</strong> se heredan del{' '}
              <a href={`/productos?openId=${item?.producto_id}`} target="_blank" rel="noopener noreferrer" className="underline font-medium">producto</a>.
              El <strong>precio</strong> podes editarlo aca: al guardar se actualiza <strong>tambien en el producto</strong> (quedan en sync).
            </span>
          </div>
        )}
        {/* Aviso si esta vinculado a una promo */}
        {esMapeadoOferta && (
          <div className="bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-3 text-xs text-fuchsia-900 flex items-center gap-2">
            <Tag size={14} className="shrink-0" />
            <span>
              Vinculado a la promo <strong>{item?.oferta_nombre}</strong>. El <strong>nombre</strong> y el{' '}
              <strong>precio</strong> (del combo) y la <strong>categoría</strong> (Promo/Combo/Boxs) se heredan de la promo — editalos en Promos/Boxs.
            </span>
          </div>
        )}

        {/* Datos basicos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Nombre {esMapeado ? (esMapeadoOferta ? '(de la promo)' : '(del producto)') : '*'}</label>
            {esMapeado ? (
              <input value={item?.nombre_efectivo || ''} readOnly className={`${inputCls} bg-gray-100 text-text-muted cursor-not-allowed`} />
            ) : (
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
            )}
          </div>
          <div>
            <label className={labelCls}>
              Precio base {esMapeadoProducto && !precioManual && <span className="text-primary font-normal">(sync producto)</span>}
            </label>
            {esMapeadoOferta && !precioManual ? (
              <input value={formatMoney(precioInherido)} readOnly className={`${inputCls} bg-gray-100 text-text-muted cursor-not-allowed`} title="Precio del combo — editalo en Promos" />
            ) : (
              <input type="number" min="0" step="1" value={precioVenta} onChange={(e) => setPrecioVenta(parseFloat(e.target.value) || 0)} className={inputCls}
                title={esMapeadoProducto && !precioManual ? 'Al guardar se actualiza tambien en el producto' : undefined} />
            )}
          </div>
        </div>

        {/* Toggle override de precio (solo si esta mapeado) */}
        {esMapeado && (
          <label className="flex items-center gap-2 text-xs cursor-pointer -mt-2">
            <input type="checkbox" checked={precioManual} onChange={(e) => setPrecioManual(e.target.checked)} className="rounded" />
            {esMapeadoOferta
              ? <>Usar un precio de carta distinto (override). Sin tildar usa {formatMoney(precioInherido)} del combo.</>
              : <>Precio de carta distinto al del producto (override, deja de sincronizar). Sin tildar, el precio se guarda en el producto.</>}
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Categoria {esMapeadoProducto ? '(del producto)' : esMapeadoOferta ? '(de la promo)' : ''}</label>
            {esMapeado ? (
              <input
                value={rutaCategoria(item?.categoria_efectiva, item?.subcategoria_efectiva)}
                readOnly className={`${inputCls} bg-gray-100 text-text-muted cursor-not-allowed`}
                title={esMapeadoOferta ? 'La define la promo (Promo/Combo/Boxs) — editala en Promos/Boxs' : 'La define el producto (categoria y subcategoria)'} />
            ) : (
              <>
                <input list="cat-list" value={categoria} onChange={(e) => { setCategoria(e.target.value); setSubcategoria(''); }} className={inputCls} />
                <datalist id="cat-list">{categorias.map((c) => <option key={c.categoria} value={c.categoria} />)}</datalist>
                {/* Subcategoria: desplegable con las que YA existen en esa
                    categoria. Evita que un typo cree una subcategoria fantasma
                    en el menu publico. */}
                {subcatsDisponibles.length > 0 && (
                  <select value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} className={`${inputCls} mt-1.5`}>
                    <option value="">— Sin subcategoria —</option>
                    {subcatsDisponibles.map((s) => <option key={s.subcategoria} value={s.subcategoria}>↳ {s.subcategoria}</option>)}
                  </select>
                )}
              </>
            )}
          </div>
          <div>
            <label className={labelCls}>Etiqueta (ej: SIN AZUCAR, SIN GLUTEN)</label>
            <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Descripcion</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ImagenUploader value={imagen} onChange={setImagen} />
          <div>
            <label className={labelCls}>Fecha de lanzamiento <span className="font-normal">(para "Ver lo nuevo")</span></label>
            <input type="date" value={fechaLanzamiento} onChange={(e) => setFechaLanzamiento(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={temperaturas.length > 0}
              onChange={(e) => setTemperaturas(e.target.checked ? TEMPERATURAS_DEFAULT.map((t) => ({ ...t })) : [])}
              className="rounded" /> Frío o caliente
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={destacado} onChange={(e) => setDestacado(e.target.checked)} className="rounded" /> ⭐ Destacado</label>
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={desactivar} onChange={(e) => setDesactivar(e.target.checked)} className="rounded" /> ⏸ Pausado (oculto en menú)</label>
        </div>

        {/* Variantes: Frío / Caliente (solo si el item se ofrece en temperaturas) */}
        {temperaturas.length > 0 && (
          <VarianteSection
            titulo="🌡️ Frío / Caliente" base={baseEfectiva}
            items={temperaturas}
            onAdd={() => setTemperaturas([...temperaturas, { nombre: '', precio: null }])}
            render={(t, i) => (
              <>
                <input value={t.nombre} onChange={(e) => setTemperaturas(upd(temperaturas, i, { nombre: e.target.value }))} placeholder="Ej: Caliente" className={`${vInput} flex-1 min-w-[140px]`} />
                <PrecioInput value={t.precio} base={baseEfectiva} onChange={(v) => setTemperaturas(upd(temperaturas, i, { precio: v }))} />
                <DiffPrecio precio={t.precio} base={baseEfectiva} />
                <RemoveBtn onClick={() => setTemperaturas(temperaturas.filter((_, x) => x !== i))} />
              </>
            )}
          />
        )}

        {/* Variantes: Tamaños */}
        <VarianteSection
          titulo="🥤 Tamaños" base={baseEfectiva}
          items={tamanos}
          onAdd={() => setTamanos([...tamanos, { nombre: '', precio: null }])}
          render={(t, i) => (
            <>
              <input value={t.nombre} onChange={(e) => setTamanos(upd(tamanos, i, { nombre: e.target.value }))} placeholder="Ej: 500ml" className={`${vInput} flex-1 min-w-[140px]`} />
              <PrecioInput value={t.precio} base={baseEfectiva} onChange={(v) => setTamanos(upd(tamanos, i, { precio: v }))} />
              <RemoveBtn onClick={() => setTamanos(tamanos.filter((_, x) => x !== i))} />
            </>
          )}
        />

        {/* Variantes: Sabores (con "nuevo") */}
        <VarianteSection
          titulo="🍓 Sabores" base={baseEfectiva}
          items={sabores}
          onAdd={() => setSabores([...sabores, { nombre: '', precio: null, fecha_nuevo: null }])}
          render={(s, i) => {
            const marcadoNuevo = !!s.fecha_nuevo;
            // Vigencia calculada en cliente: si se marco hoy es nuevo si o si;
            // para fechas viejas usamos el es_nuevo que ya calculo el backend.
            const nuevoVigente = s.fecha_nuevo === todayStr() || !!s.es_nuevo;
            return (
              <>
                <input value={s.nombre} onChange={(e) => setSabores(upd(sabores, i, { nombre: e.target.value }))} placeholder="Ej: Frutos rojos" className={`${vInput} flex-1 min-w-[140px]`} />
                <PrecioInput value={s.precio} base={baseEfectiva} onChange={(v) => setSabores(upd(sabores, i, { precio: v }))} />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer px-1">
                  <input type="checkbox" checked={marcadoNuevo}
                    onChange={(e) => setSabores(upd(sabores, i, { fecha_nuevo: e.target.checked ? todayStr() : null }))} className="rounded" />
                  nuevo
                  {marcadoNuevo && (nuevoVigente
                    ? <span className="text-fuchsia-600" title="Mostrandose como nuevo">●</span>
                    : <span className="text-gray-400" title="Marcado pero ya expiró (destildá y volvé a tildar para renovar)">○</span>)}
                </label>
                <RemoveBtn onClick={() => setSabores(sabores.filter((_, x) => x !== i))} />
              </>
            );
          }}
        />

        {/* Variantes: Toppings (precio EXTRA) */}
        <VarianteSection
          titulo="➕ Toppings (extra)" base={baseEfectiva} extraMode
          items={toppings}
          onAdd={() => setToppings([...toppings, { nombre: '', precio: 0 }])}
          render={(t, i) => (
            <>
              <input value={t.nombre} onChange={(e) => setToppings(upd(toppings, i, { nombre: e.target.value }))} placeholder="Ej: Con maple syrup" className={`${vInput} flex-1 min-w-[140px]`} />
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-text-muted">+$</span>
                <input type="number" min="0" step="1" value={t.precio || 0}
                  onChange={(e) => setToppings(upd(toppings, i, { precio: parseFloat(e.target.value) || 0 }))}
                  className={`${vInput} w-24 text-right`} placeholder="0" />
              </div>
              <RemoveBtn onClick={() => setToppings(toppings.filter((_, x) => x !== i))} />
            </>
          )}
        />

        {/* Adiciones: productos reales de la categoria "Adiciones" (precio/costo en vivo) */}
        <div className="border border-emerald-200 rounded-lg p-3 bg-emerald-50/40">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
            <span className="text-xs font-semibold text-emerald-800">🥓 Adiciones (desde Productos)</span>
            <span className="text-[10px] text-text-muted">precio vacío = usa el precio del producto adicion</span>
          </div>

          <div className="space-y-1.5">
            {adiciones.map((a, i) => (
              <div key={a.producto_id} className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <div className="text-sm font-medium truncate">{a.nombre}</div>
                  <div className="text-[10px] text-text-muted">
                    Precio producto {formatMoney(a.precio_producto)} · Costo {formatMoney(a.costo)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-text-muted">+$</span>
                  <input
                    type="number" min="0" step="1"
                    value={a.precio_override ?? ''}
                    onChange={(e) => setAdicionPrecio(i, e.target.value === '' ? null : (parseFloat(e.target.value) || 0))}
                    placeholder={String(a.precio_producto)}
                    title={`Vacío = precio del producto (${formatMoney(a.precio_producto)})`}
                    className={`${vInput} w-24 text-right`}
                  />
                </div>
                <RemoveBtn onClick={() => setAdiciones(adiciones.filter((_, x) => x !== i))} />
              </div>
            ))}
            {adiciones.length === 0 && <p className="text-xs text-text-muted/60 italic">Sin adiciones</p>}
          </div>

          {adicionesParaAgregar.length > 0 ? (
            <select
              value=""
              onChange={(e) => { if (e.target.value) agregarAdicion(Number(e.target.value)); }}
              className="mt-2 px-2.5 py-1.5 text-xs border border-emerald-300 rounded-lg bg-white text-emerald-800 cursor-pointer"
            >
              <option value="">+ Agregar adicion...</option>
              {adicionesParaAgregar.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre} — {formatMoney(d.precio)}</option>
              ))}
            </select>
          ) : adicionesDisponibles.length === 0 ? (
            <p className="mt-2 text-[10px] text-text-muted">
              No hay productos en la categoria "Adiciones". Crealos en la seccion Productos con esa categoria y van a aparecer aca.
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

// Helper para actualizar un item de un array inmutablemente
function upd<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, idx) => (idx === i ? { ...x, ...patch } : x));
}

function VarianteSection<T>({ titulo, base, items, onAdd, render, extraMode }: {
  titulo: string; base: number; items: T[]; onAdd: () => void;
  render: (item: T, i: number) => React.ReactNode; extraMode?: boolean;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <span className="text-xs font-semibold text-text-primary">{titulo}</span>
        <span className="text-[10px] text-text-muted">
          {extraMode ? 'precio = extra a sumar (default 0)' : `precio vacío = usa el base (${formatMoney(base)})`}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((it, i) => <div key={i} className="flex items-center gap-2 flex-wrap">{render(it, i)}</div>)}
        {items.length === 0 && <p className="text-xs text-text-muted/60 italic">Sin variantes</p>}
      </div>
      <button onClick={onAdd} className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"><Plus size={12} /> Agregar</button>
    </div>
  );
}

// Input de precio que permite vacío (=hereda base). placeholder muestra el base.
function PrecioInput({ value, base, onChange }: { value: number | null; base: number; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-xs text-text-muted">$</span>
      <input
        type="number" min="0" step="1"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : (parseFloat(e.target.value) || 0))}
        placeholder={String(base)}
        title={`Vacío = precio base (${formatMoney(base)})`}
        className={`${vInput} w-24 text-right`}
      />
    </div>
  );
}

// Muestra de un vistazo si la variante sale al precio base o cuanto mas (o
// menos) se paga. Es lo que despues ve el cliente en el menu.
function DiffPrecio({ precio, base }: { precio: number | null; base: number }) {
  if (precio == null || precio === base) {
    return <span className="text-[10px] text-text-muted whitespace-nowrap shrink-0 w-20">precio base</span>;
  }
  const dif = precio - base;
  return (
    <span className={`text-[10px] font-semibold whitespace-nowrap shrink-0 w-20 ${dif > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
      {dif > 0 ? '+' : '−'}{formatMoney(Math.abs(dif))}
    </span>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="p-1.5 text-text-muted hover:text-red-600 shrink-0" title="Quitar"><X size={14} /></button>;
}

// ============================================================================
// MODAL auto-mapeo (preview -> aplicar)  [sin cambios funcionales]
// ============================================================================
function AutoMapModal({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [umbral, setUmbral] = useState(88);
  const [soloSinMapear, setSoloSinMapear] = useState(true);

  const previewMut = useMutation({ mutationFn: () => cartaApi.autoMapear({ umbral, solo_sin_mapear: soloSinMapear, dry_run: true }) });
  const aplicarMut = useMutation({
    mutationFn: () => cartaApi.autoMapear({ umbral, solo_sin_mapear: soloSinMapear, dry_run: false }),
    onSuccess: (res) => {
      const n = (res?.data as CartaAutoMapResult)?.mapeados ?? 0;
      toast.success(`${n} item${n === 1 ? '' : 's'} mapeado${n === 1 ? '' : 's'}`);
      onApplied();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const preview = previewMut.data?.data as CartaAutoMapResult | undefined;
  const propuestas = preview?.propuestas || [];

  return (
    <Modal isOpen onClose={onClose} title="Auto-mapear carta ↔ productos" size="lg"
      footer={
        <div className="flex justify-between items-center w-full">
          <span className="text-xs text-text-muted">{preview ? `${propuestas.length} coincidencias` : 'Genera la vista previa primero'}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
            <Button onClick={() => aplicarMut.mutate()} loading={aplicarMut.isPending} disabled={!preview || propuestas.length === 0}>
              Aplicar {propuestas.length > 0 ? `${propuestas.length} mapeos` : ''}
            </Button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-900">
          Busca coincidencias por nombre tolerando <strong>tildes</strong>, <strong>typos</strong> y <strong>sufijos de tamaño</strong>.
          Solo mapea alta confianza. Revisá antes de aplicar; después podés cambiar cualquiera a mano.
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-[11px] text-text-muted mb-1">Confianza minima</label>
            <select value={umbral} onChange={(e) => setUmbral(Number(e.target.value))} className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
              <option value={92}>Muy alta (92)</option>
              <option value={88}>Alta (88) — recomendado</option>
              <option value={80}>Media (80)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm mt-5 cursor-pointer"><input type="checkbox" checked={soloSinMapear} onChange={(e) => setSoloSinMapear(e.target.checked)} className="rounded" /> Solo sin mapear</label>
          <button onClick={() => previewMut.mutate()} disabled={previewMut.isPending} className="mt-5 flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
            <Sparkles size={14} /> {previewMut.isPending ? 'Buscando...' : 'Generar vista previa'}
          </button>
        </div>
        {previewMut.isPending ? <LoadingSpinner /> : preview ? (
          propuestas.length === 0 ? <EmptyState message="Sin coincidencias con esa confianza." /> : (
            <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-[45vh] overflow-y-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead className="bg-gray-50 sticky top-0"><tr className="text-left text-text-muted">
                  <th className="px-3 py-2 font-semibold">Item de carta</th><th className="px-3 py-2 font-semibold">→ Producto</th>
                  <th className="px-3 py-2 font-semibold text-right">Costo</th><th className="px-3 py-2 font-semibold text-center">Conf.</th>
                </tr></thead>
                <tbody>
                  {propuestas.map((p) => (
                    <tr key={p.carta_id} className="border-t border-gray-100">
                      <td className="px-3 py-1.5"><div className="font-medium">{p.carta_nombre}</div><div className="text-[10px] text-text-muted">{p.carta_categoria}</div></td>
                      <td className="px-3 py-1.5 text-primary font-medium">{p.producto_nombre}</td>
                      <td className="px-3 py-1.5 text-right">{p.costo_total > 0 ? formatMoney(p.costo_total) : <span className="text-amber-600">s/costo</span>}</td>
                      <td className="px-3 py-1.5 text-center"><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${p.score >= 95 ? 'bg-green-100 text-green-700' : p.score >= 88 ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>{p.score}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </Modal>
  );
}

// ============================================================================
// MODAL de mapeo individual  [sin cambios]
// ============================================================================
// Costo y precio de combo de una promo (para mostrar en la lista)
function comboInfo(o: Oferta): { costo: number; precio: number } {
  const costo = (o.productos || []).reduce((s, p) => s + (Number(p.costo_total) || 0) * (Number(p.cantidad) || 1), 0);
  const precio = o.tipo === 'precio_especial'
    ? (Number(o.valor) || 0)
    : (o.productos || []).reduce((s, p) => s + (Number(p.precio_publico) || 0) * (Number(p.cantidad) || 1), 0);
  return { costo, precio };
}

function MapeoModal({ item, onClose, onMapped }: { item: CartaItem; onClose: () => void; onMapped: () => void }) {
  const [modo, setModo] = useState<'producto' | 'oferta'>(item.tipo_mapeo === 'oferta' ? 'oferta' : 'producto');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const { data: sugerenciasData, isLoading: loadingSug } = useQuery({
    queryKey: ['carta-sugerencias', item.id],
    queryFn: () => cartaApi.getSugerencias(item.id),
    enabled: modo === 'producto',
  });
  const sugerencias: CartaSugerencia[] = sugerenciasData?.data || [];

  const { data: productosData } = useQuery({
    queryKey: ['productos', { es_borrador: 0 }],
    queryFn: () => productosApi.getAll({ es_borrador: 0 }),
    enabled: modo === 'producto',
  });
  const productos: Producto[] = productosData?.data || [];

  const { data: ofertasData } = useQuery({
    queryKey: ['ofertas'],
    queryFn: () => ofertasApi.getAll(),
    enabled: modo === 'oferta',
  });
  const ofertas: Oferta[] = ofertasData?.data || [];

  const filtrados = useMemo(() => {
    if (debouncedSearch.length < 2) return [];
    const term = normalizarTexto(debouncedSearch);
    return productos.filter((p) => normalizarTexto(p.nombre).includes(term)).slice(0, 8);
  }, [productos, debouncedSearch]);

  const ofertasFiltradas = useMemo(() => {
    const term = normalizarTexto(debouncedSearch);
    const list = term.length >= 1 ? ofertas.filter((o) => normalizarTexto(o.nombre).includes(term)) : ofertas;
    return list.slice(0, 20);
  }, [ofertas, debouncedSearch]);

  const mapMut = useMutation({
    mutationFn: (producto_id: number | null) => cartaApi.mapear(item.id, producto_id),
    onSuccess: () => { toast.success('Mapeo actualizado'); onMapped(); },
    onError: (err: Error) => toast.error(err.message),
  });
  const mapOfertaMut = useMutation({
    mutationFn: (oferta_id: number | null) => cartaApi.mapearOferta(item.id, oferta_id),
    onSuccess: () => { toast.success('Mapeo actualizado'); onMapped(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const scoreLabel = (score: number) => {
    if (score >= 95) return { txt: 'Exacto', cls: 'bg-green-100 text-green-700' };
    if (score >= 85) return { txt: 'Muy probable', cls: 'bg-green-50 text-green-600' };
    if (score >= 65) return { txt: 'Probable', cls: 'bg-amber-50 text-amber-600' };
    return { txt: 'Posible', cls: 'bg-gray-100 text-text-muted' };
  };

  const quitar = () => { if (item.tipo_mapeo === 'oferta') mapOfertaMut.mutate(null); else mapMut.mutate(null); };
  const pend = mapMut.isPending || mapOfertaMut.isPending;

  return (
    <Modal isOpen onClose={onClose} title={`Mapear: ${item.nombre_efectivo}`} size="lg"
      footer={
        <div className="flex justify-between items-center w-full">
          {item.mapeado ? (
            <button onClick={quitar} disabled={pend} className="text-sm text-red-600 hover:underline flex items-center gap-1"><Link2Off size={14} /> Quitar mapeo</button>
          ) : <span />}
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      }>
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-3 text-sm flex items-center justify-between">
          <div>
            <div className="font-semibold">{item.nombre_efectivo}</div>
            <div className="text-xs text-text-muted">{item.categoria_efectiva} · Precio {formatMoney(item.precio_efectivo)}</div>
          </div>
          {item.tipo_mapeo === 'producto' && <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded-lg flex items-center gap-1"><Link2 size={12} /> {item.producto_nombre}</span>}
          {item.tipo_mapeo === 'oferta' && <span className="text-xs text-fuchsia-700 bg-fuchsia-50 px-2 py-1 rounded-lg flex items-center gap-1"><Tag size={12} /> {item.oferta_nombre}</span>}
        </div>

        {/* Tabs Producto / Promo */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['producto', 'oferta'] as const).map((m) => (
            <button key={m} onClick={() => { setModo(m); setSearch(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors ${modo === m ? 'bg-white shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}>
              {m === 'producto' ? <><Package size={14} /> Producto</> : <><Tag size={14} /> Promo</>}
            </button>
          ))}
        </div>

        {modo === 'producto' ? (
          <>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted mb-2"><Sparkles size={13} className="text-primary" /> Sugerencias automaticas</div>
              {loadingSug ? <div className="py-4"><LoadingSpinner /></div> : sugerencias.length === 0 ? (
                <p className="text-xs text-text-muted italic py-2">Sin coincidencias. Busca manualmente abajo.</p>
              ) : (
                <div className="space-y-1.5">
                  {sugerencias.map((s) => {
                    const lbl = scoreLabel(s.score);
                    const yaMapeado = item.tipo_mapeo === 'producto' && item.producto_id === s.id;
                    return (
                      <button key={s.id} onClick={() => !yaMapeado && mapMut.mutate(s.id)} disabled={pend || yaMapeado}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${yaMapeado ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-primary hover:bg-primary/5'} disabled:cursor-default`}>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{s.nombre}</div>
                          <div className="text-[11px] text-text-muted">{s.categoria_nombre || 'Sin categoria'} · Costo {formatMoney(s.costo_total)}{s.costo_total <= 0 && <span className="text-amber-600"> (sin costo)</span>}</div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${lbl.cls}`}>{yaMapeado ? 'Mapeado' : `${lbl.txt} ${s.score}`}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-text-muted mb-2">O busca cualquier producto</div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto por nombre..." autoFocus className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              {filtrados.length > 0 && (
                <div className="mt-1.5 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {filtrados.map((p) => {
                    const yaMapeado = item.tipo_mapeo === 'producto' && item.producto_id === p.id;
                    return (
                      <button key={p.id} onClick={() => !yaMapeado && mapMut.mutate(p.id)} disabled={pend || yaMapeado}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 ${yaMapeado ? 'bg-green-50' : ''}`}>
                        <span className="text-sm truncate">{p.nombre}</span>
                        <span className="text-[11px] text-text-muted shrink-0">{yaMapeado ? '✓ mapeado' : `Costo ${formatMoney(Number(p.costo_total) || 0)}`}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div>
            <div className="text-xs font-semibold text-text-muted mb-2 flex items-center gap-1.5">
              <Tag size={13} className="text-fuchsia-500" /> Buscar promo para mapear (combos / ofertas)
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar promo por nombre..." autoFocus className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="mt-1.5 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {ofertasFiltradas.length === 0 ? (
                <p className="text-xs text-text-muted italic p-3">No hay promos que coincidan.</p>
              ) : ofertasFiltradas.map((o) => {
                const { costo, precio } = comboInfo(o);
                const yaMapeado = item.tipo_mapeo === 'oferta' && item.oferta_id === o.id;
                return (
                  <button key={o.id} onClick={() => !yaMapeado && mapOfertaMut.mutate(o.id)} disabled={pend || yaMapeado}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-fuchsia-50/50 ${yaMapeado ? 'bg-fuchsia-50' : ''}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{o.nombre}</div>
                      <div className="text-[11px] text-text-muted">
                        {o.productos?.length || 0} prod. · Precio {formatMoney(precio)} · Costo {formatMoney(costo)}
                      </div>
                    </div>
                    <span className="text-[11px] text-text-muted shrink-0">{yaMapeado ? '✓ mapeado' : 'Mapear'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function StatCard({ label, value, icon, sub }: { label: string; value: string; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
      <div className="p-2 bg-gray-50 rounded-lg shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-text-primary leading-tight">{value}</div>
        <div className="text-[11px] text-text-muted truncate">{label}</div>
        {sub && <div className="text-[10px] text-text-muted/80 truncate">{sub}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// BANNER INFORMATIVO: como funciona la Carta (colapsable, recuerda el estado)
// ============================================================================
const CARTA_INFO_KEY = 'carta_info_abierto';

const CARTA_INFO_PUNTOS: { icon: React.ReactNode; titulo: string; texto: string }[] = [
  { icon: <Package size={15} className="text-primary" />, titulo: 'Es tu menú digital',
    texto: 'Cada fila es un item que ve el cliente en la carta online. Lo que edites acá se publica solo (via la API pública).' },
  { icon: <Link2 size={15} className="text-primary" />, titulo: 'Mapealo a un Producto o Promo',
    texto: 'Vincula el item a un producto (hereda su costo y precio) o a una promo/box. Sin mapear = reventa (sin costo, cafés/bebidas).' },
  { icon: <Pencil size={15} className="text-primary" />, titulo: 'Precio editable y sincronizado',
    texto: 'Clic en el precio para editarlo. Si está mapeado a un producto, el cambio se guarda TAMBIÉN en Productos (una sola fuente).' },
  { icon: <Star size={15} className="text-amber-500" />, titulo: 'Variantes por item',
    texto: 'Tamaños, sabores (marcables como "nuevo"), toppings (extra) y adiciones (productos de la categoría "Adiciones", precio en vivo).' },
  { icon: <Sparkles size={15} className="text-fuchsia-500" />, titulo: '"Ver lo nuevo"',
    texto: 'La fecha de lanzamiento hace que el item aparezca como nuevo en el menú durante los días configurados. También por sabor nuevo.' },
  { icon: <Pause size={15} className="text-text-muted" />, titulo: 'Pausar / destacar / eliminar',
    texto: 'Pausar oculta el item del menú sin borrarlo. Destacar lo resalta. Los botones rápidos de cada fila no afectan precios ni variantes.' },
];

function CartaInfoBanner() {
  const [abierto, setAbierto] = useState<boolean>(() => {
    try { return localStorage.getItem(CARTA_INFO_KEY) !== 'cerrado'; } catch { return true; }
  });
  const toggle = () => {
    const next = !abierto;
    setAbierto(next);
    try { localStorage.setItem(CARTA_INFO_KEY, next ? 'abierto' : 'cerrado'); } catch { /* ignore */ }
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-white to-white overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-primary/5 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Info size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text-primary">Cómo funciona la Carta</div>
          <div className="text-[11px] text-text-muted">{abierto ? 'Guía rápida de qué podés editar acá' : 'Tocá para ver la guía rápida'}</div>
        </div>
        <span className="text-text-muted shrink-0">{abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
      </button>

      {abierto && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {CARTA_INFO_PUNTOS.map((p, i) => (
              <div key={i} className="flex gap-2.5 bg-white rounded-xl border border-gray-100 p-3">
                <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">{p.icon}</div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text-primary mb-0.5">{p.titulo}</div>
                  <div className="text-[11px] text-text-muted leading-snug">{p.texto}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
