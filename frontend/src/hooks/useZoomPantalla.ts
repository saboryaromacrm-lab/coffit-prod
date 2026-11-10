import { useState } from 'react';

// Tamano de una pantalla de carga (produccion en la tablet, etc.). Queda
// guardado en ese navegador para que no haya que agrandarla cada vez.
const NIVELES = [1, 1.15, 1.3, 1.5, 1.75, 2];

function leer(clave: string): number {
  try {
    const n = Number(localStorage.getItem(clave));
    return NIVELES.includes(n) ? n : 1;
  } catch {
    return 1;
  }
}

export function useZoomPantalla(clave: string) {
  const [zoom, setZoom] = useState(() => leer(clave));
  const nivel = NIVELES.indexOf(zoom);

  const cambiar = (delta: -1 | 1) => {
    const nuevo = NIVELES[nivel + delta];
    if (nuevo == null) return;
    setZoom(nuevo);
    try { localStorage.setItem(clave, String(nuevo)); } catch { /* sin almacenamiento: dura hasta recargar */ }
  };

  return {
    zoom,
    achicar: nivel > 0 ? () => cambiar(-1) : undefined,
    agrandar: nivel < NIVELES.length - 1 ? () => cambiar(1) : undefined,
  };
}

export type ZoomPantalla = ReturnType<typeof useZoomPantalla>;
