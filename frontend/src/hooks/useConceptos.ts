import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conceptosApi } from '../api/conceptos';
import toast from 'react-hot-toast';

export function useConceptos() {
  return useQuery({
    queryKey: ['conceptos'],
    queryFn: () => conceptosApi.getAll(),
  });
}

export function useCreateConcepto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: conceptosApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Concepto creado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateConcepto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof conceptosApi.update>[1] }) =>
      conceptosApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Concepto actualizado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteConcepto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => conceptosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos'] });
      toast.success('Concepto eliminado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
