import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ChevronRight, ExternalLink, Plus, AlertTriangle, CheckCircle2, BookOpen, PartyPopper } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import SearchInput from '../../components/common/SearchInput';
import EmptyState from '../../components/common/EmptyState';
import SubrecetaModal from '../../components/subrecetas/SubrecetaModal';
import { subrecetasApi } from '../../api/subrecetas';
import { formatMoney } from '../../utils/formatters';
import { normalizarTexto } from '../../utils/normalizers';
import { getFoodCostColor } from '../../utils/calculators';
import RecetaEditor from './RecetaEditor';
import { costoReceta } from './utils';
import { ppApi } from './api';
import type { Subreceta } from '../../types/subreceta';
import type { LineaReceta, NecesidadReceta, RecetaUsada } from './types';

// ============================================================================
// RECETAS: lista de trabajo para costear todo lo publicado en Personalizados.
// El servidor arma solo que necesita receta (productos unicos, harinas,
// versiones, rellenos, toppings, proteina...). Aca se le asigna a cada uno una
// subreceta de CoffitCost (o ingredientes) con la cantidad justa; la receta se
// recostea sola cuando cambian los precios.
// ============================================================================

const FILTROS = [
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'costeadas', label: 'Costeadas' },
  { id: 'todas', label: 'Todas' },
] as const;
type Filtro = (typeof FILTROS)[number]['id'];
const pasaFiltro = (f: Filtro, n: NecesidadReceta) =>
  f === 'todas' || (f === 'costeadas' ? n.estado === 'ok' : n.estado !== 'ok');

// Mismo calculo que evaluar() del backend: el costo en la unidad del precio
// (por kg contra un precio por kg) y el food cost si esta todo bien.
function evaluar(lineas: LineaReceta[], n: NecesidadReceta) {
  const { fijo, porKg, incompleto } = costoReceta(lineas);
  const peso = n.peso_kg ?? n.peso_ref;
  let aviso: string | null = null;
  let costo: number;
  if (n.precio_modo === 'por_kg') {
    costo = porKg + (peso ? fijo / peso : 0);
  } else {
    if (porKg > 0 && !peso) aviso = 'Tiene líneas "x kg" pero no tiene peso: ese costo da $0';
    costo = fijo + porKg * (peso || 0);
  }
  if (incompleto) aviso = aviso || 'Usa un ingrediente o receta que ya no existe';
  const fc = lineas.length && !aviso && costo > 0 && n.precio > 0 ? Math.round((costo / n.precio) * 1000) / 10 : null;
  return { costo, fc, aviso };
}

const conKg = (n: NecesidadReceta, monto: number) => `${formatMoney(monto)}${n.precio_modo === 'por_kg' ? '/kg' : ''}`;
const cantidad = (l: LineaReceta) =>
  `${Number(l.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 2 })} ${l.unidad || ''}${l.por_kg ? '/kg' : ''}`.trim();

