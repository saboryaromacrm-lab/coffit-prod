import api from './axios';
import type { Canal, ApiResponse } from '../types';

export const canalesApi = {
  getAll: (): Promise<ApiResponse<Canal[]>> =>
    api.get('/canales'),
};
