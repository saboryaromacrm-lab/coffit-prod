import api from './axios';
import type { Producto, ApiResponse } from '../types';

export interface ProductosFilters {
  categoria_id?: number;
  buscar?: string;
  es_borrador?: number;
  cambio_precio?: string;
  dias_cambio?: number;
}

// Una linea de receta: ingrediente del catalogo, subreceta, o item manual
// (nombre + costo fijo cargados a mano, sin nada en el catalogo detras).
export interface ItemRecetaInput {
  ingrediente_id?: number;
  subreceta_id?: number;
  cantidad: number;
  unidad: string;
  nombre_manual?: string;
  costo_manual?: number;
}

export const productosApi = {
  getAll: (filters?: ProductosFilters): Promise<ApiResponse<Producto[]>> =>
    api.get('/productos', { params: filters }),
  getById: (id: number): Promise<ApiResponse<Producto>> =>
    api.get(`/productos/${id}`),
  create: (data: {
    nombre: string;
    categoria_id?: number;
    porciones: number;
    precio_publico: number;
    es_borrador: number;
    notas?: string;
    peso_total_g?: number | null;
    ingredientes: ItemRecetaInput[];
  }): Promise<ApiResponse<Producto>> =>
    api.post('/productos', data),
  update: (id: number, data: {
    nombre: string;
    categoria_id?: number;
    porciones: number;
    precio_publico: number;
    es_borrador: number;
    notas?: string;
    peso_total_g?: number | null;
    ingredientes: ItemRecetaInput[];
  }): Promise<ApiResponse<Producto>> =>
    api.put(`/productos/${id}`, data),
  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/productos/${id}`),

  // Convierte un producto en subreceta (transaccional). Borra el producto.
  convertToSubreceta: (
    id: number,
    data: {
      rendimiento_gramos: number;
      tipo_rendimiento: 'gramos' | 'porciones';
      confirmar_subrecetas_anidadas?: boolean;
    }
  ): Promise<ApiResponse<{
    subreceta: { id: number; nombre: string };
    ingredientes_copiados: number;
    subrecetas_anidadas_descartadas: string[];
    message: string;
  }>> =>
    api.post(`/productos/${id}/convert-to-subreceta`, data),
};
