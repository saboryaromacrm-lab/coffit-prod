import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader2, ShieldCheck } from 'lucide-react';
import Button from '../../components/common/Button';
import SearchInput from '../../components/common/SearchInput';
import Segmentado from '../../components/common/Segmentado';
import EmptyState from '../../components/common/EmptyState';
import { normalizarTexto } from '../../utils/normalizers';
import { nutricionApi } from './api';
import type { IngredienteNutri } from './types';
import { fmtNutriente } from './utils';
import IngredienteNutriModal from './IngredienteNutriModal';

// ============================================================================
// PENDIENTE DE VERIFICACION: los ingredientes con valores cargados (por la IA
// o a mano) que nadie verifico. Primero lo que no puede ser cierto, despues
// lo que mas recetas usa. Se verifica en el editor: cada valor contra la
// fuente, y recien ahi se marca controlado.
// ============================================================================

type Motivo = 'incoherente' | 'cantidades' | 'sin_fuente' | 'confianza';

const MOTIVOS: Record<Motivo, { label: (i: IngredienteNutri) => string; clase: string }> = {
  incoherente: { label: () => 'Valores incoherentes', clase: 'bg-red-100 text-red-700' },
  cantidades: { label: (i) => `${i.alertas.length} ${i.alertas.length === 1 ? 'cantidad dudosa' : 'cantidades dudosas'}`, clase: 'bg-red-100 text-red-700' },
  sin_fuente: { label: () => 'Sin fuente', clase: 'bg-amber-100 text-amber-800' },
  confianza: { label: (i) => `Confianza ${i.confianza} de la IA`, clase: 'bg-sky-100 text-sky-800' },
};

function motivosDe(i: IngredienteNutri): Motivo[] {
  const m: Motivo[] = [];
  if (i.incoherencias.length) m.push('incoherente');
  if (i.alertas.length) m.push('cantidades');
  if (!i.fuente) m.push('sin_fuente');
  if (i.confianza === 'baja' || i.confianza === 'media') m.push('confianza');
  return m;
}
const grave = (m: Motivo[]) => m.includes('incoherente') || m.includes('cantidades');

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'incoherente', label: 'Incoherentes' },
  { id: 'cantidades', label: 'Cantidades dudosas' },
  { id: 'sin_fuente', label: 'Sin fuente' },
] as const;
type Filtro = (typeof FILTROS)[number]['id'];

const COLUMNAS = ['energia_kcal', 'proteinas_g', 'carbohidratos_g', 'fibra_g', 'grasas_g'] as const;

export default function PendientesNutri() {
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState<IngredienteNutri | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['nutri-ingredientes'], queryFn: nutricionApi.getIngredientes, staleTime: 0 });

  const pendientes = useMemo(() => (data?.data || [])
    .filter((i) => i.estado === 'sin_revisar')
    .map((i) => ({ i, motivos: motivosDe(i) }))
    .sort((a, b) => Number(grave(b.motivos)) - Number(grave(a.motivos)) || b.i.usos - a.i.usos), [data]);
  const visibles = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    return pendientes.filter(({ i }) => !q || normalizarTexto(i.nombre).includes(q));
  }, [pendientes, buscar]);
  const conteo = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.id,
    f.id === 'todos' ? visibles.length : visibles.filter((p) => p.motivos.includes(f.id)).length])) as Record<Filtro, number>,
  [visibles]);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  const filas = filtro === 'todos' ? visibles : visibles.filter((p) => p.motivos.includes(filtro));
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted max-w-3xl">
        Ingredientes con valores cargados que todavía nadie verificó. Para verificar uno: abrilo, chequeá cada valor
        con la <strong>fuente</strong> (corregí lo que no coincida) y marcalo <strong>controlado</strong>.
        No se puede controlar sin fuente ni con valores incoherentes.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] max-w-sm"><SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar ingrediente..." /></div>
        <Segmentado etiqueta="Filtrar por motivo" opciones={FILTROS} valor={filtro} onCambiar={setFiltro} conteo={conteo}
          alerta={{ incoherente: 'text-red-600', cantidades: 'text-red-600', sin_fuente: 'text-amber-700' }} />
      </div>

      {filas.length === 0 ? (
        <EmptyState message={pendientes.length === 0 ? 'No hay datos pendientes de verificación.' : 'Nada coincide con la búsqueda o el filtro.'} />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-text-muted">
                <th className="px-3 py-2 text-left font-medium">Ingrediente</th>
                <th className="px-3 py-2 text-left font-medium">Fuente</th>
                <th className="px-3 py-2 text-right font-medium" title="Cada 100 g">Kcal</th>
                <th className="px-3 py-2 text-right font-medium" title="Cada 100 g">Prot.</th>
                <th className="px-3 py-2 text-right font-medium" title="Cada 100 g, sin fibra">Carbs</th>
                <th className="px-3 py-2 text-right font-medium" title="Cada 100 g">Fibra</th>
                <th className="px-3 py-2 text-right font-medium" title="Cada 100 g">Grasas</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {filas.map(({ i, motivos }) => (
                <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setAbierto(i)} className="text-left font-medium text-primary hover:underline cursor-pointer">{i.nombre}</button>
                    <div className="text-[11px] text-text-muted">{i.categoria || 'Sin categoría'} · {i.usos} {i.usos === 1 ? 'receta' : 'recetas'}</div>
                    {motivos.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {motivos.map((m) => (
                          <span key={m} title={m === 'incoherente' ? i.incoherencias.join(' · ') : undefined}
                            className={clsx('px-1.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap', MOTIVOS[m].clase)}>
                            {MOTIVOS[m].label(i)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-text-muted max-w-[220px]">{i.fuente || '—'}</td>
                  {COLUMNAS.map((k) => (
                    <td key={k} className="px-3 py-2 text-right tabular-nums">{i.valores ? fmtNutriente(k, i.valores[k]) : '—'}</td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setAbierto(i)}><ShieldCheck size={14} /> Verificar</Button>
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
