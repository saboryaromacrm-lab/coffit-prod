import api from './axios';
import type { Subreceta, ApiResponse } from '../types';

// Info nutricional por unidad — todos opcionales (null = sin datos)
export interface SubrecetaNutricion {
  nutri_energia_kcal?: number | null;
  nutri_proteinas_g?: number | null;
  nutri_carbohidratos_g?: number | null;
  nutri_azucares_g?: number | null;
  nutri_grasas_g?: number | null;
  nutri_grasas_sat_g?: number | null;
  nutri_grasas_trans_g?: number | null;
  nutri_sodio_mg?: number | null;
}

interface SubrecetaPayload extends SubrecetaNutricion {
  nombre: string;
  rendimiento_gramos: number;
  tipo_rendimiento: string;
  notas?: string;
  ingredientes: { ingrediente_id: number; cantidad: number; unidad: string }[];
}

// Donde se usa una subreceta: productos y pedidos personalizados.
export interface SubrecetaUsoData {
  productos: {
    id: number;
    nombre: string;
    cantidad: number;
    unidad: string;
    categoria_nombre: string | null;
    categoria_icono: string | null;
    es_borrador: boolean;
  }[];
  personalizados: {
    producto_id: number | null; // null = opcion de un grupo de la biblioteca
    producto_nombre: string | null;
    grupo_nombre: string | null;
    opcion_nombre: string | null; // null = receta base del producto
    cantidad: number;
    unidad: string;
    por_kg: boolean;
  }[];
}

export const subrecetasApi = {
  getUso: (id: number): Promise<ApiResponse<SubrecetaUsoData>> =>
    api.get(`/subrecetas/${id}/uso`),
  getAll: (): Promise<ApiResponse<Subreceta[]>> =>
    api.get('/subrecetas'),
  getById: (id: number): Promise<ApiResponse<Subreceta>> =>
    api.get(`/subrecetas/${id}`),
  create: (data: SubrecetaPayload): Promise<ApiResponse<Subreceta>> =>
    api.post('/subrecetas', data),
  update: (id: number, data: SubrecetaPayload): Promise<ApiResponse<Subreceta>> =>
    api.put(`/subrecetas/${id}`, data),
  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/subrecetas/${id}`),
};
