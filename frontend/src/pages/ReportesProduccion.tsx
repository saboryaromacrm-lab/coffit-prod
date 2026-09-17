import { useState, useMemo, useEffect } from 'react';
import {
  Search, Edit2, Trash2, Calendar, Clock, User,
  FileText, Package, BarChart3, Filter, Apple, Download,
  CheckCircle, AlertCircle, XCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { produccionApi, type RegistrosFilters } from '../api/produccion';
import type {
  Operario, ProduccionRegistro, ProduccionRegistroInput,
  ProductoCatalogo, ReporteData, ReporteIngredientesData,
} from '../types';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import NumericInput from '../components/common/NumericInput';
import MultiSelectItems from '../components/common/MultiSelectItems';
import { formatDate, formatMoney } from '../utils/formatters';
import { useDebounce } from '../hooks/useDebounce';

type TabType = 'reportes' | 'historial' | 'ingredientes';

const ESTADOS = ['Completado', 'En proceso', 'Cancelado'] as const;
function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getWeekRange(): { desde: string; hasta: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    desde: monday.toISOString().split('T')[0],
    hasta: sunday.toISOString().split('T')[0],
  };
}

function getMonthRange(): { desde: string; hasta: string } {
  const now = new Date();
  const desde = new Date(now.getFullYear(), now.getMonth(), 1);
  const hasta = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    desde: desde.toISOString().split('T')[0],
    hasta: hasta.toISOString().split('T')[0],
  };
}

// Devuelve el lunes (ISO week start) de la fecha dada. Mantiene zona local.
function getMondayOf(dateStr: string): Date | null {
  const clean = (dateStr || '').substring(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return null;
  const yyyy = parseInt(parts[0]);
  const mm = parseInt(parts[1]) - 1;
  const dd = parseInt(parts[2]);
  if (isNaN(yyyy) || isNaN(mm) || isNaN(dd)) return null;
  const d = new Date(yyyy, mm, dd);
  if (isNaN(d.getTime())) return null;
  const dow = d.getDay(); // 0=Dom, 1=Lun, ..., 6=Sab
  const diff = dow === 0 ? -6 : 1 - dow; // mover a lunes
  d.setDate(d.getDate() + diff);
  return d;
}

function fmtDDMM(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Agrupa el array porDia en semanas ISO (Lun-Dom). Devuelve [{ semana, label, cantidad, registros, desde, hasta }]
function aggregateByWeek(porDia: ReporteData['porDia']): Array<{
  semana: string;
  label: string;
  cantidad: number;
  registros: number;
  desde: string;
  hasta: string;
}> {
  const map = new Map<string, { lunes: Date; cantidad: number; registros: number }>();
  porDia.forEach((d) => {
    const monday = getMondayOf(d.fecha);
    if (!monday) return;
    const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const cur = map.get(key);
    const c = Number(d.total_cantidad) || 0;
    const r = Number(d.total_registros) || 0;
    if (cur) {
      cur.cantidad += c;
      cur.registros += r;
    } else {
      map.set(key, { lunes: monday, cantidad: c, registros: r });
    }
  });
  return Array.from(map.entries())
    .map(([key, v]) => {
      const sunday = new Date(v.lunes);
      sunday.setDate(sunday.getDate() + 6);
      const desdeStr = `${v.lunes.getFullYear()}-${String(v.lunes.getMonth() + 1).padStart(2, '0')}-${String(v.lunes.getDate()).padStart(2, '0')}`;
      const hastaStr = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
      return {
        semana: key,
        label: `${fmtDDMM(v.lunes)} - ${fmtDDMM(sunday)}`,
        cantidad: v.cantidad,
        registros: v.registros,
        desde: desdeStr,
        hasta: hastaStr,
      };
    })
    .sort((a, b) => a.semana.localeCompare(b.semana));
}

// =============================================================================
// MAIN
// =============================================================================
export default function ReportesProduccion() {
  const [activeTab, setActiveTab] = useState<TabType>('reportes');

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'reportes', label: 'Reportes', icon: <BarChart3 size={18} /> },
    { key: 'ingredientes', label: 'Ingredientes usados', icon: <Apple size={18} /> },
    { key: 'historial', label: 'Historial', icon: <FileText size={18} /> },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'reportes' && <TabReportes />}
      {activeTab === 'ingredientes' && <TabIngredientesUsados />}
      {activeTab === 'historial' && <TabHistorial />}
    </div>
  );
}

