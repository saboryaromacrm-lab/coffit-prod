import api from './axios';
import type { CategoriaIngrediente, CategoriaProducto, ApiResponse } from '../types';

export const categoriasApi = {
  getIngredientes: (): Promise<ApiResponse<CategoriaIngrediente[]>> =>
    api.get('/categorias/ingredientes'),
  getProductos: (): Promise<ApiResponse<CategoriaProducto[]>> =>
    api.get('/categorias/productos'),
  createProducto: (data: Partial<CategoriaProducto>): Promise<ApiResponse<CategoriaProducto>> =>
    api.post('/categorias/productos', data),
  updateProducto: (id: number, data: Partial<CategoriaProducto>): Promise<ApiResponse<CategoriaProducto>> =>
    api.put(`/categorias/productos/${id}`, data),
  deleteProducto: (id: number): Promise<ApiResponse<{ message: string; productos_movidos: number }>> =>
    api.delete(`/categorias/productos/${id}`),
  createIngrediente: (data: Partial<CategoriaIngrediente>): Promise<ApiResponse<CategoriaIngrediente>> =>
    api.post('/categorias/ingredientes', data),
  updateIngrediente: (id: number, data: Partial<CategoriaIngrediente>): Promise<ApiResponse<CategoriaIngrediente>> =>
    api.put(`/categorias/ingredientes/${id}`, data),
  deleteIngrediente: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/categorias/ingredientes/${id}`),
};
