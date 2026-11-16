import { useQuery } from '@tanstack/react-query';
import { produccionApi } from '../api/produccion';

// Unidad (singular) con que se asienta en Produccion un producto o subreceta:
// "plancha", "receta"... null si ya no existe. Usa el catalogo cacheado.
export function useUnidadProduccion(tipo: 'producto' | 'subreceta', id: number | null): string | null {
  const { data } = useQuery({ queryKey: ['produccion-catalogo'], queryFn: produccionApi.getCatalogo });
  const item = data?.data.find((c) => c.tipo === tipo && c.id === id);
  return item ? item.asiento_unidad || 'receta' : null;
}
