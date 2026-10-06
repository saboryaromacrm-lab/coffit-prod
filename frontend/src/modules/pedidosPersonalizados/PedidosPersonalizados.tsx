import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Loader2, Layers } from 'lucide-react';
import clsx from 'clsx';
import Button from '../../components/common/Button';
import SearchInput from '../../components/common/SearchInput';
import EmptyState from '../../components/common/EmptyState';
import { formatMoney } from '../../utils/formatters';
import { normalizarTexto } from '../../utils/normalizers';
import EditorProducto from './EditorProducto';
import Grupos from './Grupos';
import Pedidos from './Pedidos';
import Integracion from './Integracion';
import { ppApi } from './api';

// ============================================================================
// PEDIDOS PERSONALIZADOS — modulo aparte.
// Productos que se arman por pasos (harina, relleno, version, tamano...), con
// precio y costo de cada combinacion, y la API que consume el POS.
// La pestana y el producto abierto viven en la URL (?tab=...&producto=...).
// ============================================================================

const TABS = [
  { id: 'productos', label: 'Productos' },
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
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => ir({ tab: t.id === 'productos' ? null : t.id, producto: null })}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-primary')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'productos' && <ListaProductos onAbrir={(id) => ir({ producto: id })} />}
      {tab === 'grupos' && <Grupos />}
      {tab === 'pedidos' && <Pedidos />}
      {tab === 'api' && <Integracion />}
    </div>
  );
}

function ListaProductos({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [buscar, setBuscar] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['pp-productos'], queryFn: ppApi.getProductos });

  // Agrupados por categoria, con el filtro de busqueda aplicado.
  const porCategoria = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    const grupos = new Map<string, NonNullable<typeof data>['data']>();
    for (const p of data?.data || []) {
      if (q && !normalizarTexto(p.nombre).includes(q)) continue;
      const cat = p.categoria || 'Sin categoría';
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat)!.push(p);
    }
    return [...grupos.entries()];
  }, [data, buscar]);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] max-w-sm"><SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar producto..." /></div>
        <Button size="sm" className="ml-auto" onClick={() => onAbrir('nuevo')}><Plus size={14} /> Producto</Button>
      </div>

      {porCategoria.length === 0 ? (
        <EmptyState icon={<Layers size={48} className="mb-3 opacity-40" />}
          message={buscar ? 'Nada coincide con la búsqueda.' : 'Sin productos todavía. Creá uno o importá el catálogo desde la pestaña API / POS.'} />
      ) : porCategoria.map(([cat, lista]) => (
        <section key={cat}>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">{cat}</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {lista.map((p) => (
              <button key={p.id} type="button" onClick={() => onAbrir(String(p.id))}
                className={clsx('flex items-center gap-3 text-left bg-white border border-gray-200 rounded-xl p-3 hover:border-primary transition-colors',
                  !p.activo && 'opacity-60')}>
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
                  <div className="text-xs text-text-muted">
                    {p.pasos > 0 ? `${p.pasos} paso${p.pasos === 1 ? '' : 's'}` : 'Simple'}
                    {p.precio_desde != null && <> · desde <span className="font-medium text-text-primary">{formatMoney(p.precio_desde)}</span></>}
                    {!p.activo && <span className="ml-1 text-red-600">· inactivo</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
