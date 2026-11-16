import { useState } from 'react';
import { X } from 'lucide-react';
import NumericInput from '../common/NumericInput';
import type { ProductoCatalogo } from '../../types';
import { enBase, enUnidad, nombreBase, rindeDe } from '../../utils/asiento';

// Debajo de la cantidad de una carga de Produccion: a cuanto equivale lo
// asentado ("8 planchas = 16 unidades") y, si esta vez la unidad rindio
// distinto, cuanto (queda solo en esa carga).
export default function EquivalenciaCarga({ asiento, cantidad, rinde, onRinde }: {
  asiento: ProductoCatalogo;
  cantidad: number;
  rinde: number | null; // el de esta carga; null = el de siempre
  onRinde: (v: number | null) => void;
}) {
  const [editar, setEditar] = useState(rinde != null);
  const nombre = asiento.asiento_unidad || 'receta';

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
      <span>
        {enUnidad(cantidad, nombre)} = <strong className="text-text-primary">{enBase(cantidad * rindeDe(asiento, rinde), asiento.base)}</strong>
      </span>
      {editar ? (
        <span className="flex items-center gap-1.5">
          · esta vez 1 {nombre} rindió
          <NumericInput value={rinde ?? 0} min={0} step="1" placeholder={String(rindeDe(asiento))}
            onChange={(v) => onRinde(v > 0 ? v : null)}
            className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {nombreBase(asiento.base)}
          <button type="button" onClick={() => { onRinde(null); setEditar(false); }}
            className="p-1 text-text-muted hover:text-danger" aria-label="Rindió lo de siempre">
            <X size={12} />
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setEditar(true)} className="text-primary hover:underline">
          ¿Rindió distinto?
        </button>
      )}
    </div>
  );
}
