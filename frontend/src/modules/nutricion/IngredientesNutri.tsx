import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, Circle, Pencil } from 'lucide-react';
import Button from '../../components/common/Button';
import SearchInput from '../../components/common/SearchInput';
import Segmentado from '../../components/common/Segmentado';
import EmptyState from '../../components/common/EmptyState';
import { normalizarTexto } from '../../utils/normalizers';
import { nutricionApi, MAX_POR_PEDIDO_IA } from './api';
import type { IngredienteNutri, ErrorIA } from './types';
import { fmtNutriente, textoUnidad } from './utils';
import IngredienteNutriModal from './IngredienteNutriModal';
import EstadoIngrediente from './EstadoIngrediente';

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'sin_datos', label: 'Sin datos' },
  { id: 'sin_revisar', label: 'Sin revisar' },
  { id: 'controlado', label: 'Controlados' },
  { id: 'alertas', label: 'Con alertas' },
] as const;
type Filtro = (typeof FILTROS)[number]['id'];

function pasa(f: Filtro, i: IngredienteNutri) {
  if (f === 'sin_datos') return i.estado === null;
  if (f === 'alertas') return i.alertas.length > 0;
  return f === 'todos' || i.estado === f;
}

// Pedidos a la IA en paralelo: rapido sin saturar la cuenta
const EN_PARALELO = 3;

interface Progreso { hechos: number; total: number; errores: ErrorIA[] }

// Completa con la IA una lista de ingredientes, de a lotes y con progreso.
// Si un lote falla entero (falta la clave, sin conexion) frena todo.
function useCompletarConIA(onLote: () => void) {
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const cancelado = useRef(false);

  const correr = async (ids: number[]) => {
    cancelado.current = false;
    const lotes: number[][] = [];
    for (let i = 0; i < ids.length; i += MAX_POR_PEDIDO_IA) lotes.push(ids.slice(i, i + MAX_POR_PEDIDO_IA));
    const estado: Progreso = { hechos: 0, total: ids.length, errores: [] };
    setProgreso({ ...estado });
    let siguiente = 0;
    let falla: string | null = null;

    const trabajar = async () => {
      while (!cancelado.current && siguiente < lotes.length) {
        const lote = lotes[siguiente++];
        try {
          const { data } = await nutricionApi.sugerirIA(lote);
          estado.errores.push(...data.errores);
        } catch (e) {
          falla = (e as Error).message;
          cancelado.current = true;
          return;
        }
        estado.hechos += lote.length;
        setProgreso({ ...estado, errores: [...estado.errores] });
        onLote();
      }
    };
    await Promise.all(Array.from({ length: EN_PARALELO }, trabajar));

    setProgreso(null);
    if (falla) toast.error(falla, { duration: 8000 });
    else if (estado.errores.length) toast.error(`${estado.errores.length} sin completar: ${estado.errores.map((e) => e.nombre).join(', ')}`, { duration: 8000 });
    else toast.success(`La IA completó ${estado.hechos} ingredientes. Quedan sin revisar.`);
  };

  return { progreso, correr, cancelar: () => { cancelado.current = true; } };
}

