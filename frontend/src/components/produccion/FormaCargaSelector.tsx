import clsx from 'clsx';
import type { FormaCarga, ProductoCatalogo } from '../../types';
import { formasDeCarga, opcionDeCarga, plural } from '../../utils/asiento';

// Arriba de la cantidad de una carga: en que se anota (planchas, recetas,
// unidades...). Viene elegida la configurada; solo aparece si hay mas de una.
export default function FormaCargaSelector({ asiento, forma, onChange }: {
  asiento: ProductoCatalogo;
  forma: FormaCarga | null;
  onChange: (forma: FormaCarga | null) => void;
}) {
  const opciones = formasDeCarga(asiento);
  if (opciones.length < 2) return null;
  // Activa la que rinde lo mismo que la elegida (las opciones no repiten rinde)
  const elegida = opcionDeCarga(asiento, forma).rinde;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold text-text-muted">Se anota en</span>
      {opciones.map((o) => {
        const nombre = plural(o.unidad || 'receta', 2);
        return (
          <button key={o.forma ?? 'configurada'} type="button" onClick={() => onChange(o.forma)}
            className={clsx('px-3 py-1.5 text-xs rounded-full border font-medium cursor-pointer',
              o.rinde === elegida ? 'bg-primary text-white border-primary' : 'bg-white text-text-muted border-gray-300 hover:border-primary')}>
            {nombre[0].toUpperCase() + nombre.slice(1)}
          </button>
        );
      })}
    </div>
  );
}
