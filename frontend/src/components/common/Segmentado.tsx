import clsx from 'clsx';

// Grupo de botones de un filtro, cada opcion con cuantos hay. `alerta` = color
// del numero de una opcion cuando no es 0 (ej. "Sin costear" en rojo).
export default function Segmentado<T extends string>({ etiqueta, opciones, valor, onCambiar, conteo, alerta = {} }: {
  etiqueta: string;
  opciones: readonly { id: T; label: string }[];
  valor: T;
  onCambiar: (v: T) => void;
  conteo: Record<T, number>;
  alerta?: Partial<Record<T, string>>;
}) {
  return (
    <div className="grid grid-cols-2 sm:flex w-full sm:w-auto gap-1 bg-gray-100 rounded-lg p-1" role="group" aria-label={etiqueta}>
      {opciones.map((f) => (
        <button key={f.id} type="button" onClick={() => onCambiar(f.id)} aria-pressed={valor === f.id}
          className={clsx('px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors',
            valor === f.id ? 'bg-white shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary')}>
          {f.label}
          <span className={clsx('ml-1.5 tabular-nums', (conteo[f.id] > 0 && alerta[f.id]) || 'text-text-muted')}>{conteo[f.id]}</span>
        </button>
      ))}
    </div>
  );
}
