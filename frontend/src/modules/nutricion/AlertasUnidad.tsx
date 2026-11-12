import type { AlertaUnidad } from './types';

// Lineas de receta con una cantidad sospechosa segun la IA, con enlace a la
// receta (se abre en otra pestaña para corregirla).
export default function AlertasUnidad({ alertas, unidad }: { alertas: AlertaUnidad[]; unidad: string }) {
  return (
    <ul className="space-y-1 text-xs text-red-800">
      {alertas.map((a) => (
        <li key={`${a.tipo}-${a.receta_id}-${a.cantidad}`}>
          <a href={`/${a.tipo === 'producto' ? 'productos' : 'subrecetas'}?openId=${a.receta_id}`} target="_blank" rel="noopener noreferrer"
            className="font-medium underline hover:text-red-900">{a.receta}</a>
          {' '}usa <strong>{a.cantidad.toLocaleString('es-AR')} {unidad}</strong>: {a.motivo}
        </li>
      ))}
    </ul>
  );
}