// =============================================================================
// TAB REPORTES
// =============================================================================
function TabReportes() {
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState<'hoy' | 'semana' | 'mes' | 'custom'>('semana');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [filtroOperarioId, setFiltroOperarioId] = useState('');
  const [filtroItems, setFiltroItems] = useState<string[]>([]);
  const [borrarConfirm, setBorrarConfirm] = useState<{ producto: string; cantidad: number; registros: number } | null>(null);

  const range = useMemo(() => {
    if (periodo === 'hoy') { const t = todayStr(); return { desde: t, hasta: t }; }
    if (periodo === 'semana') return getWeekRange();
    if (periodo === 'mes') return getMonthRange();
    return { desde: customDesde, hasta: customHasta };
  }, [periodo, customDesde, customHasta]);

  const canQuery = range.desde && range.hasta;

  // Ordenamos para que el queryKey sea estable (evita refetch si cambia el orden pero no el contenido)
  const productosSorted = useMemo(() => [...filtroItems].sort(), [filtroItems]);

  const reporteFilters = useMemo(() => ({
    operario_id: filtroOperarioId ? Number(filtroOperarioId) : undefined,
    productos: productosSorted.length > 0 ? productosSorted : undefined,
  }), [filtroOperarioId, productosSorted]);

  const { data: reporteData, isLoading } = useQuery({
    queryKey: ['produccion-reportes', range.desde, range.hasta, filtroOperarioId, productosSorted],
    queryFn: () => produccionApi.getReportes(range.desde, range.hasta, reporteFilters),
    enabled: !!canQuery,
  });
  const reporte: ReporteData | null = reporteData?.data || null;

  const { data: operariosData } = useQuery({
    queryKey: ['produccion-operarios'],
    queryFn: produccionApi.getOperarios,
  });
  const operarios: Operario[] = operariosData?.data || [];

  const { data: catalogoData } = useQuery({
    queryKey: ['produccion-catalogo'],
    queryFn: produccionApi.getCatalogo,
  });
  const catalogo: ProductoCatalogo[] = catalogoData?.data || [];

  // Mutation para borrar todos los registros de un producto en el periodo (con filtros activos)
  const deleteByProductoMut = useMutation({
    mutationFn: (producto_nombre: string) =>
      produccionApi.deleteRegistrosByProducto({
        producto_nombre,
        desde: range.desde,
        hasta: range.hasta,
        operario_id: filtroOperarioId ? Number(filtroOperarioId) : undefined,
      }),
    onSuccess: (res) => {
      // Invalidar TODAS las queries que dependen de los registros
      queryClient.invalidateQueries({ queryKey: ['produccion-reportes'] });
      queryClient.invalidateQueries({ queryKey: ['produccion-registros'] });
      queryClient.invalidateQueries({ queryKey: ['produccion-reporte-ingredientes'] });
      queryClient.invalidateQueries({ queryKey: ['produccion-subrecetas-usadas'] });
      const eliminados = (res?.data as { eliminados?: number } | undefined)?.eliminados ?? 0;
      toast.success(`${eliminados} registro${eliminados === 1 ? '' : 's'} eliminado${eliminados === 1 ? '' : 's'}`);
      setBorrarConfirm(null);
    },
    onError: (err: Error) => toast.error(err.message || 'Error al eliminar'),
  });

  const [exportingCSV, setExportingCSV] = useState(false);

  // ===========================================================================
  // EXPORTAR CSV COMPLETO
  // Incluye: cabecera con filtros aplicados, totales, y todas las secciones
  // (por producto, por operario, por dia, por estado, y por dia x producto).
  // Compatible con Excel (UTF-8 BOM + ; como separador).
  // ===========================================================================
  async function handleExportCSV() {
    if (!reporte) return;
    setExportingCSV(true);
    try {
      const SEP = ';';
      const lines: string[] = [];

      const escape = (v: string | number | null | undefined) => {
        const s = String(v ?? '');
        if (s.includes(SEP) || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const fmtFecha = (raw: string) => {
        const fechaClean = typeof raw === 'string' ? raw.substring(0, 10) : '';
        const parts = fechaClean.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : fechaClean;
      };

      const operarioSel = filtroOperarioId
        ? operarios.find((o) => String(o.id) === filtroOperarioId)?.nombre || filtroOperarioId
        : 'Todos';

      // Pre-fetch registros para el cruce dia x producto (respeta los mismos filtros)
      const registrosResp = await produccionApi.getRegistros({
        desde: range.desde,
        hasta: range.hasta,
        operario_id: filtroOperarioId ? Number(filtroOperarioId) : undefined,
        productos: productosSorted.length > 0 ? productosSorted : undefined,
        limit: 50000,
      });
      const registros: ProduccionRegistro[] = registrosResp.data || [];

      // Cabecera con filtros
      lines.push(['REPORTE DE PRODUCCION'].map(escape).join(SEP));
      lines.push(['Periodo', `${range.desde} a ${range.hasta}`].map(escape).join(SEP));
      lines.push(['Operario', operarioSel].map(escape).join(SEP));
      lines.push(['Productos/Subrecetas', productosSorted.length > 0 ? productosSorted.join(', ') : 'Todos'].map(escape).join(SEP));
      lines.push(['Generado', new Date().toLocaleString('es-AR')].map(escape).join(SEP));
      lines.push('');

      // Totales
      lines.push(['TOTALES'].map(escape).join(SEP));
      lines.push(['Total registros', reporte.totales.total_registros || 0].map(escape).join(SEP));
      lines.push(['Total unidades', Number(reporte.totales.total_unidades || 0)].map(escape).join(SEP));
      lines.push(['Productos distintos', reporte.totales.total_productos || 0].map(escape).join(SEP));
      lines.push(['Dias con produccion', reporte.totales.total_dias || 0].map(escape).join(SEP));
      lines.push('');

      // Por estado
      if (reporte.porEstado && reporte.porEstado.length > 0) {
        lines.push(['POR ESTADO'].map(escape).join(SEP));
        lines.push(['Estado', 'Cantidad'].map(escape).join(SEP));
        reporte.porEstado.forEach((e) => {
          lines.push([e.estado, Number(e.cantidad)].map(escape).join(SEP));
        });
        lines.push('');
      }

      // Por producto
      if (reporte.porProducto && reporte.porProducto.length > 0) {
        lines.push(['PRODUCCION POR PRODUCTO / SUBRECETA'].map(escape).join(SEP));
        lines.push(['Producto', 'Cantidad total', 'Registros'].map(escape).join(SEP));
        reporte.porProducto.forEach((p) => {
          lines.push([p.producto_nombre, Number(p.total_cantidad), Number(p.total_registros)].map(escape).join(SEP));
        });
        lines.push(['TOTAL', Number(reporte.totales.total_unidades || 0), reporte.totales.total_registros].map(escape).join(SEP));
        lines.push('');
      }

      // Por operario
      if (reporte.porOperario && reporte.porOperario.length > 0) {
        lines.push(['PRODUCCION POR OPERARIO'].map(escape).join(SEP));
        lines.push(['Operario', 'Cantidad total', 'Registros'].map(escape).join(SEP));
        reporte.porOperario.forEach((o) => {
          lines.push([o.operario, Number(o.total_cantidad), Number(o.total_registros)].map(escape).join(SEP));
        });
        lines.push('');
      }

      // Por dia
      if (reporte.porDia && reporte.porDia.length > 0) {
        lines.push(['PRODUCCION POR DIA'].map(escape).join(SEP));
        lines.push(['Fecha', 'Cantidad total', 'Registros'].map(escape).join(SEP));
        reporte.porDia.forEach((d) => {
          lines.push([fmtFecha(d.fecha), Number(d.total_cantidad), Number(d.total_registros)].map(escape).join(SEP));
        });
        lines.push('');
      }

      // Por semana (agrupa porDia en semanas Lun-Dom)
      if (reporte.porDia && reporte.porDia.length > 0) {
        const semanas = aggregateByWeek(reporte.porDia);
        if (semanas.length > 0) {
          lines.push(['PRODUCCION POR SEMANA'].map(escape).join(SEP));
          lines.push(['Semana (Lun-Dom)', 'Desde', 'Hasta', 'Cantidad total', 'Registros'].map(escape).join(SEP));
          semanas.forEach((s) => {
            lines.push([s.label, fmtFecha(s.desde), fmtFecha(s.hasta), s.cantidad, s.registros].map(escape).join(SEP));
          });
          lines.push('');
        }
      }

      // ----------------------------------------------------------------------
      // PRODUCCION POR DIA Y PRODUCTO (cruce diario)
      // Agrupa registros por (fecha, producto_nombre) sumando cantidad y registros.
      // Ordena fecha ASC, luego producto ASC dentro de cada fecha.
      // ----------------------------------------------------------------------
      if (registros.length > 0) {
        const agg = new Map<string, { fecha: string; producto: string; cantidad: number; registros: number }>();
        registros.forEach((r) => {
          const fechaKey = typeof r.fecha === 'string' ? r.fecha.substring(0, 10) : '';
          const prod = r.producto_nombre || '(sin nombre)';
          const key = `${fechaKey}__${prod}`;
          const cur = agg.get(key);
          if (cur) {
            cur.cantidad += Number(r.cantidad) || 0;
            cur.registros += 1;
          } else {
            agg.set(key, { fecha: fechaKey, producto: prod, cantidad: Number(r.cantidad) || 0, registros: 1 });
          }
        });
        const rows = Array.from(agg.values()).sort((a, b) => {
          if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
          return a.producto.localeCompare(b.producto, 'es', { sensitivity: 'base' });
        });

        lines.push(['PRODUCCION POR DIA Y PRODUCTO'].map(escape).join(SEP));
        lines.push(['Fecha', 'Producto / Subreceta', 'Cantidad', 'Registros'].map(escape).join(SEP));

        let dayTotal = 0;
        let dayRegs = 0;
        let prevFecha = '';
        rows.forEach((r, idx) => {
          // Subtotal por dia cuando cambia la fecha
          if (prevFecha && r.fecha !== prevFecha) {
            lines.push([`Subtotal ${fmtFecha(prevFecha)}`, '', dayTotal, dayRegs].map(escape).join(SEP));
            lines.push('');
            dayTotal = 0;
            dayRegs = 0;
          }
          lines.push([fmtFecha(r.fecha), r.producto, r.cantidad, r.registros].map(escape).join(SEP));
          dayTotal += r.cantidad;
          dayRegs += r.registros;
          prevFecha = r.fecha;
          // Cierre del ultimo grupo
          if (idx === rows.length - 1) {
            lines.push([`Subtotal ${fmtFecha(prevFecha)}`, '', dayTotal, dayRegs].map(escape).join(SEP));
          }
        });
        lines.push('');
      }

      // BOM para que Excel lea UTF-8 con acentos correctamente
      const csv = '﻿' + lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filtroSufijo = filtroOperarioId ? `-${operarioSel.replace(/[^\w]+/g, '_')}` : '';
      link.download = `reporte-produccion-${range.desde}_${range.hasta}${filtroSufijo}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Reporte exportado');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al exportar';
      toast.error(msg);
    } finally {
      setExportingCSV(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {(['hoy', 'semana', 'mes', 'custom'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                periodo === p ? 'bg-primary text-white' : 'bg-gray-100 text-text-muted hover:bg-gray-200 active:bg-gray-300'
              }`}
            >
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

        {/* Filtros por operario y productos/subrecetas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-text-muted mb-0.5">Operario</label>
            <select value={filtroOperarioId} onChange={(e) => setFiltroOperarioId(e.target.value)}
              className="w-full px-2 py-2.5 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="">Todos</option>
              {operarios.map((op) => <option key={op.id} value={String(op.id)}>{op.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-text-muted mb-0.5">Productos / Subrecetas</label>
            <MultiSelectItems
              items={catalogo}
              selected={filtroItems}
              onChange={setFiltroItems}
              placeholder="Buscar producto o subreceta..."
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !reporte ? (
        <EmptyState message="Selecciona un periodo para ver reportes" />
      ) : (
        <>
          {/* Boton exportar CSV */}
          <div className="flex justify-end">
            <button
              onClick={handleExportCSV}
              disabled={exportingCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary border border-primary rounded-lg hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exportar todos los datos filtrados a CSV (incluye dia x producto)"
            >
              <Download size={14} /> {exportingCSV ? 'Exportando...' : 'Exportar CSV completo'}
            </button>
          </div>

          {/* Production by week — primera metrica visible.
              Solo se muestra si hay >=2 semanas (caso contrario no aporta info). */}
          {reporte.porDia.length > 0 && (() => {
            const semanas = aggregateByWeek(reporte.porDia);
            if (semanas.length < 2) return null;
            return (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-sm font-bold mb-3">Produccion por Semana</h3>
                <ResponsiveContainer width="100%" height={Math.max(220, 60 + semanas.length * 30)}>
                  <BarChart data={semanas} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      angle={-25}
                      textAnchor="end"
                      height={50}
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(value: number, name: string) => {
                        if (name === 'cantidad') return [value, 'Cantidad'];
                        if (name === 'registros') return [value, 'Registros'];
                        return [value, name];
                      }}
                      labelFormatter={(label: string) => `Semana ${label}`}
                    />
                    <Bar dataKey="cantidad" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-text-muted">
                  {semanas.map((s) => (
                    <div key={s.semana} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                      <span className="font-medium">{s.label}</span>
                      <span className="font-mono font-bold text-text-primary">{s.cantidad}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Summary cards — 2x2 grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Registros" value={String(reporte.totales.total_registros || 0)}
              icon={<FileText size={20} className="text-primary" />} />
            <StatCard label="Unidades" value={String(Number(reporte.totales.total_unidades || 0).toFixed(0))}
              icon={<Package size={20} className="text-blue-500" />} />
            <StatCard label="Productos" value={String(reporte.totales.total_productos || 0)}
              icon={<BarChart3 size={20} className="text-green-500" />} />
            <StatCard label="Dias" value={String(reporte.totales.total_dias || 0)}
              icon={<Calendar size={20} className="text-purple-500" />} />
          </div>

          {/* Production by product — ranking visible (cantidad siempre a la vista) */}
          {reporte.porProducto.length > 0 && (() => {
            const sorted = [...reporte.porProducto].sort((a, b) => Number(b.total_cantidad) - Number(a.total_cantidad));
            const maxCant = Math.max(...sorted.map((p) => Number(p.total_cantidad)));
            const totalUnidades = sorted.reduce((acc, p) => acc + Number(p.total_cantidad), 0) || 1;
            return (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-sm font-bold mb-3">Produccion por Producto</h3>
                <div className="space-y-2">
                  {sorted.map((p, idx) => {
                    const cant = Number(p.total_cantidad);
                    const pct = maxCant > 0 ? (cant / maxCant) * 100 : 0;
                    const pctTotal = ((cant / totalUnidades) * 100).toFixed(1);
                    return (
                      <div key={`${p.producto_nombre}-${idx}`} className="flex items-center gap-3">
                        <span className="text-xs text-text-muted font-bold w-6 shrink-0 text-right">{idx + 1}.</span>
                        <span
                          className="text-xs font-medium shrink-0 truncate w-32 sm:w-44"
                          title={p.producto_nombre}
                        >
                          {p.producto_nombre}
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-7 relative overflow-hidden min-w-[60px]">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-end pr-2.5 text-xs font-bold text-gray-800">
                            {cant}
                          </span>
                        </div>
                        <span className="text-[11px] text-text-muted w-12 shrink-0 text-right tabular-nums">{pctTotal}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Production by operario — horizontal bar chart */}
          {reporte.porOperario.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-bold mb-3">Produccion por Operario</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, reporte.porOperario.length * 50)}>
                <BarChart data={reporte.porOperario} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="operario" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(value: number) => [value, 'Cantidad']} />
                  <Bar dataKey="total_cantidad" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Production by day — progress bars */}
          {reporte.porDia.length > 0 && (() => {
            const maxCant = Math.max(...reporte.porDia.map((d) => Number(d.total_cantidad)));
            const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
            return (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-sm font-bold mb-3">Produccion por Dia</h3>
                <div className="space-y-2.5">
                  {reporte.porDia.map((d, idx) => {
                    const pct = maxCant > 0 ? (Number(d.total_cantidad) / maxCant) * 100 : 0;
                    // Parse fecha string (puede venir como "2026-02-18" o "2026-02-18T00:00:00.000Z")
                    const fechaClean = typeof d.fecha === 'string' ? d.fecha.substring(0, 10) : '';
                    const parts = fechaClean.split('-');
                    const yyyy = parseInt(parts[0] || '0');
                    const mmNum = parseInt(parts[1] || '0') - 1;
                    const ddNum = parseInt(parts[2] || '0');
                    const dateObj = new Date(yyyy, mmNum, ddNum);
                    const dayName = !isNaN(dateObj.getTime()) ? DAY_NAMES[dateObj.getDay()] : '?';
                    const dd = String(ddNum).padStart(2, '0');
                    const mm = String(mmNum + 1).padStart(2, '0');
                    const label = `${dayName} ${dd}/${mm}`;
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="text-xs text-text-muted font-medium w-16 shrink-0 text-right">{label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
                            {Number(d.total_cantidad)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Status breakdown */}
          {reporte.porEstado.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-bold mb-3">Por Estado</h3>
              <div className="flex flex-wrap gap-3">
                {reporte.porEstado.map((est) => (
                  <div key={est.estado} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                    est.estado === 'Completado' ? 'bg-green-50 text-green-700'
                    : est.estado === 'En proceso' ? 'bg-yellow-50 text-yellow-700'
                    : 'bg-red-50 text-red-700'
                  }`}>
                    {est.estado === 'Completado' && <CheckCircle size={14} />}
                    {est.estado === 'En proceso' && <AlertCircle size={14} />}
                    {est.estado === 'Cancelado' && <XCircle size={14} />}
                    <span className="font-medium">{est.estado}</span>
                    <span className="font-bold">({est.cantidad})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detail table */}
          {reporte.porProducto.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold">Detalle por Producto</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Producto</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Cant.</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Reg.</th>
                      <th className="px-2 py-2.5 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.porProducto.map((p, idx) => (
                      <tr key={idx} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-medium">{p.producto_nombre}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{Number(p.total_cantidad)}</td>
                        <td className="px-4 py-2.5 text-right text-text-muted">{p.total_registros}</td>
                        <td className="px-2 py-2.5 text-center">
                          <button
                            onClick={() => setBorrarConfirm({
                              producto: p.producto_nombre,
                              cantidad: Number(p.total_cantidad),
                              registros: Number(p.total_registros),
                            })}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title={`Eliminar todos los registros de ${p.producto_nombre} en el periodo`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-200 font-bold bg-gray-50">
                      <td className="px-4 py-2.5">Total</td>
                      <td className="px-4 py-2.5 text-right font-mono">{Number(reporte.totales.total_unidades || 0).toFixed(0)}</td>
                      <td className="px-4 py-2.5 text-right">{reporte.totales.total_registros}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de confirmacion para eliminar */}
      {borrarConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setBorrarConfirm(null); }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <Trash2 size={18} className="text-red-500" />
                Eliminar registros de produccion
              </h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm">
                <p className="font-semibold text-red-800 mb-1">Esta accion no se puede deshacer.</p>
                <p className="text-red-700 text-xs">
                  Se van a eliminar <strong>{borrarConfirm.registros} registro{borrarConfirm.registros === 1 ? '' : 's'}</strong> del producto{' '}
                  <strong>"{borrarConfirm.producto}"</strong>{' '}
                  en el periodo <strong>{range.desde}</strong> a <strong>{range.hasta}</strong>
                  {filtroOperarioId && operarios.find((o) => String(o.id) === filtroOperarioId) && (
                    <> del operario <strong>{operarios.find((o) => String(o.id) === filtroOperarioId)!.nombre}</strong></>
                  )}.
                </p>
                <p className="text-red-700 text-xs mt-2">
                  Total a borrar: <strong>{borrarConfirm.cantidad}</strong> unidades producidas.
                </p>
              </div>
              <p className="text-xs text-text-muted">
                Los reportes y el historial se actualizaran automaticamente.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setBorrarConfirm(null)}
                className="px-4 py-2 text-sm text-text-muted border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteByProductoMut.mutate(borrarConfirm.producto)}
                disabled={deleteByProductoMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
              >
                {deleteByProductoMut.isPending ? 'Eliminando...' : 'Si, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TAB HISTORIAL
// =============================================================================
function TabHistorial() {
  const queryClient = useQueryClient();
  const today = todayStr();

  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(today);
  const [estado, setEstado] = useState('');
  const [operarioId, setOperarioId] = useState('');
  const [filtroItems, setFiltroItems] = useState<string[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const productosSorted = useMemo(() => [...filtroItems].sort(), [filtroItems]);

  const filters: RegistrosFilters = {
    desde: desde || undefined,
    hasta: hasta || undefined,
    estado: estado || undefined,
    operario_id: operarioId ? Number(operarioId) : undefined,
    productos: productosSorted.length > 0 ? productosSorted : undefined,
  };

  const { data: registrosData, isLoading } = useQuery({
    queryKey: ['produccion-registros', desde, hasta, estado, operarioId, productosSorted],
    queryFn: () => produccionApi.getRegistros(filters),
  });
  const registros: ProduccionRegistro[] = registrosData?.data || [];

  const { data: operariosData } = useQuery({
    queryKey: ['produccion-operarios'],
    queryFn: produccionApi.getOperarios,
  });
  const operarios: Operario[] = operariosData?.data || [];

  const { data: catalogoData } = useQuery({
    queryKey: ['produccion-catalogo'],
    queryFn: produccionApi.getCatalogo,
  });
  const catalogo: ProductoCatalogo[] = catalogoData?.data || [];

  const deleteMut = useMutation({
    mutationFn: (id: number) => produccionApi.deleteRegistro(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produccion-registros'] });
      queryClient.invalidateQueries({ queryKey: ['produccion-reportes'] });
      toast.success('Registro eliminado');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setPreset = (preset: 'hoy' | 'semana' | 'mes') => {
    if (preset === 'hoy') { setDesde(today); setHasta(today); }
    else if (preset === 'semana') { const r = getWeekRange(); setDesde(r.desde); setHasta(r.hasta); }
    else { const r = getMonthRange(); setDesde(r.desde); setHasta(r.hasta); }
  };

  return (
    <div className="space-y-4">
      {/* Quick period buttons */}
      <div className="flex gap-2">
        <button onClick={() => setPreset('hoy')} className="flex-1 px-3 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 cursor-pointer">Hoy</button>
        <button onClick={() => setPreset('semana')} className="flex-1 px-3 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 cursor-pointer">Semana</button>
        <button onClick={() => setPreset('mes')} className="flex-1 px-3 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 cursor-pointer">Mes</button>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-2.5 text-sm border rounded-lg cursor-pointer ${showFilters ? 'bg-primary text-white border-primary' : 'border-gray-300 hover:bg-gray-50'}`}
        >
          <Filter size={16} />
        </button>
      </div>

      {/* Expandable filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                className="w-full px-2 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                className="w-full px-2 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)}
                className="w-full px-2 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                <option value="">Todos</option>
                {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Operario</label>
              <select value={operarioId} onChange={(e) => setOperarioId(e.target.value)}
                className="w-full px-2 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                <option value="">Todos</option>
                {operarios.map((op) => <option key={op.id} value={String(op.id)}>{op.nombre}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-text-muted mb-0.5">Productos / Subrecetas</label>
            <MultiSelectItems
              items={catalogo}
              selected={filtroItems}
              onChange={setFiltroItems}
              placeholder="Buscar producto o subreceta..."
            />
          </div>
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <LoadingSpinner />
      ) : registros.length === 0 ? (
        <EmptyState message="No hay registros para estos filtros" />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-text-muted px-1">{registros.length} registros</p>
          {registros.map((reg) => (
            <RegistroCard
              key={reg.id}
              reg={reg}
              onEdit={() => setEditId(reg.id)}
              onDelete={() => {
                if (confirm('Eliminar este registro?')) deleteMut.mutate(reg.id);
              }}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editId && registros.find((r) => r.id === editId) && (
        <EditRegistroModal
          registro={registros.find((r) => r.id === editId)!}
          operarios={operarios}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  );
}

// Card for each history record
function RegistroCard({ reg, onEdit, onDelete }: {
  reg: ProduccionRegistro;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const estadoConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    'Completado': { icon: <CheckCircle size={14} />, color: 'text-green-600', bg: 'bg-green-50' },
    'En proceso': { icon: <AlertCircle size={14} />, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    'Cancelado': { icon: <XCircle size={14} />, color: 'text-red-600', bg: 'bg-red-50' },
  };
  const est = estadoConfig[reg.estado] || estadoConfig['Completado'];

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{reg.producto_nombre}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Calendar size={11} /> {formatDate(reg.fecha)}
            </span>
            <span className="font-mono font-bold text-text-primary">x{Number(reg.cantidad)}</span>
            {(reg.operario_display || reg.operario_nombre) && (
              <span className="flex items-center gap-1">
                <User size={11} /> {reg.operario_display || reg.operario_nombre}
              </span>
            )}
            {reg.hora_ingreso && (
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {reg.hora_ingreso.slice(0, 5)}
                {reg.hora_salida ? ` - ${reg.hora_salida.slice(0, 5)}` : ''}
              </span>
            )}
          </div>
          {reg.observacion && (
            <div className="text-xs text-text-muted mt-1 italic truncate">
              {reg.observacion}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${est.color} ${est.bg}`}>
            {est.icon}
          </span>
          <button onClick={onEdit} className="p-2 text-text-muted hover:text-primary cursor-pointer">
            <Edit2 size={16} />
          </button>
          <button onClick={onDelete} className="p-2 text-text-muted hover:text-danger cursor-pointer">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Edit modal
function EditRegistroModal({ registro, operarios, onClose }: {
  registro: ProduccionRegistro;
  operarios: Operario[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [fecha, setFecha] = useState(registro.fecha?.split('T')[0] || '');
  const [horaIngreso, setHoraIngreso] = useState(registro.hora_ingreso?.slice(0, 5) || '');
  const [horaSalida, setHoraSalida] = useState(registro.hora_salida?.slice(0, 5) || '');
  const [productoNombre, setProductoNombre] = useState(registro.producto_nombre);
  const [cantidad, setCantidad] = useState(Number(registro.cantidad));
  const [estado, setEstado] = useState(registro.estado);
  const [observacion, setObservacion] = useState(registro.observacion || '');
  const [operarioIdLocal, setOperarioIdLocal] = useState<number | null>(registro.operario_id);

  const updateMut = useMutation({
    mutationFn: (data: ProduccionRegistroInput) => produccionApi.updateRegistro(registro.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produccion-registros'] });
      queryClient.invalidateQueries({ queryKey: ['produccion-reportes'] });
      toast.success('Registro actualizado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!productoNombre.trim() || !fecha) {
      toast.error('Producto y fecha son requeridos');
      return;
    }
    const op = operarios.find((o) => o.id === operarioIdLocal);
    updateMut.mutate({
      fecha,
      hora_ingreso: horaIngreso || null,
      hora_salida: horaSalida || null,
      producto_nombre: productoNombre.trim(),
      producto_id: registro.producto_id,
      cantidad: cantidad || 1,
      estado,
      observacion: observacion || null,
      operario_id: operarioIdLocal,
      operario_nombre: op?.nombre || null,
    });
  };

  return (
    <Modal isOpen onClose={onClose} title="Editar Registro"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={handleSave} loading={updateMut.isPending}>Guardar</Button></>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Producto</label>
            <input value={productoNombre} onChange={(e) => setProductoNombre(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Cantidad</label>
            <NumericInput value={cantidad} onChange={setCantidad} min={0} step="1"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Estado</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Operario</label>
            <select value={operarioIdLocal != null ? String(operarioIdLocal) : ''} onChange={(e) => setOperarioIdLocal(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              <option value="">Sin asignar</option>
              {operarios.map((op) => <option key={op.id} value={String(op.id)}>{op.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Hora Ingreso</label>
            <input type="time" value={horaIngreso} onChange={(e) => setHoraIngreso(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Hora Salida</label>
            <input type="time" value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">Observacion</label>
          <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>
      </div>
    </Modal>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
      <div className="p-2 bg-gray-50 rounded-lg shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-text-primary leading-tight">{value}</div>
        <div className="text-[11px] text-text-muted truncate">{label}</div>
      </div>
    </div>
  );
}

// =============================================================================
// TAB INGREDIENTES USADOS
// =============================================================================

// Convierte g→Kg y ml→L cuando corresponde. Usa formato es-AR (coma decimal).
function convertirCantidad(cantidad: number, unidad: string): { valor: string; unidad: string } {
  const u = (unidad || '').toLowerCase().trim();
  if (u === 'g' && cantidad >= 1000) {
    return {
      valor: (cantidad / 1000).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }),
      unidad: 'Kg',
    };
  }
  if (u === 'ml' && cantidad >= 1000) {
    return {
      valor: (cantidad / 1000).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }),
      unidad: 'L',
    };
  }
  return {
    valor: cantidad.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    unidad: unidad || '',
  };
}

function TabIngredientesUsados() {
  const [periodo, setPeriodo] = useState<'hoy' | 'semana' | 'mes' | 'custom'>('mes');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [buscar, setBuscar] = useState('');
  const [subrecetaFiltro, setSubrecetaFiltro] = useState('');
  const [filtroItems, setFiltroItems] = useState<string[]>([]);
  const debouncedBuscar = useDebounce(buscar);

  const range = useMemo(() => {
    if (periodo === 'hoy') { const t = todayStr(); return { desde: t, hasta: t }; }
    if (periodo === 'semana') return getWeekRange();
    if (periodo === 'mes') return getMonthRange();
    return { desde: customDesde, hasta: customHasta };
  }, [periodo, customDesde, customHasta]);

  const canQuery = !!(range.desde && range.hasta);
  const productosSorted = useMemo(() => [...filtroItems].sort(), [filtroItems]);

  const { data: reporteData, isLoading } = useQuery({
    queryKey: ['produccion-reporte-ingredientes', range.desde, range.hasta, debouncedBuscar, subrecetaFiltro, productosSorted],
    queryFn: () => produccionApi.getReporteIngredientes(
      range.desde,
      range.hasta,
      debouncedBuscar || undefined,
      subrecetaFiltro || undefined,
      productosSorted.length > 0 ? productosSorted : undefined
    ),
    enabled: canQuery,
  });

  // Subrecetas usadas en el periodo (para popular el dropdown)
  const { data: subrecetasData } = useQuery({
    queryKey: ['produccion-subrecetas-usadas', range.desde, range.hasta],
    queryFn: () => produccionApi.getSubrecetasUsadas(range.desde, range.hasta),
    enabled: canQuery,
  });
  const subrecetasUsadas: string[] = subrecetasData?.data || [];

  // Catalogo de productos + subrecetas para el multi-select
  const { data: catalogoData } = useQuery({
    queryKey: ['produccion-catalogo'],
    queryFn: produccionApi.getCatalogo,
  });
  const catalogo: ProductoCatalogo[] = catalogoData?.data || [];

  // Si cambia el periodo y la subreceta ya no esta en la lista, limpiar el filtro
  useEffect(() => {
    if (subrecetaFiltro && subrecetasUsadas.length > 0 && !subrecetasUsadas.includes(subrecetaFiltro)) {
      setSubrecetaFiltro('');
    }
  }, [subrecetasUsadas, subrecetaFiltro]);

  const reporte: ReporteIngredientesData | null = reporteData?.data || null;
  const ingredientes = reporte?.ingredientes || [];
  const top10 = ingredientes.slice(0, 10);
  const maxCantidad = top10.length > 0 ? Math.max(...top10.map((i) => i.cantidad_total)) : 0;

  const handleExportCSV = () => {
    if (ingredientes.length === 0) return;
    const rows = ['Ingrediente,Cantidad,Unidad,Costo,Porcentaje'];
    ingredientes.forEach((i) => {
      const nombre = i.nombre.replace(/"/g, '""');
      rows.push(`"${nombre}",${i.cantidad_total},${i.unidad},${i.costo_total.toFixed(2)},${i.porcentaje}`);
    });
    const csv = '\uFEFF' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sufijoSubreceta = subrecetaFiltro ? `-${subrecetaFiltro.replace(/[^\w]+/g, '_')}` : '';
    link.download = `ingredientes-usados${sufijoSubreceta}-${range.desde}_${range.hasta}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {(['hoy', 'semana', 'mes', 'custom'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                periodo === p ? 'bg-primary text-white' : 'bg-gray-100 text-text-muted hover:bg-gray-200 active:bg-gray-300'
              }`}
            >
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

        {/* Buscador de ingrediente */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar ingrediente..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Filtro por subreceta */}
        <div>
          <label className="block text-[10px] text-text-muted mb-0.5">
            Filtrar por subreceta (opcional)
          </label>
          <select
            value={subrecetaFiltro}
            onChange={(e) => setSubrecetaFiltro(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Todas las fuentes (productos + subrecetas)</option>
            {subrecetasUsadas.map((nombre) => (
              <option key={nombre} value={nombre}>{nombre}</option>
            ))}
          </select>
          {subrecetaFiltro && (
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-primary bg-primary/5 border border-primary/20 rounded-lg px-2.5 py-1">
              <span>🔍 Mostrando solo ingredientes consumidos a traves de: <strong>{subrecetaFiltro}</strong></span>
              <button
                onClick={() => setSubrecetaFiltro('')}
                className="ml-auto text-primary hover:underline"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>

        {/* Filtro multi-select de productos/subrecetas registrados en produccion */}
        <div>
          <label className="block text-[10px] text-text-muted mb-0.5">
            Filtrar por produccion de (productos/subrecetas)
          </label>
          <MultiSelectItems
            items={catalogo}
            selected={filtroItems}
            onChange={setFiltroItems}
            placeholder="Buscar producto o subreceta..."
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !reporte || ingredientes.length === 0 ? (
        <EmptyState message="No hay ingredientes usados en este periodo" />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Ingredientes usados"
              value={String(reporte.totales.total_ingredientes)}
              icon={<Apple size={20} className="text-primary" />}
            />
            <StatCard
              label="Cantidad total"
              value={Number(reporte.totales.total_cantidad).toFixed(0)}
              icon={<Package size={20} className="text-blue-500" />}
            />
            <StatCard
              label="Costo total"
              value={formatMoney(reporte.totales.total_costo)}
              icon={<BarChart3 size={20} className="text-green-500" />}
            />
          </div>

          {/* Top 10 progress bars */}
          {top10.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-bold mb-3">Top 10 ingredientes</h3>
              <div className="space-y-2.5">
                {top10.map((ing, idx) => {
                  const pct = maxCantidad > 0 ? (ing.cantidad_total / maxCantidad) * 100 : 0;
                  const conv = convertirCantidad(ing.cantidad_total, ing.unidad);
                  return (
                    <div key={ing.ingrediente_id} className="flex items-center gap-3">
                      <span className="text-xs text-text-muted font-bold w-6 shrink-0 text-right">{idx + 1}.</span>
                      <span className="text-xs font-medium w-36 shrink-0 truncate" title={ing.nombre}>{ing.nombre}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-bold text-gray-700">
                          {conv.valor} {conv.unidad}
                        </span>
                      </div>
                      <span className="text-xs text-text-muted w-12 shrink-0 text-right">{ing.porcentaje}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Detalle completo ({ingredientes.length})</h3>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-primary rounded-lg hover:bg-primary/5"
              >
                <Download size={14} /> Exportar CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted">Ingrediente</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Cantidad</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-text-muted w-16">Unidad</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-text-muted">Costo</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-text-muted w-16">%</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredientes.map((ing) => {
                    const conv = convertirCantidad(ing.cantidad_total, ing.unidad);
                    return (
                      <tr key={ing.ingrediente_id} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-medium">{ing.nombre}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{conv.valor}</td>
                        <td className="px-4 py-2.5 text-text-muted">{conv.unidad}</td>
                        <td className="px-4 py-2.5 text-right">{formatMoney(ing.costo_total)}</td>
                        <td className="px-4 py-2.5 text-right text-text-muted">{ing.porcentaje}%</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-gray-200 font-bold bg-gray-50">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-4 py-2.5 text-right font-mono">{Number(reporte.totales.total_cantidad).toFixed(2)}</td>
                    <td></td>
                    <td className="px-4 py-2.5 text-right">{formatMoney(reporte.totales.total_costo)}</td>
                    <td className="px-4 py-2.5 text-right">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
