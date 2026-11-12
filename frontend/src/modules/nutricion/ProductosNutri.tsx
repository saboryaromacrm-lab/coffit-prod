import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';
import SearchInput from '../../components/common/SearchInput';
import Segmentado from '../../components/common/Segmentado';
import EmptyState from '../../components/common/EmptyState';
import { normalizarTexto } from '../../utils/normalizers';
import { nutricionApi } from './api';
import type { EstadoProducto, FuenteNutri, ProductoNutriResumen } from './types';
import { ESTADOS_PRODUCTO, estadoDe, fmtGramos } from './utils';
import ProductoNutriModal from './ProductoNutriModal';

type Filtro = 'todos' | EstadoProducto;
// Pedidos personalizados no se controlan: sin "Controlado" ni "Cambió"
const filtrosDe = (fuente: FuenteNutri): { id: Filtro; label: string }[] => [
  { id: 'todos', label: 'Todos' },
  ...(Object.keys(ESTADOS_PRODUCTO) as EstadoProducto[])
    .filter((id) => fuente === 'carta' || (id !== 'controlado' && id !== 'vencido'))
    .map((id) => ({ id, label: estadoDe(id, fuente).label })),
];

// "Con info" = todos sus ingredientes tienen datos (controlado o no)
const INFO = [
  { id: 'todos', label: 'Todos' },
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

const SELECT = 'px-2.5 py-2 text-sm border border-gray-300 rounded-lg bg-white';

export default function ProductosNutri({ fuente }: { fuente: FuenteNutri }) {
  const [buscar, setBuscar] = useState('');
  const [categoria, setCategoria] = useState('');
  const [subcategoria, setSubcategoria] = useState('');
  const [info, setInfo] = useState<Info>('todos');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['nutri-productos', fuente],
    queryFn: () => nutricionApi.getProductos(fuente),
    staleTime: 0,
  });
  const filtros = useMemo(() => filtrosDe(fuente), [fuente]);
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
    () => Object.fromEntries(filtros.map((f) => [f.id, conInfo.filter((p) => f.id === 'todos' || p.estado === f.id).length])) as Record<Filtro, number>,
    [filtros, conInfo]
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
  const filtrando = buscar || categoria || info !== 'todos' || filtro !== 'todos';

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] max-w-sm"><SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar producto..." /></div>
        <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setSubcategoria(''); }} className={SELECT} aria-label="Categoría">
          <option value="">Categoría: todas</option>
          {categorias.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        {subcategorias.some(([s]) => s !== SIN_SUB) && (
          <select value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} className={SELECT} aria-label="Subcategoría">
            <option value="">Subcategoría: todas</option>
            {subcategorias.map(([s, n]) => <option key={s} value={s}>{s === SIN_SUB ? '— Sin subcategoría —' : s} ({n})</option>)}
          </select>
        )}
        <Segmentado etiqueta="Filtrar por info cargada" opciones={INFO} valor={info} onCambiar={setInfo} conteo={conteoInfo} />
      </div>
      <Segmentado etiqueta="Filtrar por estado" opciones={filtros} valor={filtro} onCambiar={setFiltro} conteo={conteo}
        alerta={{ vencido: 'text-red-600', pendiente: 'text-sky-700' }} />
      <p className="text-xs text-text-muted -mt-2">
        {fuente === 'carta'
          ? <>Solo los productos que están en la carta. Se calcula con la receta y la información de cada ingrediente;
              en la carta se muestra lo <strong>controlado</strong>.</>
          : <>Solo los productos publicados en Pedidos personalizados, calculados con su receta base
              y la información de cada ingrediente.</>}
      </p>

      {porCategoria.length === 0 ? (
        <EmptyState message={filtrando ? 'Nada coincide con la búsqueda o los filtros.' : fuente === 'carta' ? 'No hay productos en la carta.' : 'No hay pedidos personalizados publicados.'} />
      ) : porCategoria.map(([cat, lista]) => (
        <section key={cat} className="space-y-2">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">{cat}</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {lista.map((p) => (
              <button key={p.id} type="button" onClick={() => setAbierto(p.id)}
                className="text-left bg-white border border-gray-200 rounded-xl p-3 hover:border-primary transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm">{p.nombre}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${estadoDe(p.estado, fuente).clase}`}>
                    {estadoDe(p.estado, fuente).label}
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
        </section>
      ))}

      {abierto != null && <ProductoNutriModal fuente={fuente} productoId={abierto} onClose={() => setAbierto(null)} />}
    </div>
  );
}
