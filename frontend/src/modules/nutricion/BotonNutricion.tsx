import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { nutricionApi } from './api';
import type { EstadoProducto } from './types';
import { ESTADOS_PRODUCTO } from './utils';

// Verde = controlado; rojo = se controlo pero cambio la receta; gris = el resto
const COLOR: Partial<Record<EstadoProducto, string>> = {
  controlado: 'bg-green-50 hover:bg-green-100 text-green-800 border-green-300',
  vencido: 'bg-red-50 hover:bg-red-100 text-red-700 border-red-300',
};

// Boton "Info nutricional" del editor de productos, con el color del estado
// para ver de un vistazo si ya tiene su info controlada.
export default function BotonNutricion({ productoId, onClick }: { productoId: number; onClick: () => void }) {
  const { data } = useQuery({
    queryKey: ['nutri-producto', productoId],
    queryFn: () => nutricionApi.getProducto(productoId),
    staleTime: 0,
  });
  const estado = data?.data.estado;

  return (
    <button type="button" onClick={onClick} title={estado ? ESTADOS_PRODUCTO[estado].ayuda : 'Según la receta guardada'}
      className={clsx('inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors cursor-pointer',
        (estado && COLOR[estado]) || 'bg-gray-100 hover:bg-gray-200 text-text-primary border-gray-300')}>
      🍎 Info nutricional{estado === 'controlado' && ' ✓'}
    </button>
  );
}
