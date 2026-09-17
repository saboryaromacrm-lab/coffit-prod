import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/ingredientes': 'Ingredientes',
  '/subrecetas': 'Subrecetas',
  '/productos': 'Productos',
  '/preparaciones': 'Preparaciones',
  '/produccion': 'Produccion',
  '/reportes-produccion': 'Reportes Produccion',
  '/plan-semanal': 'Plan semanal de produccion',
  '/perdidas': 'Perdidas y consumos',
  '/reportes-envios': 'Reportes SyA',
  '/sabor-y-aroma': 'Sabor y Aroma',
  '/rentabilidades': 'Rentabilidades',
  '/ofertas': 'Promos/Boxs',
  '/categorias': 'Categorias',
  '/proveedores': 'Proveedores',
  '/compras': 'Compras',
  '/configuracion': 'Configuracion',
};

export default function Header() {
  const location = useLocation();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const title = pageTitles[location.pathname] || 'CoffitCost';

  return (
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
      {/* Area tactil generosa para el menu en movil */}
      <button
        className="lg:hidden -ml-2 p-2 text-text-muted hover:text-text-primary"
        onClick={toggleSidebar}
      >
        <Menu size={24} />
      </button>
      <h1 className="text-lg sm:text-xl font-bold text-text-primary truncate">{title}</h1>
    </header>
  );
}
