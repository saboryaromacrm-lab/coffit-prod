import api from './axios';
import type { Oferta, ApiResponse } from '../types';

export const ofertasApi = {
  getAll: (): Promise<ApiResponse<Oferta[]>> =>
    api.get('/ofertas'),
  create: (data: {
    nombre: string;
    tipo: string;
    categoria_carta?: string;
    valor: number;
    descripcion?: string;
    fecha_inicio?: string;
    fecha_fin?: string;
    estado: string;
    productos: { id: number; cantidad: number; rol?: string; descuento_pct?: number }[] | number[];
  }): Promise<ApiResponse<Oferta>> =>
    api.post('/ofertas', data),
  update: (id: number, data: {
    nombre: string;
    tipo: string;
    categoria_carta?: string;
    valor: number;
    descripcion?: string;
    fecha_inicio?: string;
    fecha_fin?: string;
    estado: string;
    productos: { id: number; cantidad: number; rol?: string; descuento_pct?: number }[] | number[];
  }): Promise<ApiResponse<Oferta>> =>
    api.put(`/ofertas/${id}`, data),
  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/ofertas/${id}`),
};
