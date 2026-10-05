import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, MessageSquare, Search, ImageOff } from 'lucide-react';
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

export default function ChecklistCarta() {
  // Si se entra por link de colaborador, la key identifica quien marca.
  const { key } = useParams();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [buscar, setBuscar] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => cartaChecklistApi.getAll(),
    // Si dos personas lo usan a la vez, cada una ve el avance de la otra.
    refetchInterval: 30_000,
  });
  const items = useMemo(() => data?.data || [], [data]);

  // Guardado optimista: el tilde se ve al instante y si falla vuelve atras.
  const guardarMut = useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: { hecho?: boolean; observacion?: string } }) =>
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
  const guardar = (id: number, cambios: { hecho?: boolean; observacion?: string }) => guardarMut.mutate({ id, cambios });

  const total = items.length;
  const controlados = items.filter((i) => i.control.hecho).length;
  const observados = items.filter((i) => i.control.observacion).length;

  const visibles = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    return items.filter((i) => {
      if (q && !normalizarTexto(i.nombre).includes(q)) return false;
      if (filtro === 'pendientes') return !i.control.hecho;
      if (filtro === 'observados') return !!i.control.observacion;
      if (filtro === 'controlados') return i.control.hecho;
      return true;
    });
  }, [items, filtro, buscar]);

  // Agrupado por categoria > subcategoria, en el orden de la carta.
  const grupos = useMemo(() => {
    const map = new Map<string, ItemChecklist[]>();
    for (const it of visibles) {
      const g = it.subcategoria ? `${it.categoria} › ${it.subcategoria}` : it.categoria;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(it);
    }
    return [...map.entries()];
  }, [visibles]);

  if (isLoading) return <div className="py-20 flex justify-center"><LoadingSpinner /></div>;

  const pct = total ? Math.round((controlados / total) * 100) : 0;

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

      {grupos.length === 0 ? (
        <p className="text-center text-sm text-text-muted py-12">
          {filtro === 'pendientes' && !buscar ? '¡Listo! No queda nada pendiente.' : 'No hay productos para mostrar.'}
        </p>
      ) : grupos.map(([grupo, its]) => (
        <section key={grupo} className="mt-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-text-muted mb-2 px-1">
            {grupo} <span className="font-normal">({its.length})</span>
          </h2>
          <div className="space-y-2">
            {its.map((it) => <ItemCard key={it.carta_item_id} item={it} onGuardar={guardar} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function ItemCard({ item, onGuardar }: {
  item: ItemChecklist;
  onGuardar: (id: number, cambios: { hecho?: boolean; observacion?: string }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [editandoObs, setEditandoObs] = useState(false);
  const { control } = item;
  const tieneDetalle = item.receta.length > 0 || item.incluye.length > 0 || item.preparacion || item.coccion || item.tener_en_cuenta;

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
        {tieneDetalle && (
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

      {abierto && <Detalle item={item} />}
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

function Detalle({ item }: { item: ItemChecklist }) {
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
    </div>
  );
}

