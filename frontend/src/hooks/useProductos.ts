import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productosApi, type ProductosFilters } from '../api/productos';
import toast from 'react-hot-toast';

export function useProductos(filters?: ProductosFilters) {
  return useQuery({
    queryKey: ['productos', filters],
    queryFn: () => productosApi.getAll(filters),
  });
}

export function useProducto(id: number | null) {
  return useQuery({
    queryKey: ['producto', id],
    queryFn: () => productosApi.getById(id!),
    enabled: !!id,
  });
}

export function useCreateProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: productosApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Producto creado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof productosApi.update>[1] }) =>
      productosApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Producto actualizado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => productosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Producto eliminado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
