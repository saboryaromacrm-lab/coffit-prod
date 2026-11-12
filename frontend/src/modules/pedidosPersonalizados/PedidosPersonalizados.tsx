import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Loader2, Layers, Puzzle, Package } from 'lucide-react';
import clsx from 'clsx';
import Button from '../../components/common/Button';
import SearchInput from '../../components/common/SearchInput';
import EmptyState from '../../components/common/EmptyState';
import Segmentado from '../../components/common/Segmentado';
import { formatMoney } from '../../utils/formatters';
import { normalizarTexto } from '../../utils/normalizers';
import EditorProducto from './EditorProducto';
import Recetas from './Recetas';
import Grupos from './Grupos';
import Pedidos from './Pedidos';
import Integracion from './Integracion';
import { ppApi } from './api';
import type { ProductoResumen } from './types';

// ============================================================================
// PEDIDOS PERSONALIZADOS — modulo aparte.
// Productos que se arman por pasos (harina, relleno, version, tamano...), con
// precio y costo de cada combinacion, y la API que consume el POS.
// La pestana y el producto abierto viven en la URL (?tab=...&producto=...).
// ============================================================================

const TABS = [
  { id: 'productos', label: 'Productos' },
  { id: 'recetas', label: 'Recetas' },
  { id: 'grupos', label: 'Grupos' },
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'api', label: 'API / POS' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function PedidosPersonalizados() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'productos') as Tab;
  const productoParam = params.get('producto'); // id o "nuevo"

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v == null) p.delete(k); else p.set(k, v);
    }
    setParams(p);
  };

  const { data } = useQuery({ queryKey: ['pp-productos'], queryFn: ppApi.getProductos });
  const productos = useMemo(() => data?.data || [], [data]);
  const categorias = useMemo(
    () => [...new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c))].sort(),
    [productos]
  );

  if (tab === 'productos' && productoParam) {
    return (
      <EditorProducto
        productoId={productoParam === 'nuevo' ? null : Number(productoParam)}
        categorias={categorias}
        onVolver={() => ir({ producto: null })}
        onCreado={(id) => ir({ producto: String(id) })}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto overflow-y-hidden">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => ir({ tab: t.id === 'productos' ? null : t.id, producto: null })}
            className={clsx('flex-1 sm:flex-none px-1.5 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-primary')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'productos' && <ListaProductos onAbrir={(id) => ir({ producto: id })} />}
      {tab === 'recetas' && (
        <Recetas onIrProducto={(id) => ir({ tab: null, producto: String(id) })} onIrGrupos={() => ir({ tab: 'grupos' })} />
      )}
      {tab === 'grupos' && <Grupos />}
      {tab === 'pedidos' && <Pedidos />}
      {tab === 'api' && <Integracion />}
    </div>
  );
}

// Filtro por costeo (ver estadoCosteo en el motor del backend).
const FILTROS_COSTEO = [
  { id: 'todos', label: 'Todos' },
  { id: 'completo', label: 'Costeados' },
  { id: 'parcial', label: 'Parciales' },
  { id: 'sin', label: 'Sin costear' },
] as const;
type FiltroCosteo = (typeof FILTROS_COSTEO)[number]['id'];
const pasaCosteo = (f: FiltroCosteo, p: ProductoResumen) => f === 'todos' || p.costeo === f;

// Filtro por publicacion: solo lo publicado lo ve el POS.
const FILTROS_PUBLICADO = [
  { id: 'todos', label: 'Todos' },
  { id: 'si', label: 'Publicados' },
  { id: 'no', label: 'No publicados' },
] as const;
type FiltroPublicado = (typeof FILTROS_PUBLICADO)[number]['id'];
const pasaPublicado = (f: FiltroPublicado, p: ProductoResumen) => f === 'todos' || (f === 'si') === p.activo;

