import api from './axios';
import type { Producto, ApiResponse } from '../types';

export interface ProductosFilters {
  categoria_id?: number;
  buscar?: string;
  es_borrador?: number;
  cambio_precio?: string;
  dias_cambio?: number;
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
    precio_pedidosya: number;
    es_borrador: number;
    notas?: string;
    peso_total_g?: number | null;
    ingredientes: { ingrediente_id?: number; subreceta_id?: number; cantidad: number; unidad: string }[];
  }): Promise<ApiResponse<Producto>> =>
    api.post('/productos', data),
  update: (id: number, data: {
    nombre: string;
    categoria_id?: number;
    porciones: number;
    precio_publico: number;
    precio_pedidosya: number;
    es_borrador: number;
    notas?: string;
    peso_total_g?: number | null;
    ingredientes: { ingrediente_id?: number; subreceta_id?: number; cantidad: number; unidad: string }[];
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
