import api from './axios';
import type { ApiResponse } from '../types';

// Etiquetas de producto de la Carta y de Pedidos personalizados (no tienen
// tabla propia: viven en cada producto).
export type OrigenEtiquetado = 'carta' | 'personalizado';

export interface ItemEtiquetado {
  origen: OrigenEtiquetado;
  id: number;
  nombre: string;
  imagen: string | null;
  categoria: string | null;
  etiquetas: string[];
}

export const etiquetasApi = {
  getAll: (): Promise<ApiResponse<{ items: ItemEtiquetado[] }>> =>
    api.get('/etiquetas'),
  guardar: (origen: OrigenEtiquetado, id: number, etiquetas: string[]): Promise<ApiResponse<{ etiquetas: string[] }>> =>
    api.put(`/etiquetas/${origen}/${id}`, { etiquetas }),
  renombrar: (de: string, a: string): Promise<ApiResponse<{ carta: number; personalizados: number }>> =>
    api.put('/etiquetas/renombrar', { de, a }),
};
