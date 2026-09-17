import api from './axios';
import type { ConceptosResponse, Concepto, ApiResponse } from '../types';

export const conceptosApi = {
  getAll: (): Promise<ApiResponse<ConceptosResponse>> =>
    api.get('/conceptos'),
  create: (data: {
    nombre: string;
    tipo: string;
    porcentaje: number;
    descripcion?: string;
    es_resta?: number;
    canales_ids: number[];
  }): Promise<ApiResponse<Concepto>> =>
    api.post('/conceptos', data),
  update: (id: number, data: {
    nombre: string;
    tipo: string;
    porcentaje: number;
    descripcion?: string;
    es_resta?: number;
    canales_ids: number[];
  }): Promise<ApiResponse<Concepto>> =>
    api.put(`/conceptos/${id}`, data),
  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/conceptos/${id}`),
};
