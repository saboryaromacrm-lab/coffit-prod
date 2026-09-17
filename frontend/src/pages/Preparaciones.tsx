import { useState } from 'react';
import { Pencil, Plus, Trash2, ChefHat, Flame, AlertTriangle, Maximize2, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { preparacionesApi } from '../api/preparaciones';
import type { PreparacionDetalle, PreparacionReceta, PreparacionCategoria } from '../api/preparaciones';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';

type TipoReceta = 'producto' | 'subreceta';

export default function Preparaciones() {
  const [tipo, setTipo] = useState<TipoReceta>('producto');
  const [categoriaId, setCategoriaId] = useState('');
  const [recetaId, setRecetaId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const queryClient = useQueryClient();

  // Fetch list of recipes
  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['preparaciones', 'list', tipo, categoriaId],
    queryFn: () => preparacionesApi.getList({
      tipo: tipo === 'subreceta' ? 'subrecetas' : undefined,
      categoria_id: categoriaId ? Number(categoriaId) : undefined,
    }),
  });

  // Fetch detail when recipe selected
  const { data: detalleData, isLoading: loadingDetalle } = useQuery({
    queryKey: ['preparaciones', 'detalle', tipo, recetaId],
    queryFn: () => preparacionesApi.getDetalle(tipo, recetaId!),
    enabled: recetaId !== null,
  });

  const listResponse = listData?.data;
  const recetas: PreparacionReceta[] = Array.isArray(listResponse)
    ? listResponse
    : listResponse?.recetas || [];
  const categorias: PreparacionCategoria[] = Array.isArray(listResponse)
    ? []
    : listResponse?.categorias || [];
  const detalle: PreparacionDetalle | null = detalleData?.data || null;

  const handleTipoChange = (newTipo: TipoReceta) => {
    setTipo(newTipo);
    setCategoriaId('');
    setRecetaId(null);
  };

  const pasos = detalle?.preparacion
    ? detalle.preparacion.split('\n').filter((p) => p.trim())
    : [];

  const tenerEnCuentaLines = detalle?.tener_en_cuenta
    ? detalle.tener_en_cuenta.split('\n').filter((l) => l.trim())
    : [];

  // Card content - reused in normal and fullscreen mode
  const cardContent = detalle && (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold">{detalle.nombre}</h2>
        <div className="flex flex-wrap gap-3 text-sm text-text-muted mt-1">
          {detalle.categoria_nombre && <span>{detalle.categoria_icono} {detalle.categoria_nombre}</span>}
          {/* Rendimiento:
              - Subrecetas: usar rendimiento + tipo_rendimiento (g | porciones)
              - Productos: usar porciones */}
          {tipo === 'subreceta' && detalle.rendimiento != null && Number(detalle.rendimiento) > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
              ⚖️ Rinde {Number(detalle.rendimiento)}
              {detalle.tipo_rendimiento === 'porciones' ? ' porciones' : ' g'}
            </span>
          )}
          {tipo === 'producto' && detalle.porciones != null && Number(detalle.porciones) > 0 && (
            <span>{detalle.porciones} porciones</span>
          )}
        </div>
      </div>

      {/* Ingredientes */}
      <section className="bg-orange-50/50 border border-orange-100 rounded-lg p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <span>🥣</span> Ingredientes
        </h3>
        {detalle.ingredientes.length === 0 ? (
          <p className="text-sm text-text-muted">Sin ingredientes cargados</p>
        ) : (
          <div className="space-y-1.5">
            {detalle.ingredientes.map((ing, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className={ing.es_subreceta ? 'text-blue-600 font-medium' : ''}>
                  {ing.es_subreceta ? '📦 ' : '• '}{ing.nombre}
                </span>
                <span className="text-text-muted font-mono text-xs">
                  {Number(ing.cantidad).toFixed(ing.cantidad % 1 === 0 ? 0 : 2)} {ing.unidad}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Preparacion */}
      <section className="bg-blue-50/50 border border-blue-100 rounded-lg p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <ChefHat size={16} /> Preparacion
        </h3>
        {pasos.length === 0 ? (
          <p className="text-sm text-text-muted italic">Sin pasos de preparacion cargados</p>
        ) : (
          <ol className="space-y-2">
            {pasos.map((paso, idx) => (
              <li key={idx} className="flex gap-3 text-sm">
                <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                  {idx + 1}
                </span>
                <span className="pt-0.5">{paso}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Coccion */}
      {(detalle.coccion || tipo === 'producto') && (
        <section className="bg-red-50/50 border border-red-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Flame size={16} className="text-red-500" /> Coccion
          </h3>
          {detalle.coccion ? (
            <p className="text-sm">{detalle.coccion}</p>
          ) : (
            <p className="text-sm text-text-muted italic">Sin instrucciones de coccion</p>
          )}
        </section>
      )}

      {/* A tener en cuenta */}
      {(tenerEnCuentaLines.length > 0 || tipo === 'producto') && (
        <section className="bg-yellow-50/50 border border-yellow-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-yellow-600" /> A tener en cuenta
          </h3>
          {tenerEnCuentaLines.length === 0 ? (
            <p className="text-sm text-text-muted italic">Sin notas</p>
          ) : (
            <ul className="space-y-1">
              {tenerEnCuentaLines.map((line, idx) => (
                <li key={idx} className="text-sm flex gap-2">
                  <span className="text-yellow-600">⚠️</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button onClick={() => setEditOpen(true)}>
          <Pencil size={14} /> Editar
        </Button>
        <Button variant="secondary" onClick={() => setFullscreen(true)}>
          <Maximize2 size={14} /> Pantalla Completa
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={tipo}
          onChange={(e) => handleTipoChange(e.target.value as TipoReceta)}
          className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg font-medium"
        >
          <option value="producto">Productos</option>
          <option value="subreceta">Subrecetas</option>
        </select>

        {tipo === 'producto' && (
          <select
            value={categoriaId}
            onChange={(e) => { setCategoriaId(e.target.value); setRecetaId(null); }}
            className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg"
          >
            <option value="">Todas las categorias</option>
            {/* Una categoria principal incluye sus subcategorias */}
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id == null ? `${c.icono} ${c.nombre}` : `   ↳ ${c.nombre}`}
              </option>
            ))}
          </select>
        )}

        <select
          value={recetaId || ''}
          onChange={(e) => setRecetaId(e.target.value ? Number(e.target.value) : null)}
          className="w-full sm:flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg sm:min-w-[200px]"
        >
          <option value="">Seleccionar receta...</option>
          {recetas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre} {r.tiene_preparacion ? '✅' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {loadingList ? <LoadingSpinner /> : !recetaId ? (
        <EmptyState message="Selecciona una receta para ver su preparacion" />
      ) : loadingDetalle ? (
        <LoadingSpinner />
      ) : !detalle ? (
        <EmptyState message="No se encontro la receta" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-6 max-w-3xl">
          {cardContent}
        </div>
      )}

      {/* Edit Modal */}
      {editOpen && detalle && (
        <EditPreparacionModal
          tipo={tipo}
          detalle={detalle}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['preparaciones'] });
            setEditOpen(false);
          }}
        />
      )}

      {/* Fullscreen Modal */}
      {fullscreen && detalle && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto p-4 sm:p-8">
          <button
            onClick={() => setFullscreen(false)}
            className="fixed top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full cursor-pointer z-50"
          >
            <X size={20} />
          </button>
          <div className="max-w-3xl mx-auto">
            {cardContent}
          </div>
        </div>
      )}
    </div>
  );
}

function EditPreparacionModal({ tipo, detalle, onClose, onSaved }: {
  tipo: TipoReceta;
  detalle: PreparacionDetalle;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialPasos = detalle.preparacion
    ? detalle.preparacion.split('\n').filter((p) => p.trim())
    : [''];

  const [pasos, setPasos] = useState<string[]>(initialPasos.length > 0 ? initialPasos : ['']);
  const [coccion, setCoccion] = useState(detalle.coccion || '');
  const [tenerEnCuenta, setTenerEnCuenta] = useState(detalle.tener_en_cuenta || '');

  const updatePaso = (idx: number, value: string) => {
    const newPasos = [...pasos];
    newPasos[idx] = value;
    setPasos(newPasos);
  };

  const addPaso = () => setPasos([...pasos, '']);

  const removePaso = (idx: number) => {
    if (pasos.length <= 1) return;
    setPasos(pasos.filter((_, i) => i !== idx));
  };

  const movePaso = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= pasos.length) return;
    const newPasos = [...pasos];
    [newPasos[idx], newPasos[newIdx]] = [newPasos[newIdx], newPasos[idx]];
    setPasos(newPasos);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const preparacionText = pasos.filter((p) => p.trim()).join('\n');
      return preparacionesApi.update(tipo, detalle.id, {
        preparacion: preparacionText,
        coccion: coccion || undefined,
        tener_en_cuenta: tenerEnCuenta || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Preparacion guardada');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Modal isOpen onClose={onClose} title={`Editar preparacion - ${detalle.nombre}`} size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => saveMut.mutate()} loading={saveMut.isPending}>Guardar</Button></>}>
      <div className="space-y-5">
        {/* Pasos de preparacion */}
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-2">Pasos de preparacion</label>
          <div className="space-y-2">
            {pasos.map((paso, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-2">
                  {idx + 1}
                </span>
                <input
                  value={paso}
                  onChange={(e) => updatePaso(idx, e.target.value)}
                  placeholder={`Paso ${idx + 1}...`}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => movePaso(idx, -1)}
                    disabled={idx === 0}
                    className="text-text-muted hover:text-primary disabled:opacity-30 cursor-pointer text-xs"
                    title="Mover arriba"
                  >▲</button>
                  <button
                    onClick={() => movePaso(idx, 1)}
                    disabled={idx === pasos.length - 1}
                    className="text-text-muted hover:text-primary disabled:opacity-30 cursor-pointer text-xs"
                    title="Mover abajo"
                  >▼</button>
                </div>
                <button
                  onClick={() => removePaso(idx)}
                  disabled={pasos.length <= 1}
                  className="p-1.5 text-text-muted hover:text-danger disabled:opacity-30 cursor-pointer mt-1.5"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addPaso}
            className="mt-2 text-xs text-primary hover:underline cursor-pointer flex items-center gap-1"
          >
            <Plus size={12} /> Agregar paso
          </button>
        </div>

        {/* Coccion (solo para productos) */}
        {tipo === 'producto' && (
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Coccion</label>
            <textarea
              value={coccion}
              onChange={(e) => setCoccion(e.target.value)}
              rows={2}
              placeholder="Ej: Horno 180°C por 45 minutos"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        )}

        {/* A tener en cuenta (solo para productos) */}
        {tipo === 'producto' && (
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">A tener en cuenta</label>
            <textarea
              value={tenerEnCuenta}
              onChange={(e) => setTenerEnCuenta(e.target.value)}
              rows={3}
              placeholder="Notas importantes, tips, advertencias (una por linea)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
