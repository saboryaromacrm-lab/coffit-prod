import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import NumericInput from '../common/NumericInput';
import type { FormaCarga, ProductoCatalogo } from '../../types';
import { enBase, enUnidad, nombreBase, opcionDeCarga, puedeRendirDistinto } from '../../utils/asiento';

// Cuantas veces arriba o abajo de lo normal una carga merece el aviso
const FUERA_DE_LO_NORMAL = 3;

// Debajo de la cantidad de una carga de Produccion: a cuanto equivale lo
// anotado ("8 planchas = 16 unidades"), si esta vez la unidad rindio distinto
// (queda solo en esa carga) y un aviso si se aleja mucho de lo que se carga
// normalmente (el error tipico: anotar unidades donde iban recetas).
export default function EquivalenciaCarga({ asiento, forma, cantidad, rinde, onRinde }: {
  asiento: ProductoCatalogo;
  forma: FormaCarga | null;
  cantidad: number;
  rinde: number | null; // el de esta carga; null = el de siempre
  onRinde: (v: number | null) => void;
}) {
  const [editar, setEditar] = useState(rinde != null);
  const opcion = opcionDeCarga(asiento, forma);
  const nombre = opcion.unidad || 'receta';
  const equivalente = cantidad * (rinde || opcion.rinde);
  const promedio = asiento.promedio ?? 0; // 0 = sin historial suficiente
  const fueraDeLoNormal = promedio > 0 && cantidad > 0
    && (equivalente > promedio * FUERA_DE_LO_NORMAL || equivalente * FUERA_DE_LO_NORMAL < promedio);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
        <span>
          {enUnidad(cantidad, nombre)} = <strong className="text-text-primary">{enBase(equivalente, asiento.base)}</strong>
        </span>
        {!puedeRendirDistinto(opcion, asiento.base) ? null : editar ? (
          <span className="flex items-center gap-1.5">
            · esta vez 1 {nombre} rindió
            <NumericInput value={rinde ?? 0} min={0} step="1" placeholder={String(opcion.rinde)}
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
      {fueraDeLoNormal && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          <span>
            ¿Seguro? Normalmente se carga alrededor de <strong>{enUnidad(Math.round((promedio / opcion.rinde) * 10) / 10, nombre)}</strong> ({enBase(promedio, asiento.base)}).
            Revisá la cantidad y en qué se anota.
          </span>
        </p>
      )}
    </div>
  );
}
