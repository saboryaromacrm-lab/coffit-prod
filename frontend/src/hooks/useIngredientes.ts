import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ingredientesApi } from '../api/ingredientes';
import type { Ingrediente } from '../types';
import toast from 'react-hot-toast';

export function useIngredientes(filtros?: Record<string, string>) {
  return useQuery({
    queryKey: ['ingredientes', filtros],
    queryFn: () => ingredientesApi.getAll(filtros),
  });
}

export function useCreateIngrediente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Ingrediente>) => ingredientesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredientes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Ingrediente creado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateIngrediente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Ingrediente> }) =>
      ingredientesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredientes'] });
      queryClient.invalidateQueries({ queryKey: ['subrecetas'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Ingrediente actualizado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteIngrediente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => ingredientesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredientes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Ingrediente eliminado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
