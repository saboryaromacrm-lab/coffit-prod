import { useQuery } from '@tanstack/react-query';
import { nutricionApi } from './api';
import TablaNutricional from './TablaNutricional';

// Info nutricional calculada de una subreceta guardada (en el editor). Se
// calcula con sus ingredientes: no se carga a mano.
export default function NutricionSubreceta({ subrecetaId }: { subrecetaId: number }) {
  const { data } = useQuery({
    queryKey: ['nutri-subreceta', subrecetaId],
    queryFn: () => nutricionApi.getSubreceta(subrecetaId),
    staleTime: 0, // los ingredientes se editan en otra pantalla
  });
  const s = data?.data;
  if (!s) return null;

  return (
    <details className="mb-4 border border-gray-200 rounded-lg">
      <summary className="px-3 py-2 text-xs font-medium text-text-muted cursor-pointer select-none">
        🍎 Info nutricional calculada
        {s.por_unidad
          ? <> · <strong className="text-text-primary">{s.por_unidad.energia_kcal} kcal</strong> {s.tipo_rendimiento === 'porciones' ? 'por porción' : 'cada 100 g'}</>
          : ' · sin datos'}
        {s.faltantes.length > 0 && <span className="text-amber-700"> · incompleta</span>}
      </summary>
      <div className="px-3 pb-3 space-y-2">
        {s.faltantes.length > 0 && (
          <p className="text-xs text-amber-800">Sin información: {s.faltantes.join(', ')}.</p>
        )}
        {s.por_unidad && (
          <TablaNutricional columnas={[{ titulo: s.tipo_rendimiento === 'porciones' ? 'Por porción' : 'Cada 100 g', valores: s.por_unidad }]} />
        )}
        <p className="text-[11px] text-text-muted">
          Según lo guardado. Los valores de cada ingrediente se cargan en <a href="/nutricion" className="text-primary hover:underline">Info nutricional</a>.
        </p>
      </div>
    </details>
  );
}
