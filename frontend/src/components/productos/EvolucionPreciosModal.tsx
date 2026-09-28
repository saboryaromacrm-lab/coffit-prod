import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { productosApi, type CambioPrecio, type OrigenCambioPrecio } from '../../api/productos';
import { formatMoney } from '../../utils/formatters';
import Modal from '../common/Modal';
import LoadingSpinner from '../common/LoadingSpinner';

const ORIGEN: Record<OrigenCambioPrecio, string> = {
  alta: 'Alta',
  producto: 'Productos',
  carta: 'Carta',
  historico: 'Registro previo',
};

// Fecha y hora en horario de Argentina (la base guarda en UTC).
function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function Variacion({ c }: { c: CambioPrecio }) {
  if (c.variacion == null) return <span className="text-text-muted">—</span>;
  const sube = c.variacion > 0;
  const Icono = sube ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${sube ? 'text-amber-600' : 'text-emerald-600'}`}>
      <Icono size={13} />
      {sube ? '+' : '−'}{formatMoney(Math.abs(c.variacion))}
      {c.variacion_pct != null && (
        <span className="text-xs">({sube ? '+' : '−'}{Math.abs(c.variacion_pct).toFixed(1)}%)</span>
      )}
    </span>
  );
}

export default function EvolucionPreciosModal({ productoId, onClose }: { productoId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['producto-precios', productoId],
    queryFn: () => productosApi.getEvolucionPrecios(productoId),
    // Siempre fresco al abrir: el precio se puede cambiar desde Productos o
    // desde la Carta, y el cache global (30s) mostraria un historial viejo.
    staleTime: 0,
  });
  const evo = data?.data;
  const cambios = evo?.cambios || [];

  // Variacion acumulada: desde el precio mas viejo que se conoce hasta el actual.
  const masViejo = cambios[cambios.length - 1];
  const precioInicial = masViejo ? (masViejo.precio_anterior ?? masViejo.precio_nuevo) : null;
  const acumulada = evo && precioInicial ? evo.producto.precio_actual - precioInicial : null;
  const acumuladaPct = acumulada != null && precioInicial ? (acumulada / precioInicial) * 100 : null;
  // Los "registro previo" salen de cuando solo se guardaba el ultimo cambio:
  // lo anterior a esa fecha no quedo guardado en ningun lado.
  const arrancaIncompleto = masViejo?.origen === 'historico';

  return (
    <Modal isOpen onClose={onClose} title={evo ? `Evolución de precios: ${evo.producto.nombre}` : 'Evolución de precios'} size="lg">
      {isLoading ? <LoadingSpinner /> : !evo ? null : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-text-muted">Precio actual</div>
              <div className="text-lg font-bold">{formatMoney(evo.producto.precio_actual)}</div>
            </div>
            {acumulada != null && cambios.length > 0 && acumulada !== 0 && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-text-muted">Variación desde {formatMoney(precioInicial!)}</div>
                <div className={`text-lg font-bold ${acumulada > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {acumulada > 0 ? '+' : '−'}{formatMoney(Math.abs(acumulada))}
                  {acumuladaPct != null && <span className="text-sm ml-1">({acumulada > 0 ? '+' : '−'}{Math.abs(acumuladaPct).toFixed(1)}%)</span>}
                </div>
              </div>
            )}
          </div>

          {cambios.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-6">
              Todavía no hay cambios de precio registrados. A partir de ahora cada cambio queda guardado acá.
            </p>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-text-muted text-xs">
                      <th className="px-3 py-2 text-left font-medium">Fecha</th>
                      <th className="px-3 py-2 text-right font-medium">Precio nuevo</th>
                      <th className="px-3 py-2 text-right font-medium">Anterior</th>
                      <th className="px-3 py-2 text-right font-medium">Variación</th>
                      <th className="px-3 py-2 text-left font-medium">Desde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cambios.map((c) => (
                      <tr key={c.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 whitespace-nowrap">{fechaHora(c.fecha)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatMoney(c.precio_nuevo)}</td>
                        <td className="px-3 py-2 text-right text-text-muted">
                          {c.precio_anterior != null ? formatMoney(c.precio_anterior) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap"><Variacion c={c} /></td>
                        <td className="px-3 py-2 text-xs text-text-muted whitespace-nowrap">{ORIGEN[c.origen] || c.origen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {arrancaIncompleto && (
            <p className="text-[11px] text-text-muted">
              Antes del {fechaHora(masViejo!.fecha).split(',')[0]} la app solo guardaba el último cambio, así que la evolución
              previa a esa fecha no quedó registrada.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