// Nombre para una subreceta nueva: producto + paso + opcion, para que no quede
// suelta en Subrecetas ("Harina integral (900 g)" -> "Budin Harina integral 900 g").
// Se saltea lo que ya dice la parte siguiente (el paso "Harina" en "Harina
// integral") y el "Grupo" de los grupos de la biblioteca.
function nombreSugerido(n: NecesidadReceta) {
  const partes = n.destino.tipo === 'producto'
    ? [n.seccion, n.paso ? 'base' : null]
    : [n.producto_id ? n.seccion : null, n.paso, n.nombre];
  const lista = partes.filter((p): p is string => !!p);
  return lista
    .filter((p, i) => !lista.slice(i + 1).some((q) => normalizarTexto(q).includes(normalizarTexto(p))))
    .join(' ')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Linea nueva a partir de una subreceta, con la cantidad sugerida por la fila
// (mismo criterio que el buscador del RecetaEditor).
function lineaDeSubreceta(s: Subreceta, n: NecesidadReceta): LineaReceta {
  const porciones = s.tipo_rendimiento === 'porciones';
  return {
    subreceta_id: s.id,
    ...(porciones
      ? { cantidad: 1, por_kg: false }
      : { cantidad: n.sugerencia.porKg ? 1000 : (n.sugerencia.gramos ?? 0), por_kg: n.sugerencia.porKg }),
    nombre: s.nombre,
    unidad: porciones ? 'porc' : 'g',
    costo_unitario: porciones
      ? (s.rendimiento_gramos > 0 ? Number(s.costo_total) / s.rendimiento_gramos : 0)
      : Number(s.costo_por_100g) / 100,
  };
}

export default function Recetas({ onIrProducto, onIrGrupos }: { onIrProducto: (id: number) => void; onIrGrupos: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['pp-recetas'], queryFn: ppApi.getRecetas });
  const { data: subData } = useQuery({ queryKey: ['subrecetas'], queryFn: () => subrecetasApi.getAll() });
  const subrecetas = useMemo(() => subData?.data || [], [subData]);
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [abierta, setAbierta] = useState<NecesidadReceta | null>(null);
  const [editarReceta, setEditarReceta] = useState<number | null>(null);

  const necesidades = useMemo(() => data?.data.necesidades || [], [data]);
  const recetas = useMemo(() => data?.data.recetas || [], [data]);

  const visibles = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    return necesidades.filter((n) => !q
      || normalizarTexto([n.seccion, n.paso, n.nombre, ...n.lineas.map((l) => l.nombre)].filter(Boolean).join(' ')).includes(q));
  }, [necesidades, buscar]);
  const conteo = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.id, visibles.filter((n) => pasaFiltro(f.id, n)).length])) as Record<Filtro, number>,
    [visibles]
  );
  const lista = useMemo(() => visibles.filter((n) => pasaFiltro(filtro, n)), [visibles, filtro]);
  const secciones = useMemo(() => {
    const m = new Map<string, NecesidadReceta[]>();
    for (const n of lista) {
      if (!m.has(n.seccion)) m.set(n.seccion, []);
      m.get(n.seccion)!.push(n);
    }
    return [...m.entries()];
  }, [lista]);
  // Total por seccion (sin filtro) para el "x/y" del titulo.
  const totalSeccion = useMemo(() => {
    const m = new Map<string, { ok: number; total: number }>();
    for (const n of necesidades) {
      const t = m.get(n.seccion) || { ok: 0, total: 0 };
      t.total += 1;
      if (n.estado === 'ok') t.ok += 1;
      m.set(n.seccion, t);
    }
    return m;
  }, [necesidades]);

  const ok = necesidades.filter((n) => n.estado === 'ok').length;
  const incompletas = necesidades.filter((n) => n.estado === 'incompleta').length;

  // La que sigue en la lista visible (para "Guardar y seguir"), salteando las
  // que se acaban de guardar.
  const siguienteDe = (clave: string, guardadas: Set<string>) => {
    const i = lista.findIndex((n) => n.clave === clave);
    return [...lista.slice(i + 1), ...lista.slice(0, Math.max(i, 0))]
      .find((n) => !guardadas.has(n.clave) && n.estado !== 'ok') || null;
  };

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      {/* Progreso */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm">
            <span className="text-lg font-bold tabular-nums">{ok}</span>
            <span className="text-text-muted"> de {necesidades.length} con receta</span>
          </p>
          <p className="text-xs text-text-muted">
            {necesidades.length - ok - incompletas} sin receta
            {incompletas > 0 && <span className="text-amber-700"> · {incompletas} con problemas</span>}
          </p>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${necesidades.length ? (ok / necesidades.length) * 100 : 0}%` }} />
        </div>
        <p className="text-xs text-text-muted">
          Sale solo de lo publicado: productos únicos, harinas, versiones, rellenos, toppings y todo lo que suma precio.
          Tocá uno para asignarle su receta.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] max-w-sm"><SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar producto, opción o receta..." /></div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id}
              className={clsx('px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors',
                filtro === f.id ? 'bg-white shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary')}>
              {f.label}
              <span className={clsx('ml-1.5 tabular-nums', f.id === 'pendientes' && conteo.pendientes > 0 ? 'text-red-600' : 'text-text-muted')}>{conteo[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {secciones.length === 0 ? (
        filtro === 'pendientes' && !buscar && necesidades.length > 0
          ? <EmptyState icon={<PartyPopper size={48} className="mb-3 text-green-600" />} message="Todo lo publicado tiene receta." />
          : <EmptyState icon={<BookOpen size={48} className="mb-3 opacity-40" />}
            message={necesidades.length ? 'Nada coincide con la búsqueda o el filtro.' : 'No hay productos activos que necesiten receta.'} />
      ) : secciones.map(([seccion, filas]) => {
        const t = totalSeccion.get(seccion)!;
        const productoId = filas[0].producto_id;
        return (
          <section key={seccion} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate">{seccion}</h3>
              <span className={clsx('text-xs tabular-nums px-1.5 py-px rounded', t.ok === t.total ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-text-muted')}>
                {t.ok}/{t.total}
              </span>
              <button type="button" onClick={() => (productoId ? onIrProducto(productoId) : onIrGrupos())}
                className="ml-auto inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary"
                title={productoId ? 'Abrir el producto' : 'Ir a Grupos'}>
                <ExternalLink size={12} /> {productoId ? 'Producto' : 'Grupos'}
              </button>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {filas.map((n) => <Fila key={n.clave} n={n} onAbrir={() => setAbierta(n)} />)}
            </div>
          </section>
        );
      })}

      {/* Recetas que ya usa Personalizados */}
      {recetas.length > 0 && (
        <section className="space-y-1.5 pt-2">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Recetas usadas en Personalizados</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {recetas.map((r) => <TarjetaReceta key={r.id} r={r} onEditar={() => setEditarReceta(r.id)} />)}
          </div>
        </section>
      )}

      {abierta && (
        <AsignarReceta
          key={abierta.clave}
          n={abierta}
          necesidades={necesidades}
          recetas={recetas}
          subrecetas={subrecetas}
          onClose={() => setAbierta(null)}
          onGuardada={(guardadas, seguir) => setAbierta(seguir ? siguienteDe(abierta.clave, guardadas) : null)}
        />
      )}
      {editarReceta != null && (
        <SubrecetaModal subrecetaId={editarReceta} subrecetas={subrecetas} onClose={() => setEditarReceta(null)}
          onGuardada={() => qc.invalidateQueries({ queryKey: ['pp-recetas'] })} />
      )}
    </div>
  );
}

function Fila({ n, onAbrir }: { n: NecesidadReceta; onAbrir: () => void }) {
  const { costo } = evaluar(n.lineas, n);
  return (
    <button type="button" onClick={onAbrir} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 active:bg-gray-100">
      <span className={clsx('w-2 h-2 rounded-full shrink-0',
        n.estado === 'ok' ? 'bg-green-500' : n.estado === 'incompleta' ? 'bg-amber-500' : 'bg-red-400')} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-medium text-sm">{n.nombre}</span>
          {n.paso && <span className="text-xs text-text-muted">{n.paso}</span>}
          {n.detalle && <span className="text-xs text-text-muted">· {n.detalle}</span>}
        </div>
        <div className="text-xs mt-0.5 truncate">
          {n.lineas.length
            ? <span className="text-text-primary">{n.lineas.map((l) => `${l.nombre} ${cantidad(l)}`).join(' · ')}</span>
            : <span className="text-red-600">Sin receta</span>}
        </div>
        {n.aviso && (
          <div className="text-xs text-amber-700 mt-0.5 flex items-start gap-1"><AlertTriangle size={12} className="mt-px shrink-0" /> {n.aviso}</div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs text-text-muted">{n.precio > 0 ? conKg(n, n.precio) : 'sin precio'}</div>
        {n.food_cost != null ? (
          <div className="text-sm font-semibold tabular-nums" style={{ color: getFoodCostColor(n.food_cost) }}
            title={`Costo ${conKg(n, costo)}`}>{n.food_cost}%</div>
        ) : n.estado === 'ok' && <div className="text-xs font-mono">{conKg(n, costo)}</div>}
      </div>
      <ChevronRight size={16} className="text-text-muted shrink-0" />
    </button>
  );
}

function TarjetaReceta({ r, onEditar }: { r: RecetaUsada; onEditar: () => void }) {
  const porciones = r.tipo_rendimiento === 'porciones';
  return (
    <button type="button" onClick={onEditar} title="Editar la receta (se recostea en todos lados)"
      className="flex items-center gap-3 text-left bg-white border border-gray-200 rounded-xl px-3 py-2 hover:border-primary transition-colors">
      <BookOpen size={16} className="text-blue-600 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{r.nombre}</div>
        <div className="text-xs text-text-muted">
          {porciones
            ? `${formatMoney(r.rendimiento > 0 ? r.costo_total / r.rendimiento : 0)} por porción`
            : `${formatMoney(r.costo_por_kg ?? 0)}/kg`}
          {' · '}en {r.usos} {r.usos === 1 ? 'lugar' : 'lugares'}
        </div>
      </div>
    </button>
  );
}

// Modal para asignar la receta de una fila. Se puede crear una subreceta nueva
// sin salir (el asignador se oculta mientras tanto y conserva lo cargado), y
// copiar la misma receta a otras filas con el mismo nombre.
function AsignarReceta({ n, necesidades, recetas, subrecetas, onClose, onGuardada }: {
  n: NecesidadReceta;
  necesidades: NecesidadReceta[];
  recetas: RecetaUsada[];
  subrecetas: Subreceta[];
  onClose: () => void;
  onGuardada: (guardadas: Set<string>, seguir: boolean) => void;
}) {
  const qc = useQueryClient();
  const [lineas, setLineas] = useState<LineaReceta[]>(n.lineas);
  const [sucio, setSucio] = useState(false);
  const [creando, setCreando] = useState(false);
  const [copiarA, setCopiarA] = useState<Set<string>>(new Set());

  const cambiar = (l: LineaReceta[]) => { setLineas(l); setSucio(true); };
  const { costo, fc, aviso } = evaluar(lineas, n);
  const peso = n.peso_kg ?? n.peso_ref;

  const mismoNombre = useMemo(() => {
    const nombre = normalizarTexto(n.nombre);
    return necesidades.filter((x) => x.clave !== n.clave && normalizarTexto(x.nombre) === nombre);
  }, [necesidades, n]);
  // Atajo: las recetas que ya usa Personalizados, a un toque.
  const atajos = recetas
    .map((r) => subrecetas.find((s) => s.id === r.id))
    .filter((s): s is Subreceta => !!s && !lineas.some((l) => l.subreceta_id === s.id))
    .slice(0, 8);

  const guardar = useMutation({
    mutationFn: async (seguir: boolean) => {
      const destinos = [n, ...mismoNombre.filter((x) => copiarA.has(x.clave))];
      for (const d of destinos) await ppApi.asignarReceta(d.destino, lineas);
      return { guardadas: new Set(destinos.map((d) => d.clave)), seguir };
    },
    onSuccess: ({ guardadas, seguir }) => {
      qc.invalidateQueries({ queryKey: ['pp-recetas'] });
      qc.invalidateQueries({ queryKey: ['pp-productos'] });
      qc.invalidateQueries({ queryKey: ['pp-producto'] });
      qc.invalidateQueries({ queryKey: ['pp-grupos'] });
      toast.success(guardadas.size > 1 ? `Receta guardada en ${guardadas.size} lugares` : 'Receta guardada');
      onGuardada(guardadas, seguir);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <>
      <Modal isOpen={!creando} onClose={onClose} title={n.nombre} size="lg"
        footer={<>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="secondary" onClick={() => guardar.mutate(true)} loading={guardar.isPending} disabled={!sucio}>Guardar y seguir</Button>
          <Button onClick={() => guardar.mutate(false)} loading={guardar.isPending} disabled={!sucio}>Guardar</Button>
        </>}>
        <div className="space-y-4">
          <div className="text-sm text-text-muted">
            <span className="font-medium text-text-primary">{n.seccion}</span>
            {n.paso && <> · {n.paso}</>}
            {n.detalle && <> · {n.detalle}</>}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              <span>Precio: <strong className="text-text-primary">{n.precio > 0 ? conKg(n, n.precio) : 'sin precio'}</strong></span>
              {n.peso_kg != null && <span>Peso: <strong className="text-text-primary">{n.peso_kg} kg</strong></span>}
              {n.peso_ref != null && lineas.some((l) => l.por_kg) && (
                <span title="El peso lo define el tamaño que se elige; se calcula con el peor caso">
                  Líneas x kg calculadas con el tamaño de <strong className="text-text-primary">{n.peso_ref} kg</strong>
                </span>
              )}
            </div>
          </div>

          {atajos.length > 0 && (
            <div>
              <div className="text-xs text-text-muted mb-1">Recetas de Personalizados</div>
              <div className="flex flex-wrap gap-1.5">
                {atajos.map((s) => (
                  <button key={s.id} type="button" onClick={() => cambiar([...lineas, lineaDeSubreceta(s, n)])}
                    className="px-2.5 py-1 text-xs rounded-full border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100">
                    <Plus size={11} className="inline -mt-px" /> {s.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <RecetaEditor lineas={lineas} onChange={cambiar}
            sugerencia={{ gramos: n.sugerencia.gramos ?? undefined, porKg: n.sugerencia.porKg }}
            sinPeso={peso == null && n.precio_modo !== 'por_kg'} />

          <button type="button" onClick={() => setCreando(true)} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            <Plus size={14} /> Crear receta nueva
          </button>

          {/* Resultado en vivo */}
          <div className={clsx('rounded-lg px-3 py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1',
            !lineas.length ? 'bg-gray-50 text-text-muted' : aviso ? 'bg-amber-50 text-amber-800' : 'bg-green-50')}>
            {!lineas.length ? 'Sin receta: el costo da $0.' : aviso ? (
              <span className="flex items-center gap-1"><AlertTriangle size={14} /> {aviso}</span>
            ) : (
              <>
                <span className="flex items-center gap-1 text-green-800"><CheckCircle2 size={14} /> Costo {conKg(n, costo)}</span>
                {fc != null && <span>Food cost <strong style={{ color: getFoodCostColor(fc) }}>{fc}%</strong></span>}
                {n.precio > 0 && <span className="text-text-muted">Margen {conKg(n, n.precio - costo)}</span>}
              </>
            )}
          </div>

          {mismoNombre.length > 0 && lineas.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs text-text-muted mb-1.5">Usar la misma receta también en:</div>
              <div className="space-y-1">
                {mismoNombre.map((x) => (
                  <label key={x.clave} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={copiarA.has(x.clave)}
                      onChange={(e) => {
                        const s = new Set(copiarA);
                        if (e.target.checked) s.add(x.clave); else s.delete(x.clave);
                        setCopiarA(s);
                        setSucio(true);
                      }} />
                    <span>{x.seccion}{x.paso && x.paso !== x.seccion.replace(/^Grupo /, '') ? ` · ${x.paso}` : ''}{x.detalle && x.detalle.startsWith('solo') ? ` · ${x.detalle}` : ''}</span>
                    <span className={clsx('text-xs', x.estado === 'ok' ? 'text-green-700' : 'text-red-600')}>
                      {x.estado === 'ok' ? 'ya tiene (se reemplaza)' : 'sin receta'}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-1">Ojo con las cantidades: se copian tal cual.</p>
            </div>
          )}
        </div>
      </Modal>

      {creando && (
        <SubrecetaModal subrecetaId={null} subrecetas={subrecetas} nombreInicial={nombreSugerido(n)}
          onClose={() => setCreando(false)}
          onGuardada={(s) => cambiar([...lineas, lineaDeSubreceta(s, n)])} />
      )}
    </>
  );
}
