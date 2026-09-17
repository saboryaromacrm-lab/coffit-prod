import api from './axios';
import type { ApiResponse, Perdida, PerdidaInput, ItemCatalogo } from '../types';

export interface PerdidasFilters {
  desde?: string;
  hasta?: string;
  item_tipo?: string;
  motivo?: string;
  responsable?: string;
  buscar?: string;
  limit?: number;
  offset?: number;
}

interface PerdidasResponse {
  success: boolean;
  data: Perdida[];
  total: number;
}

export const perdidasApi = {
  getAll: (filters?: PerdidasFilters): Promise<PerdidasResponse> =>
    api.get('/perdidas', { params: filters }),

  create: (data: PerdidaInput): Promise<ApiResponse<Perdida>> =>
    api.post('/perdidas', data),

  update: (id: number, data: PerdidaInput): Promise<ApiResponse<Perdida>> =>
    api.put(`/perdidas/${id}`, data),

  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/perdidas/${id}`),

  getCatalogo: (): Promise<ApiResponse<ItemCatalogo[]>> =>
    api.get('/perdidas/items-catalogo'),
};
