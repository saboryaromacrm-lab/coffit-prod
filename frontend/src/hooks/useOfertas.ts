import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ofertasApi } from '../api/ofertas';
import toast from 'react-hot-toast';

export function useOfertas() {
  return useQuery({
    queryKey: ['ofertas'],
    queryFn: () => ofertasApi.getAll(),
  });
}

export function useCreateOferta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ofertasApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ofertas'] });
      toast.success('Oferta creada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateOferta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof ofertasApi.update>[1] }) =>
      ofertasApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ofertas'] });
      toast.success('Oferta actualizada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteOferta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => ofertasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ofertas'] });
      toast.success('Oferta eliminada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
