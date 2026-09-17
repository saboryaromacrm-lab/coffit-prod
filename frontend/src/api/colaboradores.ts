import api from './axios';
import type { ApiResponse } from '../types';

export interface Colaborador {
  id: number;
  nombre: string;
  access_key: string;
  secciones: string[];
  activo: number;
  created_at?: string;
}

export interface ColaboradorAcceso {
  nombre: string;
  secciones: string[];
}

export const colaboradoresApi = {
  getAll: (): Promise<ApiResponse<Colaborador[]>> =>
    api.get('/colaboradores'),

  getByKey: (key: string): Promise<ApiResponse<ColaboradorAcceso>> =>
    api.get(`/colaboradores/acceso/${key}`),

  create: (data: { nombre: string; secciones: string[] }): Promise<ApiResponse<Colaborador>> =>
    api.post('/colaboradores', data),

  update: (id: number, data: { nombre: string; secciones: string[]; activo?: number }): Promise<ApiResponse<Colaborador>> =>
    api.put(`/colaboradores/${id}`, data),

  regenerarKey: (id: number): Promise<ApiResponse<{ id: number; access_key: string }>> =>
    api.post(`/colaboradores/${id}/regenerar-key`, {}),

  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/colaboradores/${id}`),
};
