import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';
import SearchInput from '../../components/common/SearchInput';
import Segmentado from '../../components/common/Segmentado';
import EmptyState from '../../components/common/EmptyState';
import { normalizarTexto } from '../../utils/normalizers';
import { nutricionApi } from './api';
import type { EstadoProducto, ProductoNutriResumen } from './types';
import { ESTADOS_PRODUCTO, fmtGramos } from './utils';
import ProductoNutriModal from './ProductoNutriModal';

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  ...(Object.keys(ESTADOS_PRODUCTO) as EstadoProducto[]).map((id) => ({ id, label: ESTADOS_PRODUCTO[id].label })),
] as const;
type Filtro = 'todos' | EstadoProducto;

export default function ProductosNutri() {
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState<number | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['nutri-productos'], queryFn: nutricionApi.getProductos, staleTime: 0 });

  const visibles = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    return (data?.data || []).filter((p) => !q || normalizarTexto(p.nombre).includes(q));
  }, [data, buscar]);
  const conteo = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.id, visibles.filter((p) => f.id === 'todos' || p.estado === f.id).length])) as Record<Filtro, number>,
    [visibles]
  );
  const porCategoria = useMemo(() => {
    const grupos = new Map<string, ProductoNutriResumen[]>();
    for (const p of visibles) {
      if (filtro !== 'todos' && p.estado !== filtro) continue;
      const cat = p.categoria || 'Sin categoría';
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat)!.push(p);
    }
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibles, filtro]);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] max-w-sm"><SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar producto..." /></div>
        <Segmentado etiqueta="Filtrar por estado" opciones={FILTROS} valor={filtro} onCambiar={setFiltro} conteo={conteo}
          alerta={{ vencido: 'text-red-600', pendiente: 'text-sky-700' }} />
      </div>
      <p className="text-xs text-text-muted -mt-2">
        Se calcula con la receta y la información de cada ingrediente. En la carta solo se muestra lo <strong>controlado</strong>.
      </p>

      {porCategoria.length === 0 ? (
        <EmptyState message={buscar || filtro !== 'todos' ? 'Nada coincide con la búsqueda o el filtro.' : 'No hay productos.'} />
      ) : porCategoria.map(([cat, lista]) => (
        <section key={cat} className="space-y-2">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">{cat}</h3>
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
                    <span><strong className="text-text-primary">{p.energia_kcal}</strong> kcal por porción{p.porcion_g ? ` (${fmtGramos(p.porcion_g)})` : ''}</span>
                  )}
                  {p.faltantes > 0 && <span className="text-amber-700">{p.faltantes} sin datos</span>}
                  {p.alertas > 0 && <span className="text-red-600 inline-flex items-center gap-0.5"><AlertTriangle size={11} /> {p.alertas} cantidad dudosa</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      {abierto != null && <ProductoNutriModal productoId={abierto} onClose={() => setAbierto(null)} />}
    </div>
  );
}
