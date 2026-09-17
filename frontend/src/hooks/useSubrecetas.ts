import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subrecetasApi } from '../api/subrecetas';
import toast from 'react-hot-toast';

export function useSubrecetas() {
  return useQuery({
    queryKey: ['subrecetas'],
    queryFn: () => subrecetasApi.getAll(),
  });
}

export function useCreateSubreceta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: subrecetasApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subrecetas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Subreceta creada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateSubreceta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof subrecetasApi.update>[1] }) =>
      subrecetasApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subrecetas'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Subreceta actualizada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteSubreceta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => subrecetasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subrecetas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Subreceta eliminada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