function ListaProductos({ onAbrir }: { onAbrir: (id: string) => void }) {
  const qc = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [costeo, setCosteo] = useState<FiltroCosteo>('todos');
  const [publicado, setPublicado] = useState<FiltroPublicado>('todos');
  const { data, isLoading } = useQuery({ queryKey: ['pp-productos'], queryFn: ppApi.getProductos });

  const publicar = useMutation({
    mutationFn: ({ id, valor }: { id: number; valor: boolean }) => ppApi.publicarProducto(id, valor),
    onSuccess: (_, { valor }) => {
      qc.invalidateQueries({ queryKey: ['pp-productos'] });
      qc.invalidateQueries({ queryKey: ['pp-estado'] });
      qc.invalidateQueries({ queryKey: ['productos'] }); // el check de la ficha de los vendidos por kg
      toast.success(valor ? 'Publicado: ya lo ve el POS' : 'Despublicado');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Cuántos hay en cada opción de un filtro, con la búsqueda y el OTRO filtro
  // aplicados: así el número coincide con lo que se ve al elegirla.
  const conteo = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    const lista = (data?.data || []).filter((p) => !q || normalizarTexto(p.nombre).includes(q));
    const contar = <T extends string>(opciones: readonly { id: T }[], pasa: (id: T, p: ProductoResumen) => boolean, otro: (p: ProductoResumen) => boolean) =>
      Object.fromEntries(opciones.map((f) => [f.id, lista.filter((p) => otro(p) && pasa(f.id, p)).length])) as Record<T, number>;
    return {
      costeo: contar(FILTROS_COSTEO, pasaCosteo, (p) => pasaPublicado(publicado, p)),
      publicado: contar(FILTROS_PUBLICADO, pasaPublicado, (p) => pasaCosteo(costeo, p)),
    };
  }, [data, buscar, costeo, publicado]);

  // Agrupados por categoria, con la busqueda y los filtros aplicados.
  const porCategoria = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    const grupos = new Map<string, NonNullable<typeof data>['data']>();
    for (const p of data?.data || []) {
      if (q && !normalizarTexto(p.nombre).includes(q)) continue;
      if (!pasaCosteo(costeo, p) || !pasaPublicado(publicado, p)) continue;
      const cat = p.categoria || 'Sin categoría';
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat)!.push(p);
    }
    return [...grupos.entries()];
  }, [data, buscar, costeo, publicado]);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  const tarjeta = (p: ProductoResumen) => (
    <TarjetaProducto key={p.id} p={p} onAbrir={onAbrir}
      onPublicar={(valor) => publicar.mutate({ id: p.id, valor })}
      publicando={publicar.isPending && publicar.variables?.id === p.id} />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] max-w-sm"><SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar producto..." /></div>
        <Segmentado etiqueta="Filtrar por publicación" opciones={FILTROS_PUBLICADO} valor={publicado} onCambiar={setPublicado}
          conteo={conteo.publicado} />
        <Segmentado etiqueta="Filtrar por costeo" opciones={FILTROS_COSTEO} valor={costeo} onCambiar={setCosteo}
          conteo={conteo.costeo} alerta={{ sin: 'text-red-600', parcial: 'text-amber-700' }} />
        <Button size="sm" className="ml-auto" onClick={() => onAbrir('nuevo')}><Plus size={14} /> Producto</Button>
      </div>

      {porCategoria.length === 0 ? (
        <EmptyState icon={<Layers size={48} className="mb-3 opacity-40" />}
          message={buscar || costeo !== 'todos' || publicado !== 'todos' ? 'Nada coincide con la búsqueda o el filtro.' : 'Sin productos todavía. Creá uno o importá el catálogo desde la pestaña API / POS.'} />
      ) : porCategoria.map(([cat, lista]) => {
        // Dentro de cada categoria: primero los que se arman, despues los unicos.
        const armables = lista.filter((p) => p.pasos > 0);
        const unicos = lista.filter((p) => p.pasos === 0);
        return (
          <section key={cat} className="space-y-2">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">{cat}</h3>
            {armables.length > 0 && (
              <Bloque titulo="Para armar" icono={<Puzzle size={13} />} clase="text-primary">
                {armables.map(tarjeta)}
              </Bloque>
            )}
            {unicos.length > 0 && (
              <Bloque titulo="Productos únicos" icono={<Package size={13} />} clase="text-slate-600">
                {unicos.map(tarjeta)}
              </Bloque>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Bloque({ titulo, icono, clase, children }: { titulo: string; icono: React.ReactNode; clase: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={clsx('flex items-center gap-1 text-xs font-medium mb-1.5', clase)}>{icono} {titulo}</div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </div>
  );
}

// Los que se arman llevan borde y etiqueta naranja; los unicos, gris. El check
// de la derecha publica o despublica sin abrir el producto.
function TarjetaProducto({ p, onAbrir, onPublicar, publicando }: {
  p: ProductoResumen;
  onAbrir: (id: string) => void;
  onPublicar: (valor: boolean) => void;
  publicando: boolean;
}) {
  const armable = p.pasos > 0;
  return (
    <div className={clsx('flex items-center bg-white border border-gray-200 border-l-4 rounded-xl hover:border-primary transition-colors',
      armable ? 'border-l-orange-400' : 'border-l-slate-300')}>
      <button type="button" onClick={() => onAbrir(String(p.id))}
        className={clsx('flex-1 min-w-0 flex items-center gap-3 text-left p-3', !p.activo && 'opacity-60')}>
        {/* El emoji queda debajo: si la foto no carga, se oculta y se ve el emoji */}
        <div className="relative w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0 text-2xl">
          {p.emoji || '🍰'}
          {p.imagen && (
            <img src={p.imagen} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{p.nombre}</div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-muted mt-0.5">
            <span className={clsx('px-1.5 py-px rounded font-medium', armable ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600')}>
              {armable ? `Para armar · ${p.pasos} paso${p.pasos === 1 ? '' : 's'}` : 'Único'}
            </span>
            {p.precio_desde != null && (
              <span>{armable && 'desde '}<span className="font-medium text-text-primary">{formatMoney(p.precio_desde)}</span></span>
            )}
            {p.cc_producto_id != null && (
              <span className="px-1.5 py-px rounded font-medium bg-emerald-50 text-emerald-700" title="Se vende por kg: se edita desde la ficha en Productos">Por kg</span>
            )}
            {p.con_anticipacion && <span className="px-1.5 py-px rounded font-medium bg-indigo-100 text-indigo-700">Con anticipación</span>}
            {p.costeo === 'sin' && <span className="px-1.5 py-px rounded font-medium bg-red-50 text-red-700" title="Sin recetas cargadas: el costo da $0">Sin costear</span>}
            {p.costeo === 'parcial' && (
              <span className="px-1.5 py-px rounded font-medium bg-amber-50 text-amber-800" title="Combinaciones obligatorias con costo cargado">
                Costeo parcial · {p.combinaciones_costeadas}/{p.combinaciones}
              </span>
            )}
          </div>
        </div>
      </button>
      <label className={clsx('flex flex-col items-center gap-0.5 self-stretch justify-center px-3 border-l border-gray-100 text-[10px] font-medium cursor-pointer select-none',
        p.activo ? 'text-emerald-700' : 'text-text-muted')} title="Solo lo publicado lo ve el POS">
        <input type="checkbox" checked={p.activo} disabled={publicando} onChange={(e) => onPublicar(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
        Publicado
      </label>
    </div>
  );
}
