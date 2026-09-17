import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { COLAB_SECCIONES } from '../../constants/colaboradorSecciones';
import clsx from 'clsx';

export default function ColaboradorSidebar({ nombre, accessKey, secciones }: {
  nombre: string;
  accessKey: string;
  secciones: string[];
}) {
  const { sidebarOpen, setSidebarOpen } = useUIStore();

  // Solo las secciones habilitadas para este colaborador.
  const items = COLAB_SECCIONES.filter((s) => secciones.includes(s.key));

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={clsx(
          'fixed top-0 left-0 z-50 h-full w-64 bg-sidebar text-white flex flex-col transition-transform duration-200',
          'lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl">☕</span>
            <div className="flex flex-col min-w-0">
              <span className="text-lg font-bold text-primary truncate">{nombre || 'Colaborador'}</span>
              <span className="text-xs text-white/50 truncate">Coffit · Colaborador</span>
            </div>
          </div>
          <button className="lg:hidden text-white/60 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-5 text-xs text-white/40">Sin secciones habilitadas.</p>
          ) : items.map((item) => (
            <NavLink
              key={item.key}
              to={`/colaborador/${accessKey}/${item.key}`}
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
