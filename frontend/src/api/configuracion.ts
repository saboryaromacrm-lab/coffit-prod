import api from './axios';
import type { ApiResponse } from '../types';

export const configuracionApi = {
  getAll: (): Promise<ApiResponse<Record<string, string>>> =>
    api.get('/configuracion'),
  update: (clave: string, valor: string): Promise<ApiResponse<{ clave: string; valor: string }>> =>
    api.put('/configuracion', { clave, valor }),
};
