import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ClipboardList } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { formatMoney, formatPercent } from '../../utils/formatters';
import { getFoodCostColor } from '../../utils/calculators';
import { ppApi } from './api';
import type { EstadoPedido } from './types';

const ESTADOS: Record<EstadoPedido, { label: string; clase: string }> = {
  pendiente: { label: 'Pendiente', clase: 'bg-amber-100 text-amber-800' },
  en_produccion: { label: 'En producción', clase: 'bg-blue-100 text-blue-800' },
  listo: { label: 'Listo', clase: 'bg-green-100 text-green-800' },
  entregado: { label: 'Entregado', clase: 'bg-gray-200 text-gray-700' },
  cancelado: { label: 'Cancelado', clase: 'bg-red-100 text-red-700' },
};

// Orden normal del pedido: pasar a uno posterior es avanzar.
const AVANCE: EstadoPedido[] = ['pendiente', 'en_produccion', 'listo', 'entregado'];

const ORIGEN: Record<string, string> = { pos: 'POS', web: 'Tienda', panel: 'Panel' };

const fechaHora = (s: string | null) => (s
  ? new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—');

function Estado({ estado }: { estado: EstadoPedido }) {
  return <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', ESTADOS[estado].clase)}>{ESTADOS[estado].label}</span>;
}

function FoodCost({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-text-muted">—</span>;
  return <span className="font-semibold" style={{ color: getFoodCostColor(valor) }}>{formatPercent(valor)}</span>;
}

export default function Pedidos() {
  const [estado, setEstado] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['pp-pedidos', estado],
    queryFn: () => ppApi.getPedidos({ estado: estado || undefined }),
    refetchInterval: 30000, // los pedidos entran solos desde el POS
  });
  const pedidos = data?.data || [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {[['', 'Todos'], ...Object.entries(ESTADOS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setEstado(k)}
            className={clsx('text-xs px-3 py-1.5 rounded-full border', estado === k ? 'bg-primary text-white border-primary' : 'bg-white border-gray-300 hover:border-primary')}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : pedidos.length === 0 ? (
        <EmptyState icon={<ClipboardList size={48} className="mb-3 opacity-40" />} message="Todavía no hay pedidos. Entran desde el POS por la API." />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-text-muted">
                <th className="px-3 py-2 text-left font-medium">Pedido</th>
                <th className="px-3 py-2 text-left font-medium">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">Entrega</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Costo</th>
                <th className="px-3 py-2 text-right font-medium">Food cost</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} onClick={() => setAbierto(p.id)} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{p.numero}</div>
                    <div className="text-xs text-text-muted">{ORIGEN[p.origen]} · {fechaHora(p.created_at)} · {p.unidades} u.</div>
                  </td>
                  <td className="px-3 py-2">{p.cliente_nombre || '—'}</td>
                  <td className="px-3 py-2 text-xs">{fechaHora(p.fecha_entrega)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatMoney(p.total)}</td>
                  <td className="px-3 py-2 text-right font-mono text-text-muted">{formatMoney(p.costo_total)}</td>
                  <td className="px-3 py-2 text-right"><FoodCost valor={p.food_cost} /></td>
                  <td className="px-3 py-2"><Estado estado={p.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierto != null && <DetallePedido id={abierto} onClose={() => setAbierto(null)} />}
    </div>
  );
}

function DetallePedido({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['pp-pedido', id], queryFn: () => ppApi.getPedido(id) });
  const p = data?.data;

  const cambiar = useMutation({
    mutationFn: (estado: EstadoPedido) => ppApi.cambiarEstado(id, estado),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pp-pedidos'] });
      qc.invalidateQueries({ queryKey: ['pp-pedido', id] });
      toast.success('Estado actualizado');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Modal isOpen onClose={onClose} title={p ? `Pedido ${p.numero}` : 'Pedido'} size="lg"
      footer={p && p.transiciones.length > 0 ? (
        <>
          {p.transiciones.map((e) => (
            <Button key={e} size="sm" variant={e === 'cancelado' ? 'danger' : AVANCE.indexOf(e) > AVANCE.indexOf(p.estado) ? 'primary' : 'secondary'}
              loading={cambiar.isPending && cambiar.variables === e} onClick={() => cambiar.mutate(e)}>
              {e === 'cancelado' ? 'Cancelar pedido' : `Pasar a ${ESTADOS[e].label.toLowerCase()}`}
            </Button>
          ))}
        </>
      ) : undefined}>
      {isLoading || !p ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Estado estado={p.estado} />
            <span className="text-text-muted">{ORIGEN[p.origen]}{p.ref_externa ? ` · venta ${p.ref_externa}` : ''} · {fechaHora(p.created_at)}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <div><span className="text-text-muted">Cliente: </span>{p.cliente_nombre || '—'}{p.cliente_telefono ? ` · ${p.cliente_telefono}` : ''}</div>
            <div><span className="text-text-muted">Entrega: </span>{fechaHora(p.fecha_entrega)}</div>
          </div>
          {p.notas && <p className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{p.notas}</p>}

          {p.items.map((it) => (
            <div key={it.id} className="border border-gray-200 rounded-lg">
              <div className="flex justify-between gap-2 px-3 py-2 bg-gray-50 rounded-t-lg">
                <span className="font-semibold">{it.cantidad} × {it.nombre}{it.peso_kg ? ` · ${it.peso_kg} kg` : ''}</span>
                <span className="font-mono">{formatMoney(it.precio_unitario * it.cantidad)}</span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {it.opciones.map((o) => (
                    <tr key={o.id} className="border-t border-gray-100">
                      <td className="px-3 py-1 text-text-muted w-28">{o.paso_nombre}</td>
                      <td className="px-3 py-1">{o.opcion_nombre}</td>
                      <td className="px-3 py-1 text-right font-mono">{formatMoney(o.precio)}</td>
                      <td className="px-3 py-1 text-right font-mono text-text-muted">{formatMoney(o.costo)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-100">
                    <td className="px-3 py-1 text-text-muted" colSpan={2}>Unitario</td>
                    <td className="px-3 py-1 text-right font-mono">{formatMoney(it.precio_unitario)}</td>
                    <td className="px-3 py-1 text-right font-mono text-text-muted">{formatMoney(it.costo_unitario)}</td>
                  </tr>
                </tbody>
              </table>
              {it.notas && <p className="px-3 py-1.5 text-xs border-t border-gray-100">📝 {it.notas}</p>}
            </div>
          ))}

          <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-lg p-3">
            <div><div className="text-xs text-text-muted">Total</div><div className="font-bold">{formatMoney(p.total)}</div></div>
            <div><div className="text-xs text-text-muted">Costo</div><div className="font-bold">{formatMoney(p.costo_total)}</div></div>
            <div><div className="text-xs text-text-muted">Food cost</div><FoodCost valor={p.food_cost} /></div>
          </div>
          <p className="text-xs text-text-muted">Precios y costos del momento del pedido: no cambian aunque después cambien las recetas.</p>
        </div>
      )}
    </Modal>
  );
}
