import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Trash2, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import NumericInput from '../../components/common/NumericInput';
import ImagenUploader from '../../components/common/ImagenUploader';
import RecetaEditor from './RecetaEditor';
import PasoEditor from './PasoEditor';
import { nuevaKey, refOpcion, opcionVacia, textoCosto } from './utils';
import Simulador from './Simulador';
import { ppApi } from './api';
import type { PasoEditor as Paso, ProductoEditor } from './types';

const productoVacio = (): ProductoEditor => ({
  nombre: '', descripcion: null, categoria: null, imagen: null, emoji: null, precio_base: 0,
  etiquetas: [], es_congelado: false, activo: true, receta: [], pasos: [],
});

const input = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30';

interface Props {
  productoId: number | null; // null = producto nuevo
  categorias: string[];
  onVolver: () => void;
  onCreado: (id: number) => void;
}

// Carga el producto y monta el formulario con ese estado inicial (el key
// remonta el formulario si cambia de producto, sin efectos que copien props
// al estado).
export default function EditorProducto({ productoId, categorias, onVolver, onCreado }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['pp-producto', productoId],
    queryFn: () => ppApi.getProducto(productoId!),
    enabled: productoId != null,
    staleTime: 0,
  });

  if (productoId != null && isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;
  if (productoId != null && (error || !data?.data)) {
    return <p className="text-danger text-sm">{(error as Error)?.message || 'Producto no encontrado'}</p>;
  }
  return (
    <Formulario key={productoId ?? 'nuevo'} inicial={data?.data ?? productoVacio()}
      categorias={categorias} onVolver={onVolver} onCreado={onCreado} />
  );
}

