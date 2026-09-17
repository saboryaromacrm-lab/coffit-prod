import api from './axios';
import type { DashboardData, ApiResponse } from '../types';

export const dashboardApi = {
  get: (): Promise<ApiResponse<DashboardData>> =>
    api.get('/dashboard'),
};
