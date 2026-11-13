import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader2, AlertTriangle, SlidersHorizontal, ChevronDown, ChevronRight, X } from 'lucide-react';
import SearchInput from '../../components/common/SearchInput';
import EmptyState from '../../components/common/EmptyState';
import { normalizarTexto } from '../../utils/normalizers';
import { nutricionApi } from './api';
import type { EstadoProducto, FuenteNutri, ProductoNutriResumen } from './types';
import { ESTADOS_PRODUCTO, fmtGramos } from './utils';
import ProductoNutriModal from './ProductoNutriModal';

type Filtro = 'todos' | EstadoProducto;
const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Estado: todos' },
  ...(Object.keys(ESTADOS_PRODUCTO) as EstadoProducto[]).map((id) => ({ id, label: ESTADOS_PRODUCTO[id].label })),
];

// "Con info" = todos sus ingredientes tienen datos (controlado o no)
const INFO = [
  { id: 'todos', label: 'Info: todos' },
  { id: 'con', label: 'Con info' },
  { id: 'sin', label: 'Sin info' },
] as const;
type Info = (typeof INFO)[number]['id'];
const tieneInfo = (p: ProductoNutriResumen) => p.estado !== 'sin_datos' && p.estado !== 'incompleto';
const pasaInfo = (p: ProductoNutriResumen, info: Info) => info === 'todos' || tieneInfo(p) === (info === 'con');

const SIN_CATEGORIA = 'Sin categoría';
const SIN_SUB = '__sin__';
const categoriaDe = (p: ProductoNutriResumen) => p.categoria || SIN_CATEGORIA;

// Nombre -> cantidad, ordenado por nombre
function contar(valores: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of valores) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const SELECT = 'w-full sm:w-auto min-w-0 px-2.5 py-2 text-sm border border-gray-300 rounded-lg bg-white';

