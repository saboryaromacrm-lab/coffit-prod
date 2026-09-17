import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriasApi } from '../api/categorias';
import type { CategoriaProducto, CategoriaIngrediente } from '../types';
import toast from 'react-hot-toast';

export function useCategoriasProductos() {
  return useQuery({
    queryKey: ['categorias', 'productos'],
    queryFn: () => categoriasApi.getProductos(),
  });
}

export function useCategoriasIngredientes() {
  return useQuery({
    queryKey: ['categorias', 'ingredientes'],
    queryFn: () => categoriasApi.getIngredientes(),
  });
}

export function useCreateCategoriaProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CategoriaProducto>) => categoriasApi.createProducto(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      toast.success('Categoria creada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateCategoriaProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CategoriaProducto> }) =>
      categoriasApi.updateProducto(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      toast.success('Categoria actualizada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCategoriaProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => categoriasApi.deleteProducto(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      toast.success('Categoria eliminada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateCategoriaIngrediente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CategoriaIngrediente>) => categoriasApi.createIngrediente(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      toast.success('Categoria creada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateCategoriaIngrediente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CategoriaIngrediente> }) =>
      categoriasApi.updateIngrediente(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      toast.success('Categoria actualizada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCategoriaIngrediente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => categoriasApi.deleteIngrediente(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      toast.success('Categoria eliminada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
