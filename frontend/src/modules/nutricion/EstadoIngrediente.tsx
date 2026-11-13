import { Sparkles, PencilLine } from 'lucide-react';
import type { IngredienteNutri } from './types';

// Estado de la info de un ingrediente, y si alguien corrigio algun valor a mano
export default function EstadoIngrediente({ i }: { i: Pick<IngredienteNutri, 'estado' | 'confianza' | 'correcciones'> }) {
  const base = i.estado === 'controlado'
    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Controlado</span>
    : i.estado === 'sin_revisar'
      ? (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 whitespace-nowrap">
          {i.confianza ? <><Sparkles size={11} className="inline -mt-0.5" /> IA · {i.confianza}</> : 'Sin revisar'}
        </span>
      )
      : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Sin datos</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {base}
      {i.correcciones.length > 0 && (
        <span title="Algún valor se corrigió a mano" className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800 whitespace-nowrap inline-flex items-center gap-0.5">
          <PencilLine size={11} /> Modificado
        </span>
      )}
    </span>
  );
}
