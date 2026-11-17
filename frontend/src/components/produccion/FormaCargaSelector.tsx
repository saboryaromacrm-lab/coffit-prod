import clsx from 'clsx';
import type { FormaCarga, ProductoCatalogo } from '../../types';
import { formasDeCarga, plural } from '../../utils/asiento';

// Arriba de la cantidad de una carga: en que se anota (receta completa,
// unidades, planchas...). Viene elegida la configurada.
export default function FormaCargaSelector({ asiento, forma, onChange }: {
  asiento: ProductoCatalogo;
  forma: FormaCarga | null;
  onChange: (forma: FormaCarga | null) => void;
}) {
  const opciones = formasDeCarga(asiento);
  // La forma que no esta en la lista es la configurada (la primera)
  const elegida = opciones.find((o) => o.forma === forma) ?? opciones[0];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold text-text-muted">Se anota en</span>
      {opciones.map((o) => {
        const nombre = o.unidad ? plural(o.unidad, 2) : 'receta completa';
        return (
          <button key={o.forma ?? 'configurada'} type="button" onClick={() => onChange(o.forma)}
            className={clsx('px-3 py-1.5 text-xs rounded-full border font-medium cursor-pointer',
              o === elegida ? 'bg-primary text-white border-primary' : 'bg-white text-text-muted border-gray-300 hover:border-primary')}>
            {nombre[0].toUpperCase() + nombre.slice(1)}
          </button>
        );
      })}
    </div>
  );
}
