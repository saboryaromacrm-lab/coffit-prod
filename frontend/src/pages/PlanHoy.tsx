import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { colabBase as getColabBase } from '../utils/colabBase';
import { CalendarDays, ChevronLeft, ChevronRight, Package, RefreshCw } from 'lucide-react';
import { planSemanalApi } from '../api/planSemanal';
import type { PlanSemanalData, PlanSemanalItem } from '../types';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diaSemanaDeFecha(fechaISO: string): number {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function lunesDeSemana(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().substring(0, 10);
}

function fechaDeDiaSemana(lunesISO: string, diaSemana: number): string {
  const offset = diaSemana === 0 ? 6 : diaSemana - 1;
  const [y, m, d] = lunesISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + offset);
  return date.toISOString().substring(0, 10);
}

function formatFechaLarga(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DIAS[date.getDay()]}, ${date.getDate()} de ${MESES[date.getMonth()]} ${y}`;
}

function shiftDate(fechaISO: string, days: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return date.toISOString().substring(0, 10);
}

export default function PlanHoy() {
  const navigate = useNavigate();
  const location = useLocation();
  const colabBase = getColabBase(location.pathname);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(todayISO());

  const lunes = lunesDeSemana(fechaSeleccionada);
  const diaSel = diaSemanaDeFecha(fechaSeleccionada);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['plan-semanal-cocina', lunes],
    queryFn: () => planSemanalApi.get({ modo: 'semana', desde: fechaSeleccionada }),
  });

  const plan: PlanSemanalData | null = (data?.data as PlanSemanalData) || null;
  const itemsDelDia: PlanSemanalItem[] = plan?.porDia[diaSel] || [];

  const isToday = fechaSeleccionada === todayISO();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-sidebar px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <CalendarDays size={20} className="text-primary" />
          <span className="text-lg font-bold text-primary">Plan de produccion</span>
        </div>
        <button
          onClick={() => navigate(`${colabBase}/produccion`)}
          className="text-white/60 hover:text-white text-xs bg-white/10 px-2.5 py-1 rounded"
        >
          Ir a Produccion
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Header con fecha + navegacion */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setFechaSeleccionada(shiftDate(fechaSeleccionada, -1))}
              className="p-2 text-text-muted hover:text-text-primary border border-gray-300 rounded-lg hover:bg-gray-50"
              title="Dia anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex-1 text-center">
              <div className={`text-xs font-semibold mb-0.5 ${isToday ? 'text-primary' : 'text-text-muted'}`}>
                {isToday ? 'HOY' : 'Plan del'}
              </div>
              <div className="text-sm md:text-base font-bold text-text-primary">
                {formatFechaLarga(fechaSeleccionada)}
              </div>
            </div>
            <button
              onClick={() => setFechaSeleccionada(shiftDate(fechaSeleccionada, 1))}
              className="p-2 text-text-muted hover:text-text-primary border border-gray-300 rounded-lg hover:bg-gray-50"
              title="Dia siguiente"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 mt-3">
            <button
              onClick={() => setFechaSeleccionada(todayISO())}
              disabled={isToday}
              className={`text-xs px-3 py-1 rounded-md ${
                isToday
                  ? 'bg-gray-100 text-text-muted cursor-not-allowed'
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
              }`}
            >
              Volver a hoy
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-xs px-3 py-1 rounded-md bg-gray-100 text-text-muted hover:bg-gray-200 flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Mini-navegacion semana (chips) */}
        {plan && (
          <div className="grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const fechaD = fechaDeDiaSemana(lunes, d);
              const isSel = fechaD === fechaSeleccionada;
              const isHoy = fechaD === todayISO();
              const cantItems = (plan.porDia[d] || []).length;
              return (
                <button
                  key={d}
                  onClick={() => setFechaSeleccionada(fechaD)}
                  className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border transition-colors ${
                    isSel
                      ? 'bg-primary text-white border-primary'
                      : isHoy
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-white text-text-muted border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-[10px] font-medium">{DIAS[d].substring(0, 3)}</span>
                  <span className="text-sm font-bold">{Number(fechaD.substring(8, 10))}</span>
                  {cantItems > 0 && (
                    <span className={`text-[9px] ${isSel ? 'text-white/80' : 'text-text-muted'}`}>
                      {cantItems} item{cantItems === 1 ? '' : 's'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Items del dia */}
        {isLoading ? (
          <div className="text-center py-12 text-text-muted">Cargando plan...</div>
        ) : itemsDelDia.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
            <Package className="mx-auto mb-3 text-gray-300" size={48} />
            <p className="text-text-muted">No hay items planificados para este dia</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {itemsDelDia.map((it) => (
              <ItemCard key={it.id} item={it} />
            ))}
          </div>
        )}

        {/* Footer info */}
        {itemsDelDia.length > 0 && (
          <div className="text-center text-xs text-text-muted py-2">
            {itemsDelDia.length} item{itemsDelDia.length === 1 ? '' : 's'} planificado{itemsDelDia.length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: PlanSemanalItem }) {
  const esPuntual = !item.es_plantilla;
  return (
    <div
      className={`bg-white rounded-xl border-2 p-4 ${
        esPuntual ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-base font-bold text-text-primary">{item.item_nombre}</h3>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                item.item_tipo === 'producto' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {item.item_tipo === 'producto' ? 'Producto' : 'Subreceta'}
            </span>
            {esPuntual && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-200 text-orange-800 font-medium">
                Solo este dia
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-primary">x{Number(item.cantidad)}</span>
            <span className="text-xs text-text-muted">unidades</span>
          </div>
          {item.observacion && (
            <div className="mt-2 px-3 py-2 bg-gray-50 rounded-md text-xs text-text-primary border-l-2 border-amber-400">
              <span className="font-semibold text-text-muted">📝 Observacion:</span> {item.observacion}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
