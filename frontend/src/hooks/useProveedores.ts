import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { proveedoresApi } from '../api/proveedores';
import type { Proveedor } from '../types';
import toast from 'react-hot-toast';

export function useProveedores(buscar?: string) {
  return useQuery({
    queryKey: ['proveedores', buscar],
    queryFn: () => proveedoresApi.getAll(buscar),
  });
}

export function useCreateProveedor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Proveedor>) => proveedoresApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Proveedor creado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateProveedor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Proveedor> }) =>
      proveedoresApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Proveedor actualizado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteProveedor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => proveedoresApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Proveedor eliminado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
