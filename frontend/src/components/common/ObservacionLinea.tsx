import { useState } from 'react';
import clsx from 'clsx';
import { MessageSquare } from 'lucide-react';

const MAX_OBSERVACION = 255;

// Observacion libre de una linea de receta. Un iconito al lado del nombre abre
// el campo para escribirla; si ya tiene, se ve debajo del nombre y un click la
// edita. Enter, Escape o salir del campo lo cierran (Escape sin cerrar el modal).
export default function ObservacionLinea({ value, onChange }: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const cerrar = () => { onChange(value.trim()); setAbierta(false); };

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)}
        title={value ? 'Editar observación' : 'Agregar observación'} aria-label="Observación"
        className={clsx('ml-1 align-middle cursor-pointer', value ? 'text-primary' : 'text-gray-300 hover:text-primary')}>
        <MessageSquare size={12} fill={value ? 'currentColor' : 'none'} />
      </button>
      {abierta ? (
        <input autoFocus value={value} maxLength={MAX_OBSERVACION} placeholder="Observación..."
          onChange={(e) => onChange(e.target.value)}
          onBlur={cerrar}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            cerrar();
          }}
          className="mt-1 block w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary/30" />
      ) : value && (
        <button type="button" onClick={() => setAbierta(true)} title="Editar observación"
          className="mt-0.5 block text-left text-[11px] italic text-text-muted hover:text-primary cursor-pointer break-words">
          {value}
        </button>
      )}
    </>
  );
}