export default function IngredientesNutri() {
  const qc = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState<IngredienteNutri | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['nutri-ingredientes'], queryFn: nutricionApi.getIngredientes, staleTime: 0 });
  const lista = useMemo(() => data?.data || [], [data]);

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['nutri-ingredientes'] });
    qc.invalidateQueries({ queryKey: ['nutri-productos'] });
  };
  const ia = useCompletarConIA(refrescar);

  const controlar = useMutation({
    mutationFn: ({ id, valor }: { id: number; valor: boolean }) => nutricionApi.controlarIngrediente(id, valor),
    onSuccess: refrescar,
    onError: (e: Error) => toast.error(e.message),
  });

  const visibles = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    return lista.filter((i) => (!q || normalizarTexto(i.nombre).includes(q)));
  }, [lista, buscar]);
  const conteo = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.id, visibles.filter((i) => pasa(f.id, i)).length])) as Record<Filtro, number>,
    [visibles]
  );
  // Primero los que estan en mas recetas: son los que mueven los productos
  const pendientesIA = useMemo(
    () => lista.filter((i) => i.estado === null && i.usos > 0).sort((a, b) => b.usos - a.usos).map((i) => i.id),
    [lista]
  );

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  const filas = visibles.filter((i) => pasa(filtro, i));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] max-w-sm"><SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar ingrediente..." /></div>
        <Segmentado etiqueta="Filtrar por estado" opciones={FILTROS} valor={filtro} onCambiar={setFiltro} conteo={conteo}
          alerta={{ sin_datos: 'text-amber-700', alertas: 'text-red-600' }} />
        {ia.progreso ? (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin text-violet-600" />
            <span className="tabular-nums">La IA va {ia.progreso.hechos} de {ia.progreso.total}</span>
            <Button size="sm" variant="secondary" onClick={ia.cancelar}>Frenar</Button>
          </div>
        ) : pendientesIA.length > 0 && (
          <Button size="sm" className="ml-auto" onClick={() => ia.correr(pendientesIA)}>
            <Sparkles size={14} /> Completar con IA ({pendientesIA.length})
          </Button>
        )}
      </div>
      {!ia.progreso && pendientesIA.length > 0 && (
        <p className="text-xs text-text-muted -mt-2">
          La IA completa los ingredientes sin datos que se usan en recetas. Todo queda <strong>sin revisar</strong> hasta que lo controles.
        </p>
      )}

      {filas.length === 0 ? (
        <EmptyState message={buscar || filtro !== 'todos' ? 'Nada coincide con la búsqueda o el filtro.' : 'No hay ingredientes.'} />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-text-muted">
                <th className="px-3 py-2 text-left font-medium">Ingrediente</th>
                <th className="px-3 py-2 text-left font-medium">Unidad de receta</th>
                <th className="px-3 py-2 text-right font-medium" title="Cada 100 g">Kcal</th>
                <th className="px-3 py-2 text-right font-medium" title="Cada 100 g">Prot.</th>
                <th className="px-3 py-2 text-right font-medium" title="Cada 100 g">Carbs</th>
                <th className="px-3 py-2 text-right font-medium" title="Cada 100 g">Grasas</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
                <th className="px-3 py-2 w-20" />
              </tr>
            </thead>
            <tbody>
              {filas.map((i) => (
                <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setAbierto(i)} className="text-left font-medium text-primary hover:underline cursor-pointer">{i.nombre}</button>
                    <div className="text-[11px] text-text-muted">
                      {i.categoria || 'Sin categoría'} · {i.usos} {i.usos === 1 ? 'receta' : 'recetas'}
                      {i.alertas.length > 0 && (
                        <span className="ml-1.5 text-red-600 font-medium inline-flex items-center gap-0.5">
                          <AlertTriangle size={11} /> {i.alertas.length} {i.alertas.length === 1 ? 'cantidad dudosa' : 'cantidades dudosas'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-muted whitespace-nowrap">{textoUnidad(i)}</td>
                  {(['energia_kcal', 'proteinas_g', 'carbohidratos_g', 'grasas_g'] as const).map((k) => (
                    <td key={k} className="px-3 py-2 text-right tabular-nums">{i.valores ? fmtNutriente(k, i.valores[k]) : '—'}</td>
                  ))}
                  <td className="px-3 py-2"><EstadoIngrediente i={i} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {i.estado && (
                        <button type="button" onClick={() => controlar.mutate({ id: i.id, valor: i.estado !== 'controlado' })}
                          disabled={controlar.isPending} title={i.estado === 'controlado' ? 'Quitar control' : 'Marcar controlado'}
                          className={clsx('p-1.5 rounded-lg cursor-pointer hover:bg-gray-100', i.estado === 'controlado' ? 'text-green-600' : 'text-gray-400')}>
                          {i.estado === 'controlado' ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                        </button>
                      )}
                      <button type="button" onClick={() => setAbierto(i)} title="Editar" className="p-1.5 rounded-lg text-text-muted hover:bg-gray-100 cursor-pointer">
                        <Pencil size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierto && <IngredienteNutriModal key={abierto.id} ingrediente={abierto} onClose={() => setAbierto(null)} />}
    </div>
  );
}