export default function ProductosNutri({ fuente }: { fuente: FuenteNutri }) {
  const [buscar, setBuscar] = useState('');
  const [categoria, setCategoria] = useState('');
  const [subcategoria, setSubcategoria] = useState('');
  const [info, setInfo] = useState<Info>('todos');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [verFiltros, setVerFiltros] = useState(false);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const alternar = (cat: string) => setAbiertas((prev) => {
    const sig = new Set(prev);
    if (!sig.delete(cat)) sig.add(cat);
    return sig;
  });
  const { data, isLoading } = useQuery({
    queryKey: ['nutri-productos', fuente],
    queryFn: () => nutricionApi.getProductos(fuente),
    staleTime: 0,
  });
  const productos = useMemo(() => data?.data || [], [data]);

  const categorias = useMemo(() => contar(productos.map(categoriaDe)), [productos]);
  // Subcategorias de la categoria elegida (los nombres pueden repetirse entre categorias)
  const subcategorias = useMemo(() => (categoria
    ? contar(productos.filter((p) => categoriaDe(p) === categoria).map((p) => p.subcategoria || SIN_SUB))
    : []), [productos, categoria]);

  // Busqueda + categoria: sobre esto se cuentan los dos filtros de botones
  const base = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    return productos.filter((p) => (!q || normalizarTexto(p.nombre).includes(q))
      && (!categoria || categoriaDe(p) === categoria)
      && (!subcategoria || (p.subcategoria || SIN_SUB) === subcategoria));
  }, [productos, buscar, categoria, subcategoria]);
  const conteoInfo = useMemo(
    () => Object.fromEntries(INFO.map((f) => [f.id, base.filter((p) => pasaInfo(p, f.id)).length])) as Record<Info, number>,
    [base]
  );
  const conInfo = useMemo(() => base.filter((p) => pasaInfo(p, info)), [base, info]);
  const conteo = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.id, conInfo.filter((p) => f.id === 'todos' || p.estado === f.id).length])) as Record<Filtro, number>,
    [conInfo]
  );
  const porCategoria = useMemo(() => {
    const grupos = new Map<string, ProductoNutriResumen[]>();
    for (const p of conInfo) {
      if (filtro !== 'todos' && p.estado !== filtro) continue;
      const grupo = p.subcategoria ? `${categoriaDe(p)} › ${p.subcategoria}` : categoriaDe(p);
      if (!grupos.has(grupo)) grupos.set(grupo, []);
      grupos.get(grupo)!.push(p);
    }
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [conInfo, filtro]);
  const activos = [categoria, subcategoria, info !== 'todos', filtro !== 'todos'].filter(Boolean).length;
  const filtrando = !!buscar || activos > 0;
  const haySub = subcategorias.some(([s]) => s !== SIN_SUB);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  const total = porCategoria.reduce((n, [, lista]) => n + lista.length, 0);
  const limpiar = () => { setCategoria(''); setSubcategoria(''); setInfo('todos'); setFiltro('todos'); };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 min-w-0 sm:max-w-sm"><SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar producto..." /></div>
          {/* En el celular los filtros van plegados detras de este boton */}
          <button type="button" onClick={() => setVerFiltros((v) => !v)} aria-expanded={verFiltros}
            className={clsx('sm:hidden shrink-0 inline-flex items-center gap-1.5 px-3 text-sm font-medium border rounded-lg',
              activos ? 'border-primary text-primary bg-primary/5' : 'border-gray-300 text-text-primary bg-white')}>
            <SlidersHorizontal size={15} /> Filtros
            {activos > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-primary text-white text-[11px] leading-5 text-center">{activos}</span>}
            <ChevronDown size={14} className={clsx('transition-transform', verFiltros && 'rotate-180')} />
          </button>
        </div>
        <div className={clsx('gap-2 sm:flex sm:flex-wrap sm:items-center', verFiltros ? 'grid grid-cols-2' : 'hidden')}>
          <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setSubcategoria(''); }}
            className={clsx(SELECT, !haySub && 'col-span-2')} aria-label="Categoría">
            <option value="">Categoría: todas</option>
            {categorias.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          </select>
          {haySub && (
            <select value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} className={SELECT} aria-label="Subcategoría">
              <option value="">Subcategoría: todas</option>
              {subcategorias.map(([s, n]) => <option key={s} value={s}>{s === SIN_SUB ? '— Sin subcategoría —' : s} ({n})</option>)}
            </select>
          )}
          <select value={info} onChange={(e) => setInfo(e.target.value as Info)} className={SELECT} aria-label="Info cargada">
            {INFO.map((f) => <option key={f.id} value={f.id}>{f.label} ({conteoInfo[f.id]})</option>)}
          </select>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className={SELECT} aria-label="Estado">
            {FILTROS.map((f) => <option key={f.id} value={f.id}>{f.label} ({conteo[f.id]})</option>)}
          </select>
          {activos > 0 && (
            <button type="button" onClick={limpiar}
              className="col-span-2 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm text-text-muted hover:text-primary border border-gray-300 rounded-lg bg-white">
              <X size={14} /> Limpiar filtros
            </button>
          )}
        </div>
        <p className="text-xs text-text-muted">
          <strong className="text-text-primary">{total}</strong> {total === 1 ? 'producto' : 'productos'} ·{' '}
          {fuente === 'carta'
            ? <>solo los que están en la carta; se muestra lo <strong>controlado</strong>.</>
            : <>solo los publicados, con su receta base; en el catálogo sale lo <strong>controlado</strong>.</>}
        </p>
      </div>

      {porCategoria.length === 0 ? (
        <EmptyState message={filtrando ? 'Nada coincide con la búsqueda o los filtros.' : fuente === 'carta' ? 'No hay productos en la carta.' : 'No hay pedidos personalizados publicados.'} />
      ) : <div className="space-y-2">{porCategoria.map(([cat, lista]) => {
        // Plegadas por defecto; al buscar se abren todas para ver los resultados
        const abierta = !!buscar.trim() || abiertas.has(cat);
        return (
          <section key={cat} className="space-y-2">
            <button type="button" onClick={() => alternar(cat)} aria-expanded={abierta}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-left hover:border-primary transition-colors cursor-pointer">
              <ChevronRight size={16} className={clsx('shrink-0 text-text-muted transition-transform', abierta && 'rotate-90')} />
              <span className="flex-1 min-w-0 text-xs font-semibold uppercase tracking-wide truncate">{cat}</span>
              <span className="shrink-0 text-xs text-text-muted tabular-nums">{lista.length}</span>
            </button>
            {abierta && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {lista.map((p) => (
                  <button key={p.id} type="button" onClick={() => setAbierto(p.id)}
                    className="text-left bg-white border border-gray-200 rounded-xl p-3 hover:border-primary transition-colors cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm">{p.nombre}</span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${ESTADOS_PRODUCTO[p.estado].clase}`}>
                        {ESTADOS_PRODUCTO[p.estado].label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-text-muted flex flex-wrap gap-x-2">
                      {p.energia_kcal != null && (
                        <span><strong className="text-text-primary">{p.energia_kcal}</strong> kcal {fuente === 'carta' ? 'por porción' : 'el producto entero'}{p.porcion_g ? ` (${fmtGramos(p.porcion_g)})` : ''}</span>
                      )}
                      {p.faltantes > 0 && <span className="text-amber-700">{p.faltantes} sin datos</span>}
                      {p.alertas > 0 && <span className="text-red-600 inline-flex items-center gap-0.5"><AlertTriangle size={11} /> {p.alertas} cantidad dudosa</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}</div>}

      {abierto != null && <ProductoNutriModal fuente={fuente} productoId={abierto} onClose={() => setAbierto(null)} />}
    </div>
  );
}
