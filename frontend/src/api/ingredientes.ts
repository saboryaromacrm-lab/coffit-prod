import api from './axios';
import type { Ingrediente, ApiResponse } from '../types';

interface IngredientesResponse {
  success: boolean;
  data: Ingrediente[];
  categorias: string[];
  total: number;
}

export interface IngredientesFilters {
  categoria?: string;
  buscar?: string;
  orden?: string;
  antiguedad?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  solo_no_usados?: number;
}

export interface BulkDeleteResult {
  eliminados: { id: number; nombre: string }[];
  omitidos: { id: number; nombre: string }[];
  total_eliminados: number;
  total_omitidos: number;
}

export interface IngredienteUsoProducto {
  id: number;
  nombre: string;
  cantidad: number;
  unidad: string;
  categoria_nombre: string | null;
  categoria_icono: string | null;
  es_borrador: boolean;
}

export interface IngredienteUsoSubreceta {
  id: number;
  nombre: string;
  cantidad: number;
  unidad: string;
  tipo_rendimiento: 'gramos' | 'porciones';
}

export interface IngredienteUsoData {
  productos: IngredienteUsoProducto[];
  subrecetas: IngredienteUsoSubreceta[];
  total_productos: number;
  total_subrecetas: number;
}

export const ingredientesApi = {
  getAll: (filters?: IngredientesFilters): Promise<IngredientesResponse> =>
    api.get('/ingredientes', { params: filters }),
  create: (data: Partial<Ingrediente>): Promise<ApiResponse<Ingrediente>> =>
    api.post('/ingredientes', data),
  update: (id: number, data: Partial<Ingrediente>): Promise<ApiResponse<Ingrediente>> =>
    api.put(`/ingredientes/${id}`, data),
  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/ingredientes/${id}`),
  bulkDelete: (ids: number[]): Promise<ApiResponse<BulkDeleteResult>> =>
    api.post('/ingredientes/bulk-delete', { ids }),
  getUso: (id: number): Promise<ApiResponse<IngredienteUsoData>> =>
    api.get(`/ingredientes/${id}/uso`),
};
