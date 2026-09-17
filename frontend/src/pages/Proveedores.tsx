import { useState } from 'react';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { proveedoresApi } from '../api/proveedores';
import type { Proveedor } from '../types';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import SearchInput from '../components/common/SearchInput';

export default function Proveedores() {
  const [buscar, setBuscar] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['proveedores', buscar],
    queryFn: () => proveedoresApi.getAll(buscar || undefined),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => proveedoresApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['proveedores'] }); toast.success('Proveedor eliminado'); setDeleteId(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const proveedores: Proveedor[] = data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="w-full sm:flex-1 sm:max-w-sm">
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar proveedor..." />
        </div>
        <Button onClick={() => { setEditingId(null); setModalOpen(true); }} className="w-full sm:w-auto shrink-0"><Plus size={16} /> Nuevo</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : proveedores.length === 0 ? <EmptyState message="No hay proveedores" /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Telefono</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Email</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Direccion</th>
                <th className="px-4 py-3 font-medium text-right">Ingredientes</th>
                <th className="px-4 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium">{p.nombre}</td>
                  <td className="px-4 py-3 text-text-muted hidden sm:table-cell">{p.telefono || '-'}</td>
                  <td className="px-4 py-3 text-text-muted hidden md:table-cell">{p.email || '-'}</td>
                  <td className="px-4 py-3 text-text-muted max-w-[200px] truncate hidden lg:table-cell">{p.direccion || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-text-muted">
                      <Package size={12} /> {p.cantidad_ingredientes || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingId(p.id); setModalOpen(true); }} className="p-1.5 text-text-muted hover:text-primary cursor-pointer"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteId(p.id)} className="p-1.5 text-text-muted hover:text-danger cursor-pointer"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <ProveedorModal editingId={editingId} proveedores={proveedores} onClose={() => setModalOpen(false)} />}
      <ConfirmDialog isOpen={deleteId !== null} onClose={() => setDeleteId(null)} onConfirm={() => deleteId && deleteMut.mutate(deleteId)} title="Eliminar proveedor" message="Esta seguro?" loading={deleteMut.isPending} />
    </div>
  );
}

function ProveedorModal({ editingId, proveedores, onClose }: { editingId: number | null; proveedores: Proveedor[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const existing = editingId ? proveedores.find((p) => p.id === editingId) : null;

  const [nombre, setNombre] = useState(existing?.nombre || '');
  const [telefono, setTelefono] = useState(existing?.telefono || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [direccion, setDireccion] = useState(existing?.direccion || '');
  const [notas, setNotas] = useState(existing?.notas || '');

  const createMut = useMutation({
    mutationFn: () => proveedoresApi.create({ nombre, telefono: telefono || undefined, email: email || undefined, direccion: direccion || undefined, notas: notas || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['proveedores'] }); toast.success('Proveedor creado'); onClose(); },
    onError: (err: Error) => toast.error(err.message),
  });
  const updateMut = useMutation({
    mutationFn: () => proveedoresApi.update(editingId!, { nombre, telefono: telefono || undefined, email: email || undefined, direccion: direccion || undefined, notas: notas || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['proveedores'] }); toast.success('Proveedor actualizado'); onClose(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!nombre.trim()) return toast.error('Nombre es requerido');
    editingId ? updateMut.mutate() : createMut.mutate();
  };

  return (
    <Modal isOpen onClose={onClose} title={editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={handleSubmit} loading={createMut.isPending || updateMut.isPending}>{editingId ? 'Guardar' : 'Crear'}</Button></>}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Telefono</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Direccion</label>
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>
      </div>
    </Modal>
  );
}
