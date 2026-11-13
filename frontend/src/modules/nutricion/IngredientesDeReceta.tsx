import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { nutricionApi } from './api';
import type { IngredienteNutri } from './types';
import { fmtNutriente, textoUnidad } from './utils';
import EstadoIngrediente from './EstadoIngrediente';
import IngredienteNutriModal from './IngredienteNutriModal';

// Ingredientes que usa una receta (tambien los de sus subrecetas), con sus
// valores cada 100 g: al revisar un producto se corrige lo que no cierra
// sin salir del detalle.
export default function IngredientesDeReceta({ ids }: { ids: number[] }) {
  const [abierto, setAbierto] = useState<IngredienteNutri | null>(null);
  const { data } = useQuery({ queryKey: ['nutri-ingredientes'], queryFn: nutricionApi.getIngredientes, staleTime: 0 });
  const lista = useMemo(() => {
    const usados = new Set(ids);
    return (data?.data || []).filter((i) => usados.has(i.id));
  }, [data, ids]);

  if (lista.length === 0) return null;
  return (
    <div className="border border-gray-200 rounded-lg overflow-x-auto">
      <table className="w-full min-w-[620px] text-xs">
        <thead>
          <tr className="bg-gray-50 text-text-muted">
            <th className="px-3 py-1.5 text-left font-medium">
              Ingredientes <span className="font-normal">· valores cada 100 g · tocá uno para corregirlo</span>
            </th>
            <th className="px-3 py-1.5 text-left font-medium">Unidad</th>
            <th className="px-3 py-1.5 text-right font-medium">Kcal</th>
            <th className="px-3 py-1.5 text-right font-medium">Prot.</th>
            <th className="px-3 py-1.5 text-right font-medium">Carbs</th>
            <th className="px-3 py-1.5 text-right font-medium">Grasas</th>
            <th className="px-3 py-1.5 text-left font-medium">Estado</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {lista.map((i) => (
            <tr key={i.id} onClick={() => setAbierto(i)} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer">
              <td className="px-3 py-1.5 font-medium text-primary">{i.nombre}</td>
              <td className="px-3 py-1.5 text-text-muted whitespace-nowrap">{textoUnidad(i)}</td>
              {(['energia_kcal', 'proteinas_g', 'carbohidratos_g', 'grasas_g'] as const).map((k) => (
                <td key={k} className="px-3 py-1.5 text-right tabular-nums">{i.valores ? fmtNutriente(k, i.valores[k]) : '—'}</td>
              ))}
              <td className="px-3 py-1.5"><EstadoIngrediente i={i} /></td>
              <td className="px-2 py-1.5 text-text-muted"><Pencil size={13} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {abierto && <IngredienteNutriModal key={abierto.id} ingrediente={abierto} onClose={() => setAbierto(null)} />}
    </div>
  );
}