function Formulario({ inicial, categorias, onVolver, onCreado }: { inicial: ProductoEditor } & Omit<Props, 'productoId'>) {
  const qc = useQueryClient();
  const [producto, setProducto] = useState<ProductoEditor>(inicial);
  const [sucio, setSucio] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const { data: gruposData } = useQuery({ queryKey: ['pp-grupos'], queryFn: ppApi.getGrupos });
  const grupos = gruposData?.data || [];

  // Avisar antes de cerrar la pestana con cambios sin guardar.
  useEffect(() => {
    if (!sucio) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sucio]);

  const cambiar = (cambios: Partial<ProductoEditor>) => {
    setProducto((p) => ({ ...p, ...cambios }));
    setSucio(true);
  };
  const setPaso = (i: number, paso: Paso) => cambiar({ pasos: producto.pasos.map((p, j) => (j === i ? paso : p)) });
  const moverPaso = (i: number, delta: -1 | 1) => {
    const pasos = [...producto.pasos];
    [pasos[i], pasos[i + delta]] = [pasos[i + delta], pasos[i]];
    cambiar({ pasos });
  };
  // Al borrar una opcion, las que dependian de ella pasan a "siempre".
  const sinDependenciasA = (pasos: Paso[], refs: Set<string>) => pasos.map((p) => ({
    ...p,
    opciones: p.opciones.map((o) => (o.depende_de != null && refs.has(String(o.depende_de)) ? { ...o, depende_de: null } : o)),
  }));
  const borrarOpcion = (i: number, r: string) => {
    const pasos = producto.pasos.map((p, j) => (j === i ? { ...p, opciones: p.opciones.filter((o) => refOpcion(o) !== r) } : p));
    cambiar({ pasos: sinDependenciasA(pasos, new Set([r])) });
  };
  const borrarPaso = (i: number) => {
    const refs = new Set(producto.pasos[i].opciones.map(refOpcion));
    cambiar({ pasos: sinDependenciasA(producto.pasos.filter((_, j) => j !== i), refs) });
  };
  const agregarPaso = (plantilla: Partial<Paso>) => cambiar({
    pasos: [...producto.pasos, { key: nuevaKey(), nombre: '', min_sel: 1, max_sel: 1, grupo_id: null, ajustes: [], opciones: [opcionVacia()], ...plantilla }],
  });

  // Opciones de los pasos anteriores a cada paso (para "solo si eligio").
  // Si una depende a su vez de otra se aclara de cual ("Unico tamano (Bruce)"),
  // si no hay varias con el mismo nombre y no se distinguen.
  const anterioresDe = useMemo(() => {
    const nombrePorRef = new Map(producto.pasos.flatMap((p) => p.opciones.map((o) => [refOpcion(o), o.nombre] as const)));
    return producto.pasos.map((_, i) =>
      producto.pasos.slice(0, i).flatMap((p) => p.opciones
        .filter((o) => o.nombre.trim())
        .map((o) => {
          const padre = o.depende_de == null ? null : nombrePorRef.get(String(o.depende_de));
          return { ref: refOpcion(o), etiqueta: `${p.nombre || 'Paso'}: ${o.nombre}${padre ? ` (${padre})` : ''}` };
        }))
    );
  }, [producto.pasos]);

  const guardar = useMutation({
    mutationFn: () => ppApi.guardarProducto(producto),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pp-productos'] });
      qc.invalidateQueries({ queryKey: ['pp-estado'] });
      setSucio(false);
      toast.success('Producto guardado');
      if (!producto.id && res.data.id) onCreado(res.data.id);
      else setProducto(res.data); // ids reales de lo nuevo
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const borrar = useMutation({
    mutationFn: () => ppApi.borrarProducto(producto.id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pp-productos'] });
      toast.success('Producto borrado');
      onVolver();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const volver = () => {
    if (sucio && !window.confirm('Hay cambios sin guardar. ¿Salir igual?')) return;
    onVolver();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={volver} className="p-2 -ml-2 text-text-muted hover:text-text-primary" title="Volver">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-bold flex-1 min-w-0 truncate">{producto.nombre || 'Producto nuevo'}</h2>
        {sucio && <span className="text-xs text-amber-700">Sin guardar</span>}
        {producto.id && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmarBorrar(true)}><Trash2 size={15} /> Borrar</Button>
        )}
        <Button onClick={() => guardar.mutate()} loading={guardar.isPending} disabled={!producto.nombre.trim()}>
          <Save size={15} /> Guardar
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="space-y-4 min-w-0">
          {/* Datos */}
          <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_200px_80px]">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
                <input value={producto.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} className={input} placeholder="Ej. Budín" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Categoría</label>
                <input value={producto.categoria || ''} onChange={(e) => cambiar({ categoria: e.target.value || null })} list="pp-categorias" className={input} />
                <datalist id="pp-categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Emoji</label>
                <input value={producto.emoji || ''} onChange={(e) => cambiar({ emoji: e.target.value || null })} className={input} maxLength={8} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Descripción</label>
              <input value={producto.descripcion || ''} onChange={(e) => cambiar({ descripcion: e.target.value || null })} className={input} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1" title="Se suma siempre. Un producto simple (sin pasos) se vende a este precio.">Precio base</label>
                <NumericInput value={producto.precio_base} onChange={(v) => cambiar({ precio_base: v })} className={input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Etiquetas</label>
                <input value={producto.etiquetas.join(', ')} placeholder="SIN TACC, KETO..."
                  onChange={(e) => cambiar({ etiquetas: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={input} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={producto.activo} onChange={(e) => cambiar({ activo: e.target.checked })} /> Activo (lo ve el POS)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={producto.es_congelado} onChange={(e) => cambiar({ es_congelado: e.target.checked })} /> Se entrega congelado
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Foto</label>
              <ImagenUploader value={producto.imagen || ''} onChange={(url) => cambiar({ imagen: url || null })} />
            </div>
          </section>

          {/* Receta base */}
          <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold text-sm">Receta base</h3>
              <span className="text-xs text-text-muted">{textoCosto(producto.receta) || 'Lo que lleva siempre: packaging, base común...'}</span>
            </div>
            <RecetaEditor lineas={producto.receta} onChange={(receta) => cambiar({ receta })} />
          </section>

          {/* Pasos */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold text-sm">Pasos para armarlo</h3>
              <span className="text-xs text-text-muted">El cliente los recorre en este orden</span>
            </div>
            {producto.pasos.length === 0 && (
              <p className="text-sm text-text-muted bg-white border border-dashed border-gray-300 rounded-xl p-4">
                Sin pasos: es un producto simple que se vende al precio base.
              </p>
            )}
            {producto.pasos.map((paso, i) => (
              <PasoEditor key={paso.id ?? paso.key} paso={paso} indice={i} total={producto.pasos.length}
                anteriores={anterioresDe[i]} grupos={grupos}
                onChange={(p) => setPaso(i, p)} onMover={(d) => moverPaso(i, d)}
                onBorrar={() => borrarPaso(i)} onBorrarOpcion={(r) => borrarOpcion(i, r)} />
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => agregarPaso({ min_sel: 1, max_sel: 1 })}>
                <Plus size={14} /> Paso obligatorio (elige 1)
              </Button>
              <Button variant="secondary" size="sm" onClick={() => agregarPaso({ nombre: 'Extras', min_sel: 0, max_sel: 3 })}>
                <Plus size={14} /> Extras opcionales
              </Button>
            </div>
          </section>
        </div>

        <div className="lg:sticky lg:top-4">
          <Simulador producto={producto} grupos={grupos} />
        </div>
      </div>

      <ConfirmDialog isOpen={confirmarBorrar} onClose={() => setConfirmarBorrar(false)} onConfirm={() => borrar.mutate()}
        loading={borrar.isPending} title="Borrar producto"
        message={`Se borra "${producto.nombre}" con sus pasos y recetas. Los pedidos ya hechos no se tocan.`} />
    </div>
  );
}
