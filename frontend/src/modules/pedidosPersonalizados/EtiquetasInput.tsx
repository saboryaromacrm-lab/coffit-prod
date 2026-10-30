import { useState } from 'react';

interface Props {
  value: string[];
  onChange: (etiquetas: string[]) => void;
  placeholder?: string;
  className?: string;
}

// Etiquetas separadas por coma. El texto se muestra tal cual se escribe: si
// se reconstruyera desde la lista en cada tecla, la coma y el espacio se
// borrarian y no se podria escribir otra etiqueta ni "SIN TACC".
export default function EtiquetasInput({ value, onChange, placeholder, className }: Props) {
  const [texto, setTexto] = useState(value.join(', '));
  return (
    <input value={texto} placeholder={placeholder} className={className}
      onChange={(e) => {
        setTexto(e.target.value);
        onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean));
      }} />
  );
}
