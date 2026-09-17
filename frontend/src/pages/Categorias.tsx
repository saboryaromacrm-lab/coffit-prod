import { useState } from 'react';
import { Plus, Pencil, Trash2, CornerDownRight } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { categoriasApi } from '../api/categorias';
import type { CategoriaProducto, CategoriaIngrediente } from '../types';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import { soloRaices, hijasDe } from '../utils/categoriasTree';

type Tab = 'productos' | 'ingredientes';

export default function Categorias() {
  const [tab, setTab] = useState<Tab>('productos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Al crear desde el boton "↳" de una raiz, la nueva nace ya como subcategoria
  const [nuevaSubDe, setNuevaSubDe] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; type: Tab } | null>(null);
  const queryClient = useQueryClient();

  const { data: prodCats, isLoading: loadingProd } = useQuery({
    queryKey: ['categorias', 'productos'],
    queryFn: () => categoriasApi.getProductos(),
  });
  const { data: ingCats, isLoading: loadingIng } = useQuery({
    queryKey: ['categorias', 'ingredientes'],
    queryFn: () => categoriasApi.getIngredientes(),
  });

  const deleteProdMut = useMutation({
    mutationFn: (id: number) => categoriasApi.deleteProducto(id),
    onSuccess: (res) => {
      // Borrar una subcategoria puede mover productos -> refrescar todo lo que
      // deriva del arbol para que no quede nada desactualizado en pantalla.
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['carta'] });
      queryClient.invalidateQueries({ queryKey: ['carta-categorias'] });
      toast.success(res?.data?.message || 'Categoria eliminada');
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const deleteIngMut = useMutation({
    mutationFn: (id: number) => categoriasApi.deleteIngrediente(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categorias'] }); toast.success('Categoria eliminada'); setDeleteTarget(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const catsProd: CategoriaProducto[] = prodCats?.data || [];
  const catsIng: CategoriaIngrediente[] = ingCats?.data || [];
  const isLoading = tab === 'productos' ? loadingProd : loadingIng;

  const handleDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'productos') deleteProdMut.mutate(deleteTarget.id);
    else deleteIngMut.mutate(deleteTarget.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setTab('productos')} className={`px-3 py-1.5 text-sm rounded-md cursor-pointer transition-colors ${tab === 'productos' ? 'bg-white font-medium shadow-sm' : 'text-text-muted hover:text-text'}`}>
            Productos
          </button>
          <button onClick={() => setTab('ingredientes')} className={`px-3 py-1.5 text-sm rounded-md cursor-pointer transition-colors ${tab === 'ingredientes' ? 'bg-white font-medium shadow-sm' : 'text-text-muted hover:text-text'}`}>
            Ingredientes
          </button>
        </div>
        <Button onClick={() => { setNuevaSubDe(null); setEditingId(null); setModalOpen(true); }}><Plus size={16} /> Nueva</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : tab === 'productos' ? (
        catsProd.length === 0 ? <EmptyState message="No hay categorias de productos" /> : (
          <div className="space-y-2">
            <p className="text-xs text-text-muted">
              Una categoria puede tener <strong>subcategorias</strong> (ej: Dulces › Fit / Fat). Es opcional:
              los productos pueden quedarse en la categoria. Para convertir una categoria existente en
              subcategoria, editala y elegile una <strong>categoria padre</strong> — sus productos se mueven solos.
            </p>
            {soloRaices(catsProd).map((raiz) => {
              const hijas = hijasDe(catsProd, raiz.id);
              return (
                <div key={raiz.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="p-4 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl shrink-0">{raiz.icono || '📁'}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{raiz.nombre}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {raiz.color && <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: raiz.color }} />}
                          {hijas.length > 0 && (
                            <span className="text-[10px] text-text-muted">{hijas.length} subcategoria{hijas.length > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setNuevaSubDe(raiz.id); setEditingId(null); setModalOpen(true); }}
                        title="Agregar subcategoria"
                        className="p-1.5 text-text-muted hover:text-primary cursor-pointer"><CornerDownRight size={14} /></button>
                      <button onClick={() => { setNuevaSubDe(null); setEditingId(raiz.id); setModalOpen(true); }} className="p-1.5 text-text-muted hover:text-primary cursor-pointer"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteTarget({ id: raiz.id, type: 'productos' })} className="p-1.5 text-text-muted hover:text-danger cursor-pointer"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {hijas.length > 0 && (
                    <div className="border-t border-gray-100 bg-gray-50/60">
                      {hijas.map((h) => (
                        <div key={h.id} className="pl-12 pr-4 py-2.5 flex items-center justify-between gap-2 flex-wrap border-b border-gray-100 last:border-b-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-text-muted text-xs shrink-0">↳</span>
                            <span className="text-sm truncate">{h.nombre}</span>
                            {h.color && <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: h.color }} />}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => { setNuevaSubDe(null); setEditingId(h.id); setModalOpen(true); }} className="p-1.5 text-text-muted hover:text-primary cursor-pointer"><Pencil size={14} /></button>
                            <button onClick={() => setDeleteTarget({ id: h.id, type: 'productos' })} className="p-1.5 text-text-muted hover:text-danger cursor-pointer"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        catsIng.length === 0 ? <EmptyState message="No hay categorias de ingredientes" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {catsIng.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {c.color && <span className="inline-block w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: c.color }} />}
                  <p className="font-medium text-sm truncate">{c.nombre}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditingId(c.id); setModalOpen(true); }} className="p-1.5 text-text-muted hover:text-primary cursor-pointer"><Pencil size={14} /></button>
                  <button onClick={() => setDeleteTarget({ id: c.id, type: 'ingredientes' })} className="p-1.5 text-text-muted hover:text-danger cursor-pointer"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {modalOpen && (
        <CategoriaModal
          tab={tab}
          editingId={editingId}
          nuevaSubDe={nuevaSubDe}
          catsProd={catsProd}
          catsIng={catsIng}
          onClose={() => setModalOpen(false)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar categoria"
        message={
          deleteTarget?.type === 'productos'
            ? 'Ningun producto se elimina. Si es una subcategoria, sus productos pasan a la categoria principal. Si es una categoria principal con productos, primero tenes que reasignarlos.'
            : 'Esta seguro? Los elementos asociados no se eliminaran.'
        }
        loading={deleteProdMut.isPending || deleteIngMut.isPending}
      />
    </div>
  );
}

function CategoriaModal({ tab, editingId, nuevaSubDe, catsProd, catsIng, onClose }: {
  tab: Tab;
  editingId: number | null;
  nuevaSubDe: number | null;
  catsProd: CategoriaProducto[];
  catsIng: CategoriaIngrediente[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isProduct = tab === 'productos';

  const existingProd = isProduct && editingId ? catsProd.find((c) => c.id === editingId) : null;
  const existingIng = !isProduct && editingId ? catsIng.find((c) => c.id === editingId) : null;

  const [nombre, setNombre] = useState(existingProd?.nombre || existingIng?.nombre || '');
  const [color, setColor] = useState(existingProd?.color || existingIng?.color || '#E07B39');
  const [icono, setIcono] = useState(existingProd?.icono || '📁');
  const [orden, setOrden] = useState(existingProd?.orden || 0);
  const [parentId, setParentId] = useState<string>(
    existingProd ? (existingProd.parent_id?.toString() || '') : (nuevaSubDe?.toString() || '')
  );

  // Padres posibles: solo raices, sin la categoria que estoy editando.
  // Si la categoria YA tiene subcategorias no puede volverse hija (2 niveles).
  const tieneHijasPropias = editingId != null && catsProd.some((c) => c.parent_id === editingId);
  const padresPosibles = catsProd.filter((c) => c.parent_id == null && c.id !== editingId);

  const commonEmojis = ['☕', '🍰', '🥐', '🥤', '🍕', '🥗', '🧁', '🍞', '🥪', '🍩', '🎂', '🍪', '📁', '⭐', '🔥', '❄️'];

  const payloadProd = () => ({
    nombre, color, icono, orden,
    parent_id: parentId ? Number(parentId) : null,
  });

  const createProdMut = useMutation({
    mutationFn: () => categoriasApi.createProducto(payloadProd()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categorias'] }); toast.success('Categoria creada'); onClose(); },
    onError: (err: Error) => toast.error(err.message),
  });
  const updateProdMut = useMutation({
    mutationFn: () => categoriasApi.updateProducto(editingId!, payloadProd()),
    onSuccess: () => {
      // La categoria efectiva de productos y carta se deriva de este arbol:
      // invalidar ambas para que el cambio se vea al instante en toda la app.
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['carta'] });
      queryClient.invalidateQueries({ queryKey: ['carta-categorias'] });
      toast.success('Categoria actualizada');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const createIngMut = useMutation({
    mutationFn: () => categoriasApi.createIngrediente({ nombre, color }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categorias'] }); toast.success('Categoria creada'); onClose(); },
    onError: (err: Error) => toast.error(err.message),
  });
  const updateIngMut = useMutation({
    mutationFn: () => categoriasApi.updateIngrediente(editingId!, { nombre, color }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categorias'] }); toast.success('Categoria actualizada'); onClose(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!nombre.trim()) return toast.error('Nombre es requerido');
    if (isProduct) {
      editingId ? updateProdMut.mutate() : createProdMut.mutate();
    } else {
      editingId ? updateIngMut.mutate() : createIngMut.mutate();
    }
  };

  const isPending = createProdMut.isPending || updateProdMut.isPending || createIngMut.isPending || updateIngMut.isPending;

  return (
    <Modal isOpen onClose={onClose} title={editingId ? 'Editar Categoria' : 'Nueva Categoria'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={handleSubmit} loading={isPending}>{editingId ? 'Guardar' : 'Crear'}</Button></>}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer" />
            <span className="text-sm text-text-muted">{color}</span>
          </div>
        </div>

        {isProduct && (
          <>
            {/* Pertenece a = convertir en subcategoria. Los productos viajan
                solos porque apuntan a la fila, no al nombre. */}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Pertenece a</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={tieneHijasPropias}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">— Es una categoria principal —</option>
                {padresPosibles.map((c) => (
                  <option key={c.id} value={c.id}>Subcategoria de: {c.icono} {c.nombre}</option>
                ))}
              </select>
              <p className="text-[11px] text-text-muted mt-1">
                {tieneHijasPropias
                  ? 'Esta categoria ya tiene subcategorias propias, por eso no puede volverse subcategoria (max. 2 niveles).'
                  : parentId
                    ? 'Al guardar, todos sus productos quedan dentro de esa categoria. No se edita ni un producto.'
                    : 'Dejalo asi para que sea una categoria principal.'}
              </p>
            </div>
            {/* El icono lo pone SIEMPRE la categoria raiz: en una subcategoria
                seria un campo que no se muestra en ningun lado. */}
            {!parentId && (
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Icono</label>
                <div className="flex flex-wrap gap-2">
                  {commonEmojis.map((e) => (
                    <button key={e} onClick={() => setIcono(e)} className={`text-xl p-1.5 rounded-lg cursor-pointer transition-colors ${icono === e ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-gray-100'}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Orden</label>
              <input type="number" min="0" value={orden} onChange={(e) => setOrden(parseInt(e.target.value) || 0)} className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
