import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, Truck, Scale, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart,
} from 'recharts';
import { enviosApi } from '../../api/envios';
import type { ResultadosData } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { formatMoney } from '../../utils/formatters';
import { todayStr, getWeekRange, getMonthRange, formatFecha, DAY_NAMES } from './utils';

export default function TabResultados() {
  const [periodo, setPeriodo] = useState<'hoy' | 'semana' | 'mes' | 'custom'>('mes');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');

  const range = useMemo(() => {
    if (periodo === 'hoy') { const t = todayStr(); return { desde: t, hasta: t }; }
    if (periodo === 'semana') return getWeekRange();
    if (periodo === 'mes') return getMonthRange();
    return { desde: customDesde, hasta: customHasta };
  }, [periodo, customDesde, customHasta]);

  const canQuery = !!(range.desde && range.hasta);

  const { data: resultadosRes, isLoading } = useQuery({
    queryKey: ['envios-resultados', range.desde, range.hasta],
    queryFn: () => enviosApi.getResultados(range.desde, range.hasta),
    enabled: canQuery,
  });

  const resultados: ResultadosData | null = resultadosRes?.data || null;

  const porDiaChart = useMemo(() => {
    if (!resultados) return [];
    return resultados.porDia.map((d) => {
      const fechaClean = typeof d.fecha === 'string' ? d.fecha.substring(0, 10) : '';
      const parts = fechaClean.split('-');
      const yyyy = parseInt(parts[0] || '0');
      const mmNum = parseInt(parts[1] || '0') - 1;
      const ddNum = parseInt(parts[2] || '0');
      const dateObj = new Date(yyyy, mmNum, ddNum);
      const dayName = !isNaN(dateObj.getTime()) ? DAY_NAMES[dateObj.getDay()] : '?';
      return {
        label: `${dayName} ${String(ddNum).padStart(2, '0')}/${String(mmNum + 1).padStart(2, '0')}`,
        enviado: Number(d.enviado_sya),
        recibido: Number(d.recibido_coffit),
        balance: Number(d.balance),
      };
    });
  }, [resultados]);

  const barChartCompare = useMemo(() => {
    if (!resultados) return [];
    return [
      {
        nombre: 'Enviado a SyA',
        util: resultados.enviado_a_sya.monto_util,
      },
      {
        nombre: 'Recibido de SyA',
        util: resultados.recibido_de_sya.monto_util,
      },
    ];
  }, [resultados]);

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
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !resultados ? (
        <EmptyState message="No hay datos en este periodo" />
      ) : (
        <>
          {/* 3 cards: Enviado / Recibido / Balance */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Enviado a SyA */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/5 rounded-lg">
                  <Send size={20} className="text-primary" />
                </div>
                <div>
                  <div className="text-xs text-text-muted">Envie a SyA</div>
                  <div className="text-xs text-text-muted">(productos utiles)</div>
                </div>
              </div>
              <div className="text-2xl font-bold text-text-primary">
                {formatMoney(resultados.enviado_a_sya.monto_util)}
              </div>
              <div className="text-[11px] text-text-muted space-y-0.5">
                <div>Cant. enviada: {Number(resultados.enviado_a_sya.cant_enviada)}</div>
                <div>Vencidos: {Number(resultados.enviado_a_sya.cant_vencida)} ({formatMoney(resultados.enviado_a_sya.monto_vencido)})</div>
              </div>
            </div>

            {/* Recibido de SyA */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Truck size={20} className="text-blue-500" />
                </div>
                <div>
                  <div className="text-xs text-text-muted">Recibi de SyA</div>
                  <div className="text-xs text-text-muted">(ingredientes utiles)</div>
                </div>
              </div>
              <div className="text-2xl font-bold text-text-primary">
                {formatMoney(resultados.recibido_de_sya.monto_util)}
              </div>
              <div className="text-[11px] text-text-muted space-y-0.5">
                <div>Cant. recibida: {Number(resultados.recibido_de_sya.cant_enviada)}</div>
                <div>Devueltos: {Number(resultados.recibido_de_sya.cant_devuelta)} ({formatMoney(resultados.recibido_de_sya.monto_devuelto)})</div>
              </div>
            </div>

            {/* Balance */}
            <div className={`rounded-xl border p-4 space-y-2 ${
              resultados.balance > 0
                ? 'bg-green-50 border-green-200'
                : resultados.balance < 0
                ? 'bg-red-50 border-red-200'
                : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${
                  resultados.balance > 0 ? 'bg-green-100' : resultados.balance < 0 ? 'bg-red-100' : 'bg-gray-100'
                }`}>
                  {resultados.balance > 0 ? (
                    <TrendingUp size={20} className="text-green-600" />
                  ) : resultados.balance < 0 ? (
                    <TrendingDown size={20} className="text-red-600" />
                  ) : (
                    <Scale size={20} className="text-gray-600" />
                  )}
                </div>
                <div>
                  <div className="text-xs text-text-muted">Balance neto</div>
                  <div className="text-xs font-semibold">
                    {resultados.balance > 0
                      ? 'SyA te debe'
                      : resultados.balance < 0
                      ? 'Vos le debes a SyA'
                      : 'Equilibrado'}
                  </div>
                </div>
              </div>
              <div className={`text-2xl font-bold ${
                resultados.balance > 0 ? 'text-green-700' : resultados.balance < 0 ? 'text-red-700' : 'text-gray-700'
              }`}>
                {resultados.balance >= 0 ? '+' : ''}{formatMoney(resultados.balance)}
              </div>
              <div className="text-[11px] text-text-muted">
                Envie - Recibi = {formatMoney(resultados.enviado_a_sya.monto_util)} - {formatMoney(resultados.recibido_de_sya.monto_util)}
              </div>
            </div>
          </div>

          {/* Bar chart comparativo */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-sm font-bold mb-3">Comparativa de montos utiles</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barChartCompare} margin={{ left: 0, right: 10, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Bar dataKey="util" fill="#E07B39" radius={[4, 4, 0, 0]} name="Monto util" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Evolucion diaria */}
          {porDiaChart.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Calendar size={16} /> Evolucion diaria
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={porDiaChart} margin={{ left: 0, right: 10, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="enviado" fill="#E07B39" name="Enviado a SyA" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="recibido" fill="#3b82f6" name="Recibido de SyA" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="balance" stroke="#10b981" name="Balance" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla por dia */}
          {resultados.porDia.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold">Detalle por dia</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2.5 text-left font-semibold text-text-muted">Fecha</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Envie a SyA</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Recibi de SyA</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-text-muted">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.porDia.map((d, idx) => (
                      <tr key={idx} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-3 py-2.5 whitespace-nowrap">{formatFecha(d.fecha)}</td>
                        <td className="px-3 py-2.5 text-right">{formatMoney(d.enviado_sya)}</td>
                        <td className="px-3 py-2.5 text-right">{formatMoney(d.recibido_coffit)}</td>
                        <td className={`px-3 py-2.5 text-right font-bold ${
                          d.balance > 0 ? 'text-green-600' : d.balance < 0 ? 'text-red-600' : 'text-text-muted'
                        }`}>
                          {d.balance >= 0 ? '+' : ''}{formatMoney(d.balance)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-200 font-bold bg-gray-50">
                      <td className="px-3 py-2.5">Total</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(resultados.enviado_a_sya.monto_util)}</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(resultados.recibido_de_sya.monto_util)}</td>
                      <td className={`px-3 py-2.5 text-right ${
                        resultados.balance > 0 ? 'text-green-600' : resultados.balance < 0 ? 'text-red-600' : 'text-text-muted'
                      }`}>
                        {resultados.balance >= 0 ? '+' : ''}{formatMoney(resultados.balance)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
