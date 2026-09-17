import api from './axios';
import type {
  ApiResponse,
  Operario,
  ProduccionRegistro,
  ProduccionRegistroInput,
  ProductoCatalogo,
  ReporteData,
  ReporteIngredientesData,
} from '../types';

export interface RegistrosFilters {
  desde?: string;
  hasta?: string;
  estado?: string;
  operario_id?: number;
  producto?: string;
  productos?: string[];
  limit?: number;
  offset?: number;
}

export interface ReportesFilters {
  operario_id?: number;
  producto?: string;
  productos?: string[];
}

// Serializa array de nombres a "a,b,c" para el query param.
function serializeProductos(arr?: string[]): string | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr.join(',');
}

export const produccionApi = {
  // Operarios
  getOperarios: (): Promise<ApiResponse<Operario[]>> =>
    api.get('/produccion/operarios'),

  createOperario: (nombre: string): Promise<ApiResponse<Operario>> =>
    api.post('/produccion/operarios', { nombre }),

  deleteOperario: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/produccion/operarios/${id}`),

  // Registros
  getRegistros: (filters?: RegistrosFilters): Promise<ApiResponse<ProduccionRegistro[]>> => {
    const { productos, ...rest } = filters || {};
    return api.get('/produccion/registros', {
      params: { ...rest, productos: serializeProductos(productos) },
    });
  },

  saveRegistros: (registros: ProduccionRegistroInput[]): Promise<ApiResponse<ProduccionRegistro[]>> =>
    api.post('/produccion/registros', { registros }),

  updateRegistro: (id: number, data: ProduccionRegistroInput): Promise<ApiResponse<ProduccionRegistro>> =>
    api.put(`/produccion/registros/${id}`, data),

  deleteRegistro: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/produccion/registros/${id}`),

  // Borra todos los registros de un producto/subreceta dentro del rango (y filtros opcionales)
  deleteRegistrosByProducto: (params: {
    producto_nombre: string;
    desde: string;
    hasta: string;
    estado?: string;
    operario_id?: number;
  }): Promise<ApiResponse<{ eliminados: number; message: string }>> =>
    api.delete('/produccion/registros/by-producto', { params }),

  // Reportes
  getReportes: (desde: string, hasta: string, filters?: ReportesFilters): Promise<ApiResponse<ReporteData>> => {
    const { productos, ...rest } = filters || {};
    return api.get('/produccion/reportes', {
      params: { desde, hasta, ...rest, productos: serializeProductos(productos) },
    });
  },

  // Reporte de ingredientes consumidos
  getReporteIngredientes: (
    desde: string,
    hasta: string,
    buscar?: string,
    subreceta?: string,
    productos?: string[]
  ): Promise<ApiResponse<ReporteIngredientesData>> =>
    api.get('/produccion/reporte-ingredientes', {
      params: {
        desde,
        hasta,
        buscar: buscar || undefined,
        subreceta: subreceta || undefined,
        productos: serializeProductos(productos),
      },
    }),

  // Subrecetas que tuvieron consumo en el rango de fechas
  getSubrecetasUsadas: (desde: string, hasta: string): Promise<ApiResponse<string[]>> =>
    api.get('/produccion/subrecetas-usadas', { params: { desde, hasta } }),

  // Catalogo de productos + subrecetas (con tipo)
  getCatalogo: (): Promise<ApiResponse<ProductoCatalogo[]>> =>
    api.get('/produccion/productos-catalogo'),
};
