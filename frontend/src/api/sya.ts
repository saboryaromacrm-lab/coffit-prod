import api from './axios';
import type { ApiResponse } from '../types';
import type {
  SyaArticulo, SyaEnvio, SyaEnvioDetalle, SyaResumen,
  SyaImportResultado, SyaSugerencia, SyaMapeoInput,
} from '../types/sya';

export const syaApi = {
  // payload = respuesta completa del sync del CRM (pegada como JSON)
  importar: (payload: unknown): Promise<ApiResponse<SyaImportResultado>> =>
    api.post('/sya/importar', { payload }),

  getResumen: (): Promise<ApiResponse<SyaResumen>> =>
    api.get('/sya/resumen'),

  getEnvios: (params?: { estado?: string; buscar?: string }): Promise<ApiResponse<SyaEnvio[]>> =>
    api.get('/sya/envios', { params }),

  getEnvio: (id: number): Promise<ApiResponse<SyaEnvioDetalle>> =>
    api.get(`/sya/envios/${id}`),

  setReparto: (envioId: number, itemId: number, cant_mp: number, cant_venta: number): Promise<ApiResponse<{ message: string }>> =>
    api.patch(`/sya/envios/${envioId}/items/${itemId}/reparto`, { cant_mp, cant_venta }),

  getArticulos: (params?: { estado?: string; buscar?: string }): Promise<ApiResponse<SyaArticulo[]>> =>
    api.get('/sya/articulos', { params }),

  getSugerencias: (articuloId: number): Promise<ApiResponse<SyaSugerencia[]>> =>
    api.get(`/sya/articulos/${articuloId}/sugerencias`),

  mapear: (articuloId: number, data: SyaMapeoInput): Promise<ApiResponse<{ message: string; renglones_reaplicados: number }>> =>
    api.put(`/sya/articulos/${articuloId}/mapear`, data),

  updateVenta: (articuloId: number, data: { venta_nombre?: string; venta_precio?: number | null; venta_activo?: boolean }): Promise<ApiResponse<{ message: string }>> =>
    api.put(`/sya/articulos/${articuloId}/venta`, data),
};
