import { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Link2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { subrecetasApi } from '../api/subrecetas';
import type { Subreceta } from '../types';
import { formatMoney } from '../utils/formatters';
import { normalizarTexto } from '../utils/normalizers';
import Button from '../components/common/Button';
import SearchInput from '../components/common/SearchInput';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import UsoSubrecetaModal from '../components/subrecetas/UsoSubrecetaModal';
import SubrecetaModal from '../components/subrecetas/SubrecetaModal';
import { useDebounce } from '../hooks/useDebounce';

export default function Subrecetas() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [usoSubreceta, setUsoSubreceta] = useState<{ id: number; nombre: string } | null>(null);
  const [buscar, setBuscar] = useState('');
  const debouncedBuscar = useDebounce(buscar);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openIdProcessed, setOpenIdProcessed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['subrecetas'],
    queryFn: () => subrecetasApi.getAll(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => subrecetasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subrecetas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Subreceta eliminada');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const allSubrecetas: Subreceta[] = data?.data || [];

  const subrecetas = useMemo(() => {
    if (!debouncedBuscar) return allSubrecetas;
    const term = normalizarTexto(debouncedBuscar);
    return allSubrecetas.filter((s) => normalizarTexto(s.nombre).includes(term));
  }, [allSubrecetas, debouncedBuscar]);

  // Deep-link ?openId=N (desde Ingredientes -> "Ver recetas").
  // Espera a que la lista cargue antes de abrir el modal.
  useEffect(() => {
    if (openIdProcessed) return;
    const openIdRaw = searchParams.get('openId');
    if (!openIdRaw) {
      setOpenIdProcessed(true);
      return;
    }
    if (allSubrecetas.length === 0) return;

    const id = Number(openIdRaw);
    if (!Number.isNaN(id) && allSubrecetas.some((s) => s.id === id)) {
      setEditingId(id);
      setModalOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('openId');
    setSearchParams(next, { replace: true });
    setOpenIdProcessed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSubrecetas, openIdProcessed]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="w-full sm:flex-1 sm:min-w-[200px]">
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar subreceta..." />
        </div>
        <Button onClick={() => { setEditingId(null); setModalOpen(true); }}>
          <Plus size={16} /> Nueva
        </Button>
      </div>

      {isLoading ? <LoadingSpinner /> : subrecetas.length === 0 ? <EmptyState message="No hay subrecetas" /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium text-right">Rendimiento</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Tipo</th>
                <th className="px-4 py-3 font-medium text-right">Costo Total</th>
                <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Costo/100g</th>
                <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Ingredientes</th>
                <th className="px-4 py-3 font-medium w-28"></th>
              </tr>
            </thead>
            <tbody>
              {subrecetas.map((sub) => (
                <tr key={sub.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium">{sub.nombre}</td>
                  <td className="px-4 py-3 text-right">{sub.rendimiento_gramos}</td>
                  <td className="px-4 py-3 text-text-muted hidden sm:table-cell">{sub.tipo_rendimiento}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(sub.costo_total)}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">{formatMoney(sub.costo_por_100g)}</td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">{sub.ingredientes?.length || 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setUsoSubreceta({ id: sub.id, nombre: sub.nombre })}
                        className="p-1.5 text-text-muted hover:text-blue-600 cursor-pointer"
                        title="Ver los productos que usan esta subreceta"
                      >
                        <Link2 size={14} />
                      </button>
                      <button onClick={() => { setEditingId(sub.id); setModalOpen(true); }} className="p-1.5 text-text-muted hover:text-primary cursor-pointer">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteId(sub.id)} className="p-1.5 text-text-muted hover:text-danger cursor-pointer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {usoSubreceta && (
        <UsoSubrecetaModal
          subrecetaId={usoSubreceta.id}
          nombre={usoSubreceta.nombre}
          onClose={() => setUsoSubreceta(null)}
        />
      )}

      {modalOpen && (
        <SubrecetaModal
          subrecetaId={editingId}
          subrecetas={allSubrecetas}
          onClose={() => setModalOpen(false)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar subreceta"
        message="Esta seguro que desea eliminar esta subreceta?"
        loading={deleteMut.isPending}
      />
    </div>
  );
}
