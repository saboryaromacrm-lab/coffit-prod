import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productosApi } from '../api/productos';
import { categoriasApi } from '../api/categorias';
import { opcionesJerarquia } from '../utils/categoriasTree';
import { formatMoney } from '../utils/formatters';
import MCBadge from '../components/common/MCBadge';
import SearchInput from '../components/common/SearchInput';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import { useDebounce } from '../hooks/useDebounce';

function calcMarkup(precio: number, costo: number): number {
  if (costo <= 0) return 0;
  return ((precio - costo) / costo) * 100;
}

function getMarkupColor(mk: number): string {
  if (mk < 50) return 'text-red-600';
  if (mk < 100) return 'text-amber-600';
  return 'text-green-600';
}

export default function Rentabilidades() {
  const [categoriaId, setCategoriaId] = useState('');
  const [buscar, setBuscar] = useState('');
  const [filtroMC, setFiltroMC] = useState('');
  const [filtroMarkup, setFiltroMarkup] = useState('');
  const [ordenar, setOrdenar] = useState('');
  const debouncedBuscar = useDebounce(buscar);

  const { data, isLoading } = useQuery({
    queryKey: ['productos', { es_borrador: 0, ...(categoriaId && { categoria_id: Number(categoriaId) }) }],
    queryFn: () => productosApi.getAll({ es_borrador: 0, ...(categoriaId ? { categoria_id: Number(categoriaId) } : {}) }),
  });

  const { data: catData } = useQuery({
    queryKey: ['categorias', 'productos'],
    queryFn: () => categoriasApi.getProductos(),
  });

  const productosRaw = data?.data || [];
  const categorias = catData?.data || [];

  // Filtrar + ordenar
  const productos = useMemo(() => {
    let list = productosRaw;

    // Buscar por nombre
    if (debouncedBuscar) {
      const term = debouncedBuscar.toLowerCase();
      list = list.filter((p) => p.nombre.toLowerCase().includes(term));
    }

    // Filtro por MC Tarjeta
    if (filtroMC) {
      list = list.filter((p) => {
        const mc = p.rentabilidades?.local_tarjeta?.mc_neto ?? 0;
        switch (filtroMC) {
          case 'negativo': return mc <= 0;
          case 'critico': return mc > 0 && mc < 15;
          case 'bajo': return mc >= 15 && mc < 25;
          case 'medio': return mc >= 25 && mc < 35;
          case 'bueno': return mc >= 35 && mc < 50;
          case 'excelente': return mc >= 50;
          default: return true;
        }
      });
    }

    // Filtro por Markup
    if (filtroMarkup) {
      list = list.filter((p) => {
        const mk = calcMarkup(Number(p.precio_publico), Number(p.costo_total));
        switch (filtroMarkup) {
          case 'sin_precio': return Number(p.precio_publico) === 0;
          case 'bajo': return mk > 0 && mk < 50;
          case 'medio': return mk >= 50 && mk < 100;
          case 'alto': return mk >= 100 && mk < 200;
          case 'muy_alto': return mk >= 200;
          default: return true;
        }
      });
    }

    // Ordenar
    if (ordenar) {
      list = [...list].sort((a, b) => {
        switch (ordenar) {
          case 'mc_asc': return (a.rentabilidades?.local_tarjeta?.mc_neto || 0) - (b.rentabilidades?.local_tarjeta?.mc_neto || 0);
          case 'mc_desc': return (b.rentabilidades?.local_tarjeta?.mc_neto || 0) - (a.rentabilidades?.local_tarjeta?.mc_neto || 0);
          case 'markup_asc': return calcMarkup(Number(a.precio_publico), Number(a.costo_total)) - calcMarkup(Number(b.precio_publico), Number(b.costo_total));
          case 'markup_desc': return calcMarkup(Number(b.precio_publico), Number(b.costo_total)) - calcMarkup(Number(a.precio_publico), Number(a.costo_total));
          case 'costo_desc': return Number(b.costo_total) - Number(a.costo_total);
          case 'precio_desc': return Number(b.precio_publico) - Number(a.precio_publico);
          default: return 0;
        }
      });
    }

    return list;
  }, [productosRaw, debouncedBuscar, filtroMC, filtroMarkup, ordenar]);

  const promedios = useMemo(() => {
    if (productos.length === 0) return { tarjeta: 0, efectivo: 0, markup: 0 };
    const sum = productos.reduce((acc, p) => ({
      tarjeta: acc.tarjeta + (p.rentabilidades?.local_tarjeta?.mc_neto || 0),
      efectivo: acc.efectivo + (p.rentabilidades?.local_efectivo?.mc_neto || 0),
      markup: acc.markup + calcMarkup(Number(p.precio_publico), Number(p.costo_total)),
    }), { tarjeta: 0, efectivo: 0, markup: 0 });
    const n = productos.length;
    return { tarjeta: sum.tarjeta / n, efectivo: sum.efectivo / n, markup: sum.markup / n };
  }, [productos]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="w-full sm:flex-1 sm:min-w-[180px]">
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar producto..." />
        </div>
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
          <option value="">Todas las categorias</option>
          {/* Una categoria principal incluye sus subcategorias */}
          {opcionesJerarquia(categorias).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select value={filtroMC} onChange={(e) => setFiltroMC(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
          <option value="">MC: Todos</option>
          <option value="negativo">🔴 Negativo (≤0%)</option>
          <option value="critico">🔴 Critico (&lt;15%)</option>
          <option value="bajo">🟠 Bajo (15-25%)</option>
          <option value="medio">🟡 Medio (25-35%)</option>
          <option value="bueno">🟢 Bueno (35-50%)</option>
          <option value="excelente">💚 Excelente (≥50%)</option>
        </select>
        <select value={filtroMarkup} onChange={(e) => setFiltroMarkup(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
          <option value="">Markup: Todos</option>
          <option value="sin_precio">⚪ Sin precio</option>
          <option value="bajo">🔴 Bajo (&lt;50%)</option>
          <option value="medio">🟠 Medio (50-100%)</option>
          <option value="alto">🟢 Alto (100-200%)</option>
          <option value="muy_alto">💚 Muy alto (≥200%)</option>
        </select>
        <select value={ordenar} onChange={(e) => setOrdenar(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
          <option value="">Ordenar por...</option>
          <option value="mc_desc">MC mayor a menor</option>
          <option value="mc_asc">MC menor a mayor</option>
          <option value="markup_desc">Markup mayor a menor</option>
          <option value="markup_asc">Markup menor a mayor</option>
          <option value="costo_desc">Mayor costo</option>
          <option value="precio_desc">Mayor precio</option>
        </select>
      </div>

      {/* Promedios */}
      {productos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-sm text-text-muted mb-1">Promedio 💳 Tarjeta</div>
            <MCBadge value={promedios.tarjeta} />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-sm text-text-muted mb-1">Promedio 💵 Efectivo</div>
            <MCBadge value={promedios.efectivo} />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-sm text-text-muted mb-1">Promedio Markup</div>
            <span className={`text-xl font-bold ${getMarkupColor(promedios.markup)}`}>
              {promedios.markup.toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      <p className="text-xs text-text-muted text-right">{productos.length} productos</p>

      {isLoading ? <LoadingSpinner /> : productos.length === 0 ? <EmptyState message="No hay productos publicados" /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium text-right">Costo</th>
                <th className="px-4 py-3 font-medium text-right">Precio Local</th>
                <th className="px-4 py-3 font-medium text-center">Markup</th>
                <th className="px-4 py-3 font-medium text-center">💳 MC</th>
                <th className="px-4 py-3 font-medium text-center">💵 MC</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const costo = Number(p.costo_total);
                const precio = Number(p.precio_publico);
                const markup = calcMarkup(precio, costo);
                return (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <a
                        href={`/cofcostos/productos?openId=${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline cursor-pointer"
                        title="Abrir producto en nueva pestania"
                      >
                        {p.nombre}
                      </a>
                      {p.categoria_nombre && (
                        <div className="text-xs text-text-muted">
                          {p.categoria_icono} {p.categoria_nombre}
                          {p.subcategoria_nombre && <span className="text-text-muted/80"> › {p.subcategoria_nombre}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{formatMoney(costo)}</td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(precio)}
                      {p.precio_anterior_local != null && (
                        <div className="text-xs text-text-muted">
                          {precio > Number(p.precio_anterior_local) ? '📈' : '📉'} antes {formatMoney(p.precio_anterior_local)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {precio > 0 && costo > 0 ? (
                        <span className={`text-sm font-bold ${getMarkupColor(markup)}`}>{markup.toFixed(0)}%</span>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center"><MCBadge value={p.rentabilidades?.local_tarjeta?.mc_neto || 0} size="sm" /></td>
                    <td className="px-4 py-3 text-center"><MCBadge value={p.rentabilidades?.local_efectivo?.mc_neto || 0} size="sm" /></td>
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
