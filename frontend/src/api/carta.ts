import api from './axios';
import type {
  ApiResponse, CartaItem, CartaResumen, CartaSugerencia, CartaCategoria, CartaAutoMapResult,
  CartaMapeoProductos, CartaMapeoOfertas, VarianteTamano, VarianteSabor, VarianteTopping,
  VarianteAdicionInput, AdicionDisponible,
} from '../types';

export interface CartaFilters {
  categoria?: string;
  subcategoria?: string; // '__sin__' = los que no tienen subcategoria
  buscar?: string;
  estado?: 'sin_mapear' | 'con_costo' | 'sin_costo' | 'mapeado';
  incluir_desactivados?: number;
  solo_nuevos?: number;
}

export interface CartaItemInput {
  nombre: string;
  precio_venta: number;
  precio_manual?: number;
  categoria?: string | null;
  subcategoria?: string | null;
  etiqueta?: string | null;
  descripcion?: string | null;
  imagen?: string | null;
  frio_caliente?: number;
  tamanos?: VarianteTamano[];
  sabores?: VarianteSabor[];
  toppings?: VarianteTopping[];
  adiciones?: VarianteAdicionInput[];
  fecha_lanzamiento?: string | null;
  destacado?: number;
  desactivar?: number;
}

export const cartaApi = {
  getAll: (filters?: CartaFilters): Promise<ApiResponse<CartaItem[]>> =>
    api.get('/carta', { params: filters }),

  getResumen: (): Promise<ApiResponse<CartaResumen>> =>
    api.get('/carta/resumen'),

  getCategorias: (): Promise<ApiResponse<CartaCategoria[]>> =>
    api.get('/carta/categorias'),

  // Reverse lookup para la pagina Productos (que productos estan en la carta).
  getMapeoProductos: (): Promise<ApiResponse<CartaMapeoProductos>> =>
    api.get('/carta/mapeo-productos'),

  // Reverse lookup para Promos/Boxs (que promos ya estan en la carta).
  getMapeoOfertas: (): Promise<ApiResponse<CartaMapeoOfertas>> =>
    api.get('/carta/mapeo-ofertas'),

  // Productos de la categoria "Adiciones" (para el editor de items).
  getAdicionesDisponibles: (): Promise<ApiResponse<AdicionDisponible[]>> =>
    api.get('/carta/adiciones-disponibles'),

  getSugerencias: (id: number): Promise<ApiResponse<CartaSugerencia[]>> =>
    api.get(`/carta/${id}/sugerencias`),

  mapear: (id: number, producto_id: number | null): Promise<ApiResponse<{ id: number; producto_id: number | null }>> =>
    api.put(`/carta/${id}/mapear`, { producto_id }),

  // Mapear a una PROMO/oferta (excluyente con producto).
  mapearOferta: (id: number, oferta_id: number | null): Promise<ApiResponse<{ id: number; oferta_id: number | null }>> =>
    api.put(`/carta/${id}/mapear-oferta`, { oferta_id }),

  autoMapear: (opts?: { umbral?: number; solo_sin_mapear?: boolean; dry_run?: boolean }): Promise<ApiResponse<CartaAutoMapResult>> =>
    api.post('/carta/auto-mapear', opts || {}),

  // Migracion una-vez: pasa variantes legacy a JSON + siembra fecha_lanzamiento.
  normalizarVariantes: (): Promise<ApiResponse<{ migrados: number; message: string }>> =>
    api.post('/carta/normalizar-variantes', {}),

  // Crea (o devuelve) el item de carta de un producto. Mapeo inverso.
  fromProducto: (productoId: number): Promise<ApiResponse<{ id: number; ya_existia: boolean }>> =>
    api.post(`/carta/from-producto/${productoId}`, {}),

  update: (id: number, data: CartaItemInput): Promise<ApiResponse<{ message: string }>> =>
    api.put(`/carta/${id}`, data),

  create: (data: CartaItemInput & { producto_id?: number | null; oferta_id?: number | null }): Promise<ApiResponse<{ id: number }>> =>
    api.post('/carta', data),

  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/carta/${id}`),
};
