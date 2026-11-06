import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
import { ppApi } from './api';
import type { ProductoEditor } from './types';

// Simulacion del producto que se esta editando (sin guardar) con las opciones
// elegidas. La comparten el simulador (elige) y el resumen de rentabilidad
// (muestra). Se manda el borrador entero; el debounce evita una consulta por tecla.
export function useSimulacion(producto: ProductoEditor) {
  const [elegidas, setElegidas] = useState<string[]>([]);
  const borradorJson = useDebounce(JSON.stringify(producto), 350);
  const { data, isFetching, error } = useQuery({
    queryKey: ['pp-simular', borradorJson, elegidas],
    queryFn: () => ppApi.simular({ borrador: JSON.parse(borradorJson) }, elegidas),
    placeholderData: keepPreviousData,
  });
  return { sim: data?.data, isFetching, error: error as Error | null, elegidas, setElegidas, borradorJson };
}

export type Simulando = ReturnType<typeof useSimulacion>;
