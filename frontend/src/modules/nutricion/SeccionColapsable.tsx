import { ChevronRight } from 'lucide-react';

// Seccion plegable, cerrada por defecto, para el detalle largo de un producto.
// `resumen` se ve aunque este cerrada (cantidades, avisos).
export default function SeccionColapsable({ titulo, resumen, children }: {
  titulo: string; resumen?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <details className="group border border-gray-200 rounded-lg">
      <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none list-none rounded-lg hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} className="text-text-muted shrink-0 transition-transform group-open:rotate-90" />
        <span className="text-sm font-medium">{titulo}</span>
        {resumen && <span className="flex flex-wrap gap-x-2 text-xs text-text-muted min-w-0">{resumen}</span>}
      </summary>
      <div className="border-t border-gray-200 overflow-x-auto">{children}</div>
    </details>
  );
}
