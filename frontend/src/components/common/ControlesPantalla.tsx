import { useEffect, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize, Minimize } from 'lucide-react';
import type { ZoomPantalla } from '../../hooks/useZoomPantalla';

// Botones grandes para agrandar/achicar y pasar a pantalla completa, pensados
// para la barra oscura de las pantallas de carga en tablet.
const boton = 'w-10 h-10 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 active:bg-white/30 disabled:opacity-30 cursor-pointer';

export default function ControlesPantalla({ zoom, achicar, agrandar }: ZoomPantalla) {
  const [completa, setCompleta] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    const actualizar = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', actualizar);
    return () => document.removeEventListener('fullscreenchange', actualizar);
  }, []);

  const alternarCompleta = () => {
    const pedido = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    pedido.catch(() => { /* el navegador lo rechazo: queda como estaba */ });
  };

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={achicar} disabled={!achicar} className={boton} title="Achicar" aria-label="Achicar">
        <ZoomOut size={20} />
      </button>
      <span className="text-white/70 text-xs w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={agrandar} disabled={!agrandar} className={boton} title="Agrandar" aria-label="Agrandar">
        <ZoomIn size={20} />
      </button>
      {/* Sin soporte (ej. iPhone) el boton no aparece */}
      {document.fullscreenEnabled && (
        <button type="button" onClick={alternarCompleta} className={`${boton} ml-1`}
          title={completa ? 'Salir de pantalla completa' : 'Pantalla completa'} aria-label={completa ? 'Salir de pantalla completa' : 'Pantalla completa'}>
          {completa ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      )}
    </div>
  );
}
