import api from '../../api/axios';
import type { ApiResponse } from '../../types';
import type { IngredienteNutri, ErrorIA, ProductoNutri, ProductoNutriResumen, SubrecetaNutri, Valores, ConfigModeloIA } from './types';

// La IA tarda (piensa cada ingrediente): no aplica el timeout corto de siempre.
const TIMEOUT_IA = 5 * 60 * 1000;

export const nutricionApi = {
  getIngredientes: (): Promise<ApiResponse<IngredienteNutri[]>> => api.get('/nutricion/ingredientes'),
  guardarIngrediente: (id: number, data: { gramos_por_unidad: number; valores: Valores; controlado: boolean }): Promise<ApiResponse<IngredienteNutri>> =>
    api.put(`/nutricion/ingredientes/${id}`, data),
  controlarIngrediente: (id: number, controlado: boolean): Promise<ApiResponse<{ controlado: boolean }>> =>
    api.patch(`/nutricion/ingredientes/${id}/control`, { controlado }),
  sugerirIA: (ids: number[]): Promise<ApiResponse<{ actualizados: IngredienteNutri[]; errores: ErrorIA[] }>> =>
    api.post('/nutricion/ia/ingredientes', { ids }, { timeout: TIMEOUT_IA }),
  // Lee la receta del producto y completa los ingredientes sin info
  // reanalizar: tambien los que estan sin revisar (no los controlados)
  completarProducto: (id: number, reanalizar: boolean): Promise<ApiResponse<{ producto: ProductoNutri; completados: number; errores: ErrorIA[] }>> =>
    api.post(`/nutricion/ia/productos/${id}`, { reanalizar }, { timeout: TIMEOUT_IA }),
  getModeloIA: (): Promise<ApiResponse<ConfigModeloIA>> => api.get('/nutricion/ia/modelo'),
  setModeloIA: (modelo: string): Promise<ApiResponse<{ modelo: string }>> => api.put('/nutricion/ia/modelo', { modelo }),

  getSubreceta: (id: number): Promise<ApiResponse<SubrecetaNutri>> => api.get(`/nutricion/subrecetas/${id}`),

  getProductos: (): Promise<ApiResponse<ProductoNutriResumen[]>> => api.get('/nutricion/productos'),
  getProducto: (id: number): Promise<ApiResponse<ProductoNutri>> => api.get(`/nutricion/productos/${id}`),
  controlarProducto: (id: number, controlado: boolean): Promise<ApiResponse<ProductoNutri>> =>
    api.patch(`/nutricion/productos/${id}/control`, { controlado }),
};

// Hasta cuantos ingredientes acepta el backend por pedido a la IA
export const MAX_POR_PEDIDO_IA = 5;
