import api from './axios';
import type { ApiResponse, Envio, EnvioInput, EnvioCatalogo, ReporteEnviosData, ResultadosData } from '../types';

export interface EnviosFilters {
  desde?: string;
  hasta?: string;
  buscar?: string;
  solo_vencidos?: boolean;
  limit?: number;
  offset?: number;
}

interface EnviosResponse {
  success: boolean;
  data: Envio[];
  total: number;
}

export const enviosApi = {
  getAll: (filters?: EnviosFilters): Promise<EnviosResponse> =>
    api.get('/envios', {
      params: {
        ...filters,
        solo_vencidos: filters?.solo_vencidos ? '1' : undefined,
      },
    }),

  create: (data: EnvioInput): Promise<ApiResponse<Envio>> =>
    api.post('/envios', data),

  createBatch: (envios: EnvioInput[]): Promise<ApiResponse<Envio[]>> =>
    api.post('/envios/batch', { envios }),

  update: (id: number, data: EnvioInput & { cantidad_vencida?: number }): Promise<ApiResponse<Envio>> =>
    api.put(`/envios/${id}`, data),

  updateVencidos: (id: number, cantidad_vencida: number): Promise<ApiResponse<Envio>> =>
    api.patch(`/envios/${id}/vencidos`, { cantidad_vencida }),

  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/envios/${id}`),

  getCatalogo: (): Promise<ApiResponse<EnvioCatalogo[]>> =>
    api.get('/envios/catalogo'),

  getReporte: (desde: string, hasta: string, buscar?: string): Promise<ApiResponse<ReporteEnviosData>> =>
    api.get('/envios/reporte', { params: { desde, hasta, buscar: buscar || undefined } }),

  getResultados: (desde: string, hasta: string): Promise<ApiResponse<ResultadosData>> =>
    api.get('/envios/resultados', { params: { desde, hasta } }),
};
