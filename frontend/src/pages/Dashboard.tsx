import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Egg, ChefHat, Coffee, FolderOpen, AlertTriangle, PackageOpen } from 'lucide-react';
import { dashboardApi } from '../api/dashboard';
import type { DashboardData } from '../types';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';

const statCards = [
  { key: 'ingredientes' as const, label: 'Ingredientes', icon: Egg, color: 'text-orange-500 bg-orange-50', link: '/ingredientes' },
  { key: 'subrecetas' as const, label: 'Subrecetas', icon: ChefHat, color: 'text-purple-500 bg-purple-50', link: '/subrecetas' },
  { key: 'productos' as const, label: 'Productos', icon: Coffee, color: 'text-blue-500 bg-blue-50', link: '/productos' },
  { key: 'categorias' as const, label: 'Categorias', icon: FolderOpen, color: 'text-green-500 bg-green-50', link: '/categorias' },
];

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get(),
  });

  if (isLoading) return <LoadingSpinner />;

  const dashboard: DashboardData | null = data?.data || null;

  if (!dashboard) return <EmptyState message="No se pudo cargar el dashboard" />;

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.key} to={card.link} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.color}`}>
                  <Icon size={20} />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold">{dashboard[card.key] ?? 0}</p>
                  <p className="text-xs text-text-muted">{card.label}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Low Margin Products */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-yellow-500" />
            <h3 className="text-sm font-semibold">Productos con bajo margen (&lt;25%)</h3>
          </div>
          {dashboard.productos_bajo_margen?.length === 0 ? (
            <p className="text-sm text-text-muted">Todos los productos tienen un margen saludable</p>
          ) : (
            <div className="space-y-2">
              {dashboard.productos_bajo_margen?.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{p.nombre}</span>
                  <span className="text-red-500 font-medium shrink-0">{p.mc_min?.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ingredients without supplier */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <PackageOpen size={16} className="text-orange-500" />
            <h3 className="text-sm font-semibold">Ingredientes sin proveedor</h3>
          </div>
          {dashboard.ingredientes_sin_proveedor?.length === 0 ? (
            <p className="text-sm text-text-muted">Todos los ingredientes tienen proveedor asignado</p>
          ) : (
            <div className="space-y-2">
              {dashboard.ingredientes_sin_proveedor?.map((i) => (
                <div key={i.id} className="text-sm">
                  <Link to="/ingredientes" className="text-primary hover:underline">{i.nombre}</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
