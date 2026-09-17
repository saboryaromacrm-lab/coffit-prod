import api from './axios';
import type { Proveedor, ApiResponse } from '../types';

export const proveedoresApi = {
  getAll: (buscar?: string): Promise<ApiResponse<Proveedor[]>> =>
    api.get('/proveedores', { params: buscar ? { buscar } : undefined }),
  create: (data: Partial<Proveedor>): Promise<ApiResponse<Proveedor>> =>
    api.post('/proveedores', data),
  update: (id: number, data: Partial<Proveedor>): Promise<ApiResponse<Proveedor>> =>
    api.put(`/proveedores/${id}`, data),
  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/proveedores/${id}`),
};
