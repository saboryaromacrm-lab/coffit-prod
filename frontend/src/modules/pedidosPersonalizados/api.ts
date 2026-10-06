import api from '../../api/axios';
import type { ApiResponse } from '../../types';
import type {
  ProductoEditor, ProductoResumen, Grupo, Simulacion, Combinacion, IdOpcion,
  PedidoResumen, PedidoDetalle, EstadoPedido, EstadoIntegracion, InformeImport,
} from './types';

// Producto a simular: uno guardado o el borrador del editor sin guardar.
type Simulable = { producto_id: number } | { borrador: ProductoEditor };

export const ppApi = {
  getProductos: (): Promise<ApiResponse<ProductoResumen[]>> => api.get('/pp/productos'),
  getProducto: (id: number): Promise<ApiResponse<ProductoEditor>> => api.get(`/pp/productos/${id}`),
  guardarProducto: (p: ProductoEditor): Promise<ApiResponse<ProductoEditor>> =>
    p.id ? api.put(`/pp/productos/${p.id}`, p) : api.post('/pp/productos', p),
  borrarProducto: (id: number): Promise<ApiResponse<{ borrado: boolean }>> => api.delete(`/pp/productos/${id}`),

  getGrupos: (): Promise<ApiResponse<Grupo[]>> => api.get('/pp/grupos'),
  guardarGrupo: (g: Grupo): Promise<ApiResponse<Grupo>> =>
    g.id ? api.put(`/pp/grupos/${g.id}`, g) : api.post('/pp/grupos', g),
  borrarGrupo: (id: number): Promise<ApiResponse<{ borrado: boolean }>> => api.delete(`/pp/grupos/${id}`),

  simular: (p: Simulable, opciones: IdOpcion[]): Promise<ApiResponse<Simulacion>> =>
    api.post('/pp/simular', { ...p, opciones }),
  combinaciones: (p: Simulable): Promise<ApiResponse<{ truncado: boolean; combinaciones: Combinacion[] }>> =>
    api.post('/pp/combinaciones', p),

  getPedidos: (params: { estado?: string; desde?: string; hasta?: string }): Promise<ApiResponse<PedidoResumen[]>> =>
    api.get('/pp/pedidos', { params }),
  getPedido: (id: number): Promise<ApiResponse<PedidoDetalle>> => api.get(`/pp/pedidos/${id}`),
  cambiarEstado: (id: number, estado: EstadoPedido): Promise<ApiResponse<{ estado: EstadoPedido }>> =>
    api.patch(`/pp/pedidos/${id}/estado`, { estado }),

  getEstado: (): Promise<ApiResponse<EstadoIntegracion>> => api.get('/pp/estado'),
  // Puede tardar: trae el catalogo entero de la tienda.
  importar: (): Promise<ApiResponse<InformeImport>> => api.post('/pp/importar', {}, { timeout: 120000 }),
};
