import { Outlet, Navigate, useParams, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import ColaboradorSidebar from './ColaboradorSidebar';
import { colaboradoresApi } from '../../api/colaboradores';
import { useUIStore } from '../../stores/uiStore';
import LoadingSpinner from '../common/LoadingSpinner';

export default function ColaboradorLayout() {
  const { key = '' } = useParams();
  const location = useLocation();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['colaborador-acceso', key],
    queryFn: () => colaboradoresApi.getByKey(key),
    retry: false,
    enabled: !!key,
  });

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  }

  const colaborador = data?.data;
  if (isError || !colaborador) {
    return (
      <div className="h-screen flex flex-col items-center justify-center text-center px-6 bg-gray-50">
        <span className="text-5xl mb-3">🔒</span>
        <h1 className="text-lg font-bold text-text-primary">Acceso no valido</h1>
        <p className="text-sm text-text-muted mt-1">Este link de colaborador no existe o fue desactivado.</p>
      </div>
    );
  }

  const secciones = colaborador.secciones || [];
  const primera = secciones[0];
  const basePath = `/colaborador/${key}`;

  // En la base (sin seccion) redirige a la primera habilitada.
  const enBase = location.pathname === basePath || location.pathname === `${basePath}/`;
  if (enBase) {
    return primera
      ? <Navigate to={`${basePath}/${primera}`} replace />
      : <SinSecciones nombre={colaborador.nombre} />;
  }

  // Guard suave: si entra por URL a una seccion no habilitada, la manda a la primera.
  const seccionActual = location.pathname.slice(basePath.length + 1).split('/')[0];
  if (seccionActual && !secciones.includes(seccionActual)) {
    return primera
      ? <Navigate to={`${basePath}/${primera}`} replace />
      : <SinSecciones nombre={colaborador.nombre} />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <ColaboradorSidebar nombre={colaborador.nombre} accessKey={key} secciones={secciones} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button className="text-text-muted hover:text-text-primary" onClick={toggleSidebar}>
            <Menu size={22} />
          </button>
          <span className="font-bold text-text-primary">{colaborador.nombre}</span>
        </div>
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SinSecciones({ nombre }: { nombre: string }) {
  return (
    <div className="h-screen flex flex-col items-center justify-center text-center px-6 bg-gray-50">
      <span className="text-5xl mb-3">📭</span>
      <h1 className="text-lg font-bold text-text-primary">Hola {nombre}</h1>
      <p className="text-sm text-text-muted mt-1">Todavia no tenes secciones habilitadas. Pedile al administrador que te asigne accesos.</p>
    </div>
  );
}
