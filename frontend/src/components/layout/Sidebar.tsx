import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Apple, CookingPot, Package, TrendingUp,
  Tag, FolderOpen, Truck, Settings, X, ClipboardList, Factory, BarChart3, AlertTriangle, Send, CalendarDays, ShoppingCart, BookOpen, PackageOpen,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import clsx from 'clsx';

const menuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/ingredientes', label: 'Ingredientes', icon: Apple },
  { path: '/subrecetas', label: 'Subrecetas', icon: CookingPot },
  { path: '/productos', label: 'Productos', icon: Package },
  { path: '/carta', label: 'Carta', icon: BookOpen },
  { path: '/rentabilidades', label: 'Rentabilidades', icon: TrendingUp },
  { path: '/ofertas', label: 'Promos/Boxs', icon: Tag },
  { path: '/categorias', label: 'Categorias', icon: FolderOpen },
  { path: '/proveedores', label: 'Proveedores', icon: Truck },
  { path: '/compras', label: 'Compras', icon: ShoppingCart },
  { path: '/preparaciones', label: 'Preparaciones', icon: ClipboardList },
  { path: '/produccion', label: 'Produccion', icon: Factory },
  { path: '/plan-semanal', label: 'Plan semanal', icon: CalendarDays },
  { path: '/reportes-produccion', label: 'Reportes Prod.', icon: BarChart3 },
  { path: '/perdidas', label: 'Perdidas y consumos', icon: AlertTriangle },
  { path: '/reportes-envios', label: 'Reportes SyA', icon: Send },
  { path: '/sabor-y-aroma', label: 'Sabor y Aroma', icon: PackageOpen },
  { path: '/configuracion', label: 'Configuracion', icon: Settings },
];

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUIStore();


  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed top-0 left-0 z-50 h-full w-64 bg-sidebar text-white flex flex-col transition-transform duration-200',
          'lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-2xl">☕</span>
            <div className="flex flex-col min-w-0">
              <span className="text-xl font-bold text-primary truncate">Costos Coffit</span>
              <span className="text-xs text-white/50 truncate">By Coftech LucLorenzo</span>
            </div>
          </div>
          <button className="lg:hidden text-white/60 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/20 text-primary border-r-3 border-primary'
                    : 'text-white/70 hover:bg-sidebar-hover hover:text-white'
                )
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
