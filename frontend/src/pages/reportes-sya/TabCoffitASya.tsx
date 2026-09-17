import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Send, AlertCircle, Package, DollarSign, TrendingDown, Download, Calendar,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { enviosApi } from '../../api/envios';
import type { ReporteEnviosData } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { formatMoney } from '../../utils/formatters';
import { useDebounce } from '../../hooks/useDebounce';
import { todayStr, getWeekRange, getMonthRange, formatFecha, DAY_NAMES } from './utils';
import { StatCardAvanzado } from './StatCardAvanzado';

export default function TabCoffitASya() {
  const [periodo, setPeriodo] = useState<'hoy' | 'semana' | 'mes' | 'custom'>('mes');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [buscar, setBuscar] = useState('');
  const debouncedBuscar = useDebounce(buscar);

  const range = useMemo(() => {
    if (periodo === 'hoy') { const t = todayStr(); return { desde: t, hasta: t }; }
    if (periodo === 'semana') return getWeekRange();
    if (periodo === 'mes') return getMonthRange();
    return { desde: customDesde, hasta: customHasta };
  }, [periodo, customDesde, customHasta]);

  const canQuery = !!(range.desde && range.hasta);

  const { data: reporteRes, isLoading } = useQuery({
    queryKey: ['reporte-envios-coffit-sya', range.desde, range.hasta, debouncedBuscar],
    queryFn: () => enviosApi.getReporte(range.desde, range.hasta, debouncedBuscar || undefined),
    enabled: canQuery,
  });

  const reporte: ReporteEnviosData | null = reporteRes?.data || null;

  const top10Enviados = useMemo(() => {
    if (!reporte) return [];
    return [...reporte.porProducto].sort((a, b) => b.monto_enviado - a.monto_enviado).slice(0, 10);
  }, [reporte]);

  const top10Vencidos = useMemo(() => {
    if (!reporte) return [];
    return [...reporte.porProducto]
      .filter((p) => p.total_vencidos > 0)
      .sort((a, b) => b.monto_vencido - a.monto_vencido)
      .slice(0, 10);
  }, [reporte]);

  const porDiaChart = useMemo(() => {
    if (!reporte) return [];
    return reporte.porDia.map((d) => {
      const fechaClean = typeof d.fecha === 'string' ? d.fecha.substring(0, 10) : '';
      const parts = fechaClean.split('-');
      const yyyy = parseInt(parts[0] || '0');
      const mmNum = parseInt(parts[1] || '0') - 1;
      const ddNum = parseInt(parts[2] || '0');
      const dateObj = new Date(yyyy, mmNum, ddNum);
      const dayName = !isNaN(dateObj.getTime()) ? DAY_NAMES[dateObj.getDay()] : '?';
      return {
        label: `${dayName} ${String(ddNum).padStart(2, '0')}/${String(mmNum + 1).padStart(2, '0')}`,
        enviado: Number(d.monto_enviado),
        vencido: Number(d.monto_vencido),
      };
    });
  }, [reporte]);

  const handleExportCSV = () => {
    if (!reporte || reporte.registros.length === 0) return;
    const rows = [
      'Fecha,Producto,Enviados,Vencidos,Vendidos,Costo unitario,Monto enviado,Monto vencido,Monto vendido',
    ];
    reporte.registros.forEach((r) => {
      const nombre = r.producto_nombre.replace(/"/g, '""');
      rows.push(
        `${formatFecha(r.fecha)},"${nombre}",${r.cantidad_enviada},${r.cantidad_vencida},${r.cantidad_vendida},${r.costo_unitario.toFixed(2)},${r.monto_enviado.toFixed(2)},${r.monto_vencido.toFixed(2)},${r.monto_vendido.toFixed(2)}`
      );
    });
    const csv = '\uFEFF' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `envios-coffit-sya-${range.desde}_${range.hasta}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {(['hoy', 'semana', 'mes', 'custom'] as const).map((p) => (
            <button key={p} onClick={() => setPeriodo(p)}
              className={`py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                periodo === p ? 'bg-primary text-white' : 'bg-gray-100 text-text-muted hover:bg-gray-200'
              }`}>
              {p === 'hoy' ? 'Hoy' : p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : 'Rango'}
            </button>
          ))}
        </div>

        {periodo === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Desde</label>
              <input type="date" value={customDesde} onChange={(e) => setCustomDesde(e.target.value)}
                className="w-full px-2 py-2.5 text-sm border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Hasta</label>
              <input type="date" value={customHasta} onChange={(e) => setCustomHasta(e.target.value)}
                className="w-full px-2 py-2.5 text-sm border border-gray-300 rounded-lg" />
            </div>
          </div>
        )}

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !reporte || reporte.totales.total_envios === 0 ? (
        <EmptyState message="No hay envios registrados en este periodo" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCardAvanzado label="Enviado" cantidad={reporte.totales.total_enviados}
              monto={reporte.totales.monto_enviado}
              icon={<Send size={20} className="text-primary" />} color="primary" />
            <StatCardAvanzado label="Vencido" cantidad={reporte.totales.total_vencidos}
              monto={reporte.totales.monto_vencido}
              icon={<AlertCircle size={20} className="text-red-500" />} color="red" />
            <StatCardAvanzado label="Vendido" cantidad={reporte.totales.total_vendidos}
              monto={reporte.totales.monto_vendido}
              icon={<TrendingDown size={20} className="text-green-500" />} color="green" />
            <StatCardAvanzado label="Productos" cantidad={reporte.totales.productos_distintos} monto={null}
              subtitle={`${reporte.totales.total_envios} envios`}
              icon={<Package size={20} className="text-blue-500" />} color="blue" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <DollarSign size={16} /> Distribucion por monto
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={[
                    { name: 'Vendido', value: reporte.totales.monto_vendido },
                    { name: 'Vencido', value: reporte.totales.monto_vencido },
                  ]} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value"
                    label={(entry) => `${entry.name}: ${formatMoney(entry.value)}`} labelLine={false}>
                    <Cell fill="#10b981" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Calendar size={16} /> Evolucion diaria
              </h3>
              {porDiaChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={porDiaChart} margin={{ left: 0, right: 10, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v / 1000}k`} />
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="enviado" fill="#E07B39" name="Enviado" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="vencido" fill="#ef4444" name="Vencido" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-10 text-text-muted text-sm">Sin datos</div>
              )}
            </div>
          </div>

          {top10Enviados.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-bold mb-3">Top 10 productos enviados (por monto)</h3>
              <ResponsiveContainer width="100%" height={Math.max(250, top10Enviados.length * 35)}>
                <BarChart data={top10Enviados} layout="vertical" margin={{ left: 0, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v / 1000}k`} />
                  <YAxis type="category" dataKey="producto_nombre" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Bar dataKey="monto_enviado" fill="#E07B39" radius={[0, 4, 4, 0]} name="Monto enviado" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {top10Vencidos.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-bold mb-3 text-red-600 flex items-center gap-2">
                <AlertCircle size={16} /> Top 10 productos con vencidos (perdida economica)
              </h3>
              <ResponsiveContainer width="100%" height={Math.max(220, top10Vencidos.length * 35)}>
                <BarChart data={top10Vencidos} layout="vertical" margin={{ left: 0, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v / 1000}k`} />
                  <YAxis type="category" dataKey="producto_nombre" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Bar dataKey="monto_vencido" fill="#ef4444" radius={[0, 4, 4, 0]} name="Monto perdido" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-bold">Resumen por producto</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2.5 text-left font-semibold text-text-muted">Producto</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Envios</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Enviados</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Vencidos</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Vendidos</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Costo/u</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Monto enviado</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Perdido</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.porProducto.map((p, idx) => (
                    <tr key={idx} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 font-medium">{p.producto_nombre}</td>
                      <td className="px-3 py-2.5 text-right text-text-muted">{p.n_envios}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{Number(p.total_enviados)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${p.total_vencidos > 0 ? 'text-red-600 font-bold' : 'text-text-muted'}`}>
                        {Number(p.total_vencidos)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-green-700">{Number(p.total_vendidos)}</td>
                      <td className="px-3 py-2.5 text-right text-text-muted">{formatMoney(p.costo_unitario)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{formatMoney(p.monto_enviado)}</td>
                      <td className={`px-3 py-2.5 text-right ${p.monto_vencido > 0 ? 'text-red-600 font-bold' : 'text-text-muted'}`}>
                        {formatMoney(p.monto_vencido)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-200 font-bold bg-gray-50">
                    <td className="px-3 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right">{reporte.totales.total_envios}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{Number(reporte.totales.total_enviados)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-red-600">{Number(reporte.totales.total_vencidos)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-green-700">{Number(reporte.totales.total_vendidos)}</td>
                    <td></td>
                    <td className="px-3 py-2.5 text-right">{formatMoney(reporte.totales.monto_enviado)}</td>
                    <td className="px-3 py-2.5 text-right text-red-600">{formatMoney(reporte.totales.monto_vencido)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Detalle de registros ({reporte.registros.length})</h3>
              <button onClick={handleExportCSV}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-primary rounded-lg hover:bg-primary/5">
                <Download size={14} /> Exportar CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2.5 text-left font-semibold text-text-muted">Fecha</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-text-muted">Producto</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Env.</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Venc.</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Vend.</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Costo/u</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">M. Enviado</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-text-muted">M. Perdido</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-text-muted">Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.registros.map((r) => (
                    <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatFecha(r.fecha)}</td>
                      <td className="px-3 py-2.5 font-medium">{r.producto_nombre}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{Number(r.cantidad_enviada)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${r.cantidad_vencida > 0 ? 'text-red-600 font-bold' : 'text-text-muted'}`}>
                        {Number(r.cantidad_vencida)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-green-700">{Number(r.cantidad_vendida)}</td>
                      <td className="px-3 py-2.5 text-right text-text-muted">{formatMoney(r.costo_unitario)}</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(r.monto_enviado)}</td>
                      <td className={`px-3 py-2.5 text-right ${r.monto_vencido > 0 ? 'text-red-600 font-bold' : 'text-text-muted'}`}>
                        {formatMoney(r.monto_vencido)}
                      </td>
                      <td className="px-3 py-2.5 text-text-muted max-w-[150px] truncate">{r.observacion || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
