import api from './axios';
import type { Unidad, ApiResponse } from '../types';

export const unidadesApi = {
  getAll: (): Promise<ApiResponse<Unidad[]>> =>
    api.get('/unidades'),
};
