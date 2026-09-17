import api from './axios';
import type { ApiResponse, PlanSemanalData, PlanSemanalItem, PlanSemanalInput, PlanHoyData } from '../types';

export const planSemanalApi = {
  // modo='plantilla' o modo='semana' (con desde='YYYY-MM-DD')
  get: (params: { modo: 'plantilla' } | { modo: 'semana'; desde: string }): Promise<ApiResponse<PlanSemanalData>> =>
    api.get('/plan-semanal', { params }),

  getHoy: (): Promise<ApiResponse<PlanHoyData>> =>
    api.get('/plan-semanal/hoy'),

  create: (data: PlanSemanalInput): Promise<ApiResponse<PlanSemanalItem>> =>
    api.post('/plan-semanal', data),

  update: (id: number, data: PlanSemanalInput): Promise<ApiResponse<PlanSemanalItem>> =>
    api.put(`/plan-semanal/${id}`, data),

  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/plan-semanal/${id}`),

  copyDay: (data: {
    from_dia: number;
    to_dia: number;
    fecha_origen?: string | null;
    fecha_destino?: string | null;
  }): Promise<ApiResponse<{ copiados: number; ids: number[] }>> =>
    api.post('/plan-semanal/copy-day', data),
};
