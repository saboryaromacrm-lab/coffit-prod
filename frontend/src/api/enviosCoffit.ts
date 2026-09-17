import api from './axios';
import type {
  ApiResponse, EnvioCoffit, EnvioCoffitInput, EnvioCoffitCatalogo, ReporteCoffitData,
} from '../types';

export interface EnviosCoffitFilters {
  desde?: string;
  hasta?: string;
  buscar?: string;
  solo_devueltos?: boolean;
  limit?: number;
  offset?: number;
}

interface EnviosCoffitResponse {
  success: boolean;
  data: EnvioCoffit[];
  total: number;
}

export const enviosCoffitApi = {
  getAll: (filters?: EnviosCoffitFilters): Promise<EnviosCoffitResponse> =>
    api.get('/envios-coffit', {
      params: {
        ...filters,
        solo_devueltos: filters?.solo_devueltos ? '1' : undefined,
      },
    }),

  create: (data: EnvioCoffitInput): Promise<ApiResponse<EnvioCoffit>> =>
    api.post('/envios-coffit', data),

  createBatch: (envios: EnvioCoffitInput[]): Promise<ApiResponse<EnvioCoffit[]>> =>
    api.post('/envios-coffit/batch', { envios }),

  update: (id: number, data: EnvioCoffitInput & { cantidad_devuelta?: number }): Promise<ApiResponse<EnvioCoffit>> =>
    api.put(`/envios-coffit/${id}`, data),

  updateDevueltos: (id: number, cantidad_devuelta: number): Promise<ApiResponse<EnvioCoffit>> =>
    api.patch(`/envios-coffit/${id}/devueltos`, { cantidad_devuelta }),

  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/envios-coffit/${id}`),

  getCatalogo: (): Promise<ApiResponse<EnvioCoffitCatalogo[]>> =>
    api.get('/envios-coffit/catalogo'),

  getReporte: (desde: string, hasta: string, buscar?: string): Promise<ApiResponse<ReporteCoffitData>> =>
    api.get('/envios-coffit/reporte', { params: { desde, hasta, buscar: buscar || undefined } }),
};
