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

export const subrecetasApi = {
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
