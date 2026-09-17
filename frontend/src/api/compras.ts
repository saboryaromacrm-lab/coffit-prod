import api from './axios';
import type { ApiResponse, Compra, CompraInput, CompraMetricas, ConceptoCompra, MetodoPago } from '../types';

export interface ComprasFilters {
  desde?: string;
  hasta?: string;
  proveedor_id?: number;
  concepto_id?: number;
  ingrediente_id?: number;
  buscar?: string;
  limit?: number;
  offset?: number;
}

interface ComprasResponse {
  success: boolean;
  data: Compra[];
  total: number;
}

export const comprasApi = {
  getAll: (filters?: ComprasFilters): Promise<ComprasResponse> =>
    api.get('/compras', { params: filters }),

  getMetricas: (): Promise<ApiResponse<CompraMetricas>> =>
    api.get('/compras/metricas'),

  create: (data: CompraInput): Promise<ApiResponse<Compra>> =>
    api.post('/compras', data),

  update: (id: number, data: CompraInput): Promise<ApiResponse<Compra>> =>
    api.put(`/compras/${id}`, data),

  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/compras/${id}`),
};

export const conceptosCompraApi = {
  getAll: (): Promise<ApiResponse<ConceptoCompra[]>> =>
    api.get('/conceptos-compra'),
  create: (data: { nombre: string; color?: string }): Promise<ApiResponse<ConceptoCompra>> =>
    api.post('/conceptos-compra', data),
  update: (id: number, data: { nombre: string; color?: string }): Promise<ApiResponse<ConceptoCompra>> =>
    api.put(`/conceptos-compra/${id}`, data),
  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/conceptos-compra/${id}`),
};

export const metodosPagoApi = {
  getAll: (): Promise<ApiResponse<MetodoPago[]>> =>
    api.get('/metodos-pago'),
  create: (data: { nombre: string }): Promise<ApiResponse<MetodoPago>> =>
    api.post('/metodos-pago', data),
  update: (id: number, data: { nombre: string }): Promise<ApiResponse<MetodoPago>> =>
    api.put(`/metodos-pago/${id}`, data),
  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/metodos-pago/${id}`),
};
