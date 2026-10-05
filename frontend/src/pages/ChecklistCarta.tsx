import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, MessageSquare, Search, ImageOff, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { cartaChecklistApi, type ItemChecklist } from '../api/cartaChecklist';
import { normalizarTexto } from '../utils/normalizers';
import LoadingSpinner from '../components/common/LoadingSpinner';

// ============================================================================
// CHECKLIST DE CONTROL DE LA CARTA
// Para recorrer la carta item por item y verificar que cada producto se hace
// como corresponde. Se usa desde la app y desde el link de un colaborador
// (/colaborador/:key/checklist-carta): las marcas se guardan en el servidor,
// asi que todos ven el mismo avance.
// ============================================================================

type Filtro = 'todos' | 'pendientes' | 'observados' | 'controlados';
const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'observados', label: 'Con observación' },
  { key: 'controlados', label: 'Controlados' },
];

const QUERY_KEY = ['carta-checklist'];

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

type Cambios = { hecho?: boolean; observacion?: string; excluido?: boolean };

export default function ChecklistCarta() {
  // Si se entra por link de colaborador, la key identifica quien marca.
  // Sin key es la app: ahi ademas se decide que entra en el control.
  const { key } = useParams();
  const esAdmin = !key;
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [buscar, setBuscar] = useState('');
  // Todas las categorias arrancan cerradas
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [verExcluidos, setVerExcluidos] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => cartaChecklistApi.getAll(),
    // Si dos personas lo usan a la vez, cada una ve el avance de la otra.
    refetchInterval: 30_000,
  });
  const items = useMemo(() => data?.data || [], [data]);

  // Guardado optimista: el tilde se ve al instante y si falla vuelve atras.
  const guardarMut = useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: Cambios }) =>
      cartaChecklistApi.guardar(id, cambios, key),
    onMutate: async ({ id, cambios }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previo = queryClient.getQueryData(QUERY_KEY);
      queryClient.setQueryData(QUERY_KEY, (old: typeof data) => old && {
        ...old,
        data: old.data.map((it) => it.carta_item_id === id ? { ...it, control: { ...it.control, ...cambios } } : it),
      });
      return { previo };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previo) queryClient.setQueryData(QUERY_KEY, ctx.previo);
      toast.error(`No se guardo: ${err.message}`);
    },
    onSuccess: (res, { id }) => {
      // Trae quien marco y cuando, tal como quedo en el servidor
      queryClient.setQueryData(QUERY_KEY, (old: typeof data) => old && {
        ...old,
        data: old.data.map((it) => it.carta_item_id === id ? { ...it, control: res.data } : it),
      });
    },
  });
  const guardar = (id: number, cambios: Cambios) => guardarMut.mutate({ id, cambios });

  // Excluir/incluir una categoria entera, tambien optimista.
  const categoriaMut = useMutation({
    mutationFn: ({ categoria, excluida }: { categoria: string; excluida: boolean }) =>
      cartaChecklistApi.excluirCategoria(categoria, excluida),
    onMutate: async ({ categoria, excluida }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previo = queryClient.getQueryData(QUERY_KEY);
      queryClient.setQueryData(QUERY_KEY, (old: typeof data) => old && {
        ...old,
        data: old.data.map((it) => it.categoria === categoria ? { ...it, categoria_excluida: excluida } : it),
      });
      return { previo };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previo) queryClient.setQueryData(QUERY_KEY, ctx.previo);
      toast.error(`No se guardo: ${err.message}`);
    },
  });
  const excluirCategoria = (categoria: string, excluida: boolean) => categoriaMut.mutate({ categoria, excluida });

  // Lo excluido no se controla: no aparece en la lista ni cuenta en el avance.
  const enControl = useMemo(() => items.filter((i) => !i.control.excluido && !i.categoria_excluida), [items]);
  const total = enControl.length;
  const controlados = enControl.filter((i) => i.control.hecho).length;
  const observados = enControl.filter((i) => i.control.observacion).length;

  const visibles = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    return enControl.filter((i) => {
      if (q && !normalizarTexto(i.nombre).includes(q)) return false;
      if (filtro === 'pendientes') return !i.control.hecho;
      if (filtro === 'observados') return !!i.control.observacion;
      if (filtro === 'controlados') return i.control.hecho;
      return true;
    });
  }, [enControl, filtro, buscar]);

  // Agrupado por categoria (la subcategoria va como subtitulo adentro), en el
  // orden de la carta. El avance de cada una se cuenta sobre todos sus items
  // en control, no solo los que pasan el filtro.
  const grupos = useMemo(() => {
    const map = new Map<string, ItemChecklist[]>();
    for (const it of visibles) {
      if (!map.has(it.categoria)) map.set(it.categoria, []);
      map.get(it.categoria)!.push(it);
    }
    return [...map.entries()].map(([categoria, its]) => {
      const todos = enControl.filter((i) => i.categoria === categoria);
      return {
        categoria,
        items: its,
        total: todos.length,
        controlados: todos.filter((i) => i.control.hecho).length,
        observados: todos.filter((i) => i.control.observacion).length,
      };
    });
  }, [visibles, enControl]);

  // Lo excluido, para poder volver a incluirlo (solo en la app)
  const catExcluidas = useMemo(
    () => [...new Set(items.filter((i) => i.categoria_excluida).map((i) => i.categoria))],
    [items],
  );
  const prodExcluidos = useMemo(
    () => items.filter((i) => i.control.excluido && !i.categoria_excluida),
    [items],
  );
  const cantExcluidos = catExcluidas.length + prodExcluidos.length;

  if (isLoading) return <div className="py-20 flex justify-center"><LoadingSpinner /></div>;

  const pct = total ? Math.round((controlados / total) * 100) : 0;
  // Buscando o filtrando se abren solas las categorias con resultados: si
  // quedaran cerradas, el buscador no mostraria nada.
  const abrirTodas = !!buscar.trim() || filtro !== 'todos';
  const alternar = (cat: string) => setAbiertas((prev) => {
    const sig = new Set(prev);
    if (sig.has(cat)) sig.delete(cat); else sig.add(cat);
    return sig;
  });

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4">
      {/* Fijo arriba solo el avance: lo demas se va con el scroll para no
          comerse la pantalla del celular mientras se recorre la carta. */}
      <div className="sticky top-0 z-10 bg-gray-50 pb-2 -mx-3 px-3 sm:-mx-4 sm:px-4 pt-1">
        <div className="flex items-end justify-between gap-2 mb-1.5">
          <h1 className="text-lg font-bold text-text-primary">Control de carta</h1>
          <span className="text-sm text-text-muted whitespace-nowrap">
            <strong className="text-text-primary">{controlados}</strong> de {total}
            {observados > 0 && <span className="text-amber-700"> · {observados} obs.</span>}
          </span>
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap border transition-colors ${
                filtro === f.key ? 'bg-primary text-white border-primary' : 'bg-white text-text-muted border-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
          {esAdmin && cantExcluidos > 0 && (
            <button
              onClick={() => setVerExcluidos(!verExcluidos)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap border inline-flex items-center gap-1 ${
                verExcluidos ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-text-muted border-dashed border-gray-400'
              }`}
            >
              <EyeOff size={12} /> Excluidos ({cantExcluidos})
            </button>
          )}
        </div>
        <div className="relative mt-2">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {esAdmin && verExcluidos && (
        <Excluidos
          categorias={catExcluidas}
          productos={prodExcluidos}
          onIncluirCategoria={(c) => excluirCategoria(c, false)}
          onIncluirProducto={(id) => guardar(id, { excluido: false })}
        />
      )}

      {grupos.length === 0 ? (
        <p className="text-center text-sm text-text-muted py-12">
          {filtro === 'pendientes' && !buscar ? '¡Listo! No queda nada pendiente.' : 'No hay productos para mostrar.'}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {grupos.map((g) => (
            <Categoria
              key={g.categoria}
              grupo={g}
              abierta={abrirTodas || abiertas.has(g.categoria)}
              onAlternar={() => alternar(g.categoria)}
              onExcluir={esAdmin ? () => excluirCategoria(g.categoria, true) : undefined}
              onGuardar={guardar}
              esAdmin={esAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Categoria({ grupo, abierta, onAlternar, onExcluir, onGuardar, esAdmin }: {
  grupo: { categoria: string; items: ItemChecklist[]; total: number; controlados: number; observados: number };
  abierta: boolean;
  onAlternar: () => void;
  onExcluir?: () => void;
  onGuardar: (id: number, cambios: Cambios) => void;
  esAdmin: boolean;
}) {
  const completa = grupo.total > 0 && grupo.controlados === grupo.total;
  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center">
        <button onClick={onAlternar} className="flex-1 min-w-0 flex items-center gap-2 px-3 py-3 text-left">
          {abierta ? <ChevronUp size={18} className="text-text-muted shrink-0" /> : <ChevronDown size={18} className="text-text-muted shrink-0" />}
          <span className="text-sm font-bold text-text-primary truncate">{grupo.categoria}</span>
          {grupo.observados > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">{grupo.observados} obs.</span>
          )}
          <span className={`ml-auto text-xs font-medium shrink-0 ${completa ? 'text-emerald-600' : 'text-text-muted'}`}>
            {completa && <Check size={12} className="inline mr-0.5" />}{grupo.controlados}/{grupo.total}
          </span>
        </button>
        {onExcluir && (
          <button
            onClick={onExcluir}
            className="p-3 text-text-muted hover:text-red-600 shrink-0"
            title="Excluir esta categoría del control"
          >
            <EyeOff size={15} />
          </button>
        )}
      </div>

      {abierta && (
        <div className="px-2 pb-2 space-y-2">
          {grupo.items.map((it, i) => {
            // Subtitulo cada vez que arranca una subcategoria distinta
            const nuevaSub = it.subcategoria && it.subcategoria !== grupo.items[i - 1]?.subcategoria;
            return (
              <div key={it.carta_item_id}>
                {nuevaSub && (
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted px-1 pt-1 pb-1.5">
                    › {it.subcategoria}
                  </h3>
                )}
                <ItemCard item={it} onGuardar={onGuardar} esAdmin={esAdmin} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Lo que se saco del control, con la opcion de volver a incluirlo.
function Excluidos({ categorias, productos, onIncluirCategoria, onIncluirProducto }: {
  categorias: string[];
  productos: ItemChecklist[];
  onIncluirCategoria: (c: string) => void;
  onIncluirProducto: (id: number) => void;
}) {
  const fila = (texto: React.ReactNode, onIncluir: () => void, k: string) => (
    <div key={k} className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-text-muted truncate">{texto}</span>
      <button onClick={onIncluir} className="text-xs text-primary hover:underline shrink-0 inline-flex items-center gap-1">
        <Eye size={12} /> Volver a incluir
      </button>
    </div>
  );
  return (
    <div className="mt-3 p-3 rounded-xl border border-dashed border-gray-300 bg-gray-100/60">
      <p className="text-xs text-text-muted mb-2">
        No aparecen en el control ni cuentan en el avance. Quien controla por su link no los ve.
      </p>
      {categorias.length > 0 && (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mt-1">Categorías</div>
          {categorias.map((c) => fila(<strong>{c}</strong>, () => onIncluirCategoria(c), `c-${c}`))}
        </>
      )}
      {productos.length > 0 && (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mt-2">Productos</div>
          {productos.map((p) => fila(<>{p.nombre} <span className="text-xs">· {p.categoria}</span></>, () => onIncluirProducto(p.carta_item_id), `p-${p.carta_item_id}`))}
        </>
      )}
    </div>
  );
}

function ItemCard({ item, onGuardar, esAdmin }: {
  item: ItemChecklist;
  onGuardar: (id: number, cambios: Cambios) => void;
  esAdmin: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [editandoObs, setEditandoObs] = useState(false);
  const { control } = item;
  const tieneDetalle = item.receta.length > 0 || item.incluye.length > 0 || item.preparacion || item.coccion || item.tener_en_cuenta;
  // En la app siempre se despliega: ahi esta la opcion de excluir el producto
  const desplegable = tieneDetalle || esAdmin;

  return (
    <div className={`bg-white rounded-xl border transition-colors ${
      control.hecho ? 'border-emerald-200 bg-emerald-50/30' : control.observacion ? 'border-amber-200' : 'border-gray-200'
    }`}>
      <div className="flex items-center gap-3 p-3">
        {/* Check grande: se usa con el dedo */}
        <button
          onClick={() => onGuardar(item.carta_item_id, { hecho: !control.hecho })}
          className={`w-9 h-9 shrink-0 rounded-lg border-2 flex items-center justify-center transition-colors ${
            control.hecho ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 bg-white'
          }`}
          title={control.hecho ? 'Marcar como pendiente' : 'Marcar como controlado'}
        >
          {control.hecho && <Check size={20} strokeWidth={3} />}
        </button>

        <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
          {item.imagen
            ? <img src={item.imagen} alt="" className="w-full h-full object-cover" loading="lazy" />
            : <ImageOff size={16} className="text-gray-300" />}
        </div>

        <button
          onClick={() => setAbierto(!abierto)}
          className="flex-1 min-w-0 text-left"
        >
          <div className={`text-sm font-medium ${control.hecho ? 'text-text-muted' : 'text-text-primary'}`}>{item.nombre}</div>
          {control.actualizado_por && control.actualizado_en && (control.hecho || control.observacion) && (
            <div className="text-[11px] text-text-muted">
              {control.hecho ? 'Controlado' : 'Anotado'} por {control.actualizado_por} · {fechaCorta(control.actualizado_en)}
            </div>
          )}
        </button>

        <button
          onClick={() => setEditandoObs(!editandoObs)}
          className={`p-2 shrink-0 rounded-lg ${control.observacion ? 'text-amber-600 bg-amber-50' : 'text-text-muted'}`}
          title="Observación"
        >
          <MessageSquare size={16} />
        </button>
        {desplegable && (
          <button onClick={() => setAbierto(!abierto)} className="p-1 shrink-0 text-text-muted" title="Ver receta">
            {abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>

      {(editandoObs || control.observacion) && (
        <Observacion
          valor={control.observacion}
          enfocar={editandoObs}
          onGuardar={(texto) => { onGuardar(item.carta_item_id, { observacion: texto }); setEditandoObs(false); }}
        />
      )}

      {abierto && (
        <Detalle item={item} onExcluir={esAdmin ? () => onGuardar(item.carta_item_id, { excluido: true }) : undefined} />
      )}
    </div>
  );
}

// Se guarda al salir del campo, solo si cambio. Mientras se escribe, el
// refresco automatico de la lista no pisa lo que se esta escribiendo.
function Observacion({ valor, enfocar, onGuardar }: { valor: string; enfocar: boolean; onGuardar: (t: string) => void }) {
  // null = no se esta escribiendo, se muestra lo que hay en el servidor
  const [borrador, setBorrador] = useState<string | null>(null);

  return (
    <div className="px-3 pb-3 -mt-1">
      <textarea
        value={borrador ?? valor}
        autoFocus={enfocar}
        onFocus={() => setBorrador(valor)}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={() => {
          const texto = (borrador ?? valor).trim();
          setBorrador(null);
          if (texto !== valor) onGuardar(texto);
        }}
        placeholder="¿Qué está mal o hay que corregir? (ej: le falta granola, porción chica)"
        rows={2}
        maxLength={1000}
        className="w-full px-3 py-2 text-sm border border-amber-200 bg-amber-50/40 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
      />
    </div>
  );
}

function Detalle({ item, onExcluir }: { item: ItemChecklist; onExcluir?: () => void }) {
  const indicaciones: [string, string | null][] = [
    ['Preparación', item.preparacion],
    ['Cocción', item.coccion],
    ['Tener en cuenta', item.tener_en_cuenta],
  ];
  return (
    <div className="border-t border-gray-100 px-3 py-3 space-y-3 text-sm">
      {item.descripcion && <p className="text-text-muted italic">{item.descripcion}</p>}

      {item.receta.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-text-muted mb-1">Receta</div>
          <ul className="space-y-0.5">
            {item.receta.map((r, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {r.nombre}
                  {r.tipo === 'subreceta' && <span className="text-[10px] text-blue-600 ml-1">(subreceta)</span>}
                </span>
                <span className="text-text-muted whitespace-nowrap">{Number(r.cantidad.toFixed(2))} {r.unidad}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.incluye.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-text-muted mb-1">Incluye</div>
          <ul className="space-y-0.5">
            {item.incluye.map((p, i) => (
              <li key={i}>
                {p.cantidad} × {p.nombre}
                {p.es_regalo && <span className="text-[10px] text-fuchsia-600 ml-1">🎁 regalo</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {indicaciones.filter(([, v]) => v).map(([titulo, texto]) => (
        <div key={titulo}>
          <div className="text-xs font-semibold text-text-muted mb-1">{titulo}</div>
          <p className="whitespace-pre-line">{texto}</p>
        </div>
      ))}

      {item.tipo === 'sin_receta' && (
        <p className="text-xs text-text-muted">Este item no está vinculado a un producto con receta.</p>
      )}

      {onExcluir && (
        <button onClick={onExcluir} className="text-xs text-text-muted hover:text-red-600 inline-flex items-center gap-1">
          <EyeOff size={12} /> Excluir este producto del control
        </button>
      )}
    </div>
  );
}

