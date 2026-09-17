import api from './axios';
import type { ApiResponse } from '../types';

export interface PreparacionReceta {
  id: number;
  nombre: string;
  tiene_preparacion: boolean;
  porciones?: number;
  categoria_nombre?: string;   // siempre la RAIZ
  categoria_icono?: string;
  subcategoria_nombre?: string | null;
}

// Lista plana ya ordenada como arbol (raiz seguida de sus subcategorias)
export interface PreparacionCategoria {
  id: number;
  nombre: string;
  icono: string;
  parent_id: number | null;
  parent_nombre?: string | null;
}

export interface PreparacionListResponse {
  recetas: PreparacionReceta[];
  categorias: PreparacionCategoria[];
}

export interface PreparacionIngrediente {
  nombre: string;
  cantidad: number;
  unidad: string;
  es_subreceta: boolean;
}

export interface PreparacionDetalle {
  id: number;
  nombre: string;
  porciones: number | null;
  // Solo subrecetas: rendimiento bruto y tipo (gramos|porciones)
  rendimiento?: number | null;
  tipo_rendimiento?: 'gramos' | 'porciones' | null;
  categoria_nombre?: string;   // siempre la RAIZ
  categoria_icono?: string;
  subcategoria_nombre?: string | null;
  preparacion: string;
  coccion: string;
  tener_en_cuenta: string;
  ingredientes: PreparacionIngrediente[];
}

export const preparacionesApi = {
  getList: (params?: { tipo?: string; categoria_id?: number }): Promise<ApiResponse<PreparacionListResponse>> =>
    api.get('/preparaciones', { params }),

  getDetalle: (tipo: string, id: number): Promise<ApiResponse<PreparacionDetalle>> =>
    api.get(`/preparaciones/${tipo}/${id}`),

  update: (tipo: string, id: number, data: {
    preparacion: string;
    coccion?: string;
    tener_en_cuenta?: string;
  }): Promise<ApiResponse<null>> =>
    api.put(`/preparaciones/${tipo}/${id}`, data),
};
