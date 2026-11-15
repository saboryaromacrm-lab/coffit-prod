import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Loader2, Sparkles } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { ofertasApi } from '../../api/ofertas';
import { productosApi } from '../../api/productos';
import { conceptosApi } from '../../api/conceptos';
import { nutricionApi } from '../../modules/nutricion/api';
import type { CategoriaCartaPromo, Producto, PropuestaIA, ResumenCanales } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { getFoodCostColor, getMCColor } from '../../utils/calculators';
import { calcularMetricasDraft, conPasos } from '../../utils/metricasPromo';

const QUE_ARMAR: { valor: CategoriaCartaPromo | null; label: string }[] = [
  { valor: null, label: 'Lo que convenga' },
  { valor: 'Combo', label: '🍽️ Combo' },
  { valor: 'Promo', label: '🏷️ Promo' },
  { valor: 'Boxs', label: '🎁 Box' },
];

// Asistente IA de Combos/Boxs: con la carta y su rentabilidad propone combos,
// promos y boxs. Los numeros de cada propuesta salen de la misma cuenta que el
// editor; "Usar" la abre en el editor para revisarla y guardarla.
export default function AsistenteIA({ onClose, onUsar }: {
  onClose: () => void; onUsar: (p: PropuestaIA) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaCartaPromo | null>(null);
  const [cantidad, setCantidad] = useState(3);
  const [objetivo, setObjetivo] = useState('');

  const { data: modeloData } = useQuery({ queryKey: ['ia-modelo'], queryFn: nutricionApi.getModeloIA });
  const modelo = modeloData?.data;
  const nombreModelo = modelo?.opciones.find((o) => o.id === modelo.modelo)?.nombre;

  const generar = useMutation({
    mutationFn: () => ofertasApi.sugerirConIA({ objetivo, categoria, cantidad }),
    onSuccess: (res) => {
      const { propuestas, descartadas } = res.data;
      if (propuestas.length === 0) toast.error('La IA no devolvió propuestas que se puedan usar. Probá de nuevo o cambiá el pedido.');
      else if (descartadas > 0) toast(`${descartadas} propuesta${descartadas === 1 ? '' : 's'} se descartó por usar productos que no sirven`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const propuestas = generar.data?.data.propuestas || [];

  return (
    <Modal isOpen onClose={onClose} title="✨ Asistente de combos, promos y boxs" size="xl">
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Qué armar">
            {QUE_ARMAR.map((q) => (
              <button
                key={q.label} type="button" role="radio" aria-checked={categoria === q.valor}
                onClick={() => setCategoria(q.valor)}
                className={clsx('px-3 py-1.5 rounded-full text-xs font-medium border',
                  categoria === q.valor ? 'bg-primary text-white border-primary' : 'border-gray-300 text-text-muted hover:bg-gray-50')}
              >
                {q.label}
              </button>
            ))}
          </div>
          <textarea
            value={objetivo} onChange={(e) => setObjetivo(e.target.value)} rows={2} maxLength={600}
            placeholder='Opcional: qué buscás. Ej: "combo de desayuno keto por menos de $9.000" o "box para regalar con dulces sin TACC"'
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-text-muted">
              Propuestas
              <select value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))}
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <Button onClick={() => generar.mutate()} loading={generar.isPending}>
              <Sparkles size={16} /> {propuestas.length ? 'Generar otras' : 'Generar propuestas'}
            </Button>
          </div>
          <p className="text-[11px] text-text-muted">
            Usa tu carta (lo que está disponible), los costos, las comisiones de tarjeta y efectivo y las promos que ya tenés.
            {nombreModelo && <> Modelo: {nombreModelo} (se cambia en Configuración).</>}
            {modelo && !modelo.clave_configurada && <span className="text-red-600 font-medium"> Falta cargar ANTHROPIC_API_KEY en el servidor.</span>}
          </p>
        </div>

        {generar.isPending && (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
            <Loader2 size={16} className="animate-spin" /> Analizando la carta y armando propuestas… puede tardar hasta un minuto.
          </p>
        )}
        {!generar.isPending && propuestas.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {propuestas.map((p, i) => <TarjetaPropuesta key={`${p.nombre}-${i}`} p={p} onUsar={() => onUsar(p)} />)}
          </div>
        )}
      </div>
    </Modal>
  );
}

function TarjetaPropuesta({ p, onUsar }: { p: PropuestaIA; onUsar: () => void }) {
  const { data: prodData } = useQuery({
    queryKey: ['productos', { es_borrador: 0 }],
    queryFn: () => productosApi.getAll({ es_borrador: 0 }),
  });
  const { data: conceptosData } = useQuery({ queryKey: ['conceptos'], queryFn: () => conceptosApi.getAll() });
  const resumenCanales = conceptosData?.data?.resumen_canales as ResumenCanales | undefined;

  const { m, nombres } = useMemo(() => {
    const todos: Producto[] = prodData?.data || [];
    const porId = new Map(todos.map((x) => [x.id, x]));
    const fijos = p.productos.flatMap((it) => {
      const prod = porId.get(it.id);
      return prod ? [{ ...prod, cantidad: it.cantidad, rol: it.rol, descuento_pct: it.descuento_pct }] : [];
    });
    const calculo = conPasos(fijos, p.tipo, p.valor, p.pasos, todos);
    return {
      m: resumenCanales ? calcularMetricasDraft(calculo.productos, [], p.tipo, calculo.valor, resumenCanales) : null,
      nombres: porId,
    };
  }, [p, prodData, resumenCanales]);

  return (
    <article className="border border-gray-200 rounded-xl p-3 flex flex-col gap-2 bg-white">
      <header className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-tight">{p.nombre}</h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100 shrink-0">{p.categoria_carta}</span>
      </header>
      {p.descripcion && <p className="text-xs text-text-muted italic">{p.descripcion}</p>}

      <div className="flex flex-wrap gap-1">
        {p.productos.map((it) => (
          <span key={it.id} className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-100">{it.cantidad}× {it.nombre}</span>
        ))}
        {p.pasos.map((paso) => (
          <span key={paso.nombre} className="text-[11px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100"
            title={paso.opciones.map((o) => `${nombres.get(o.producto_id)?.nombre ?? '?'}${o.extra ? ` (+${formatMoney(o.extra)})` : ''}`).join(' · ')}>
            🧩 {paso.nombre}: {paso.opciones.map((o) => nombres.get(o.producto_id)?.nombre ?? '?').join(', ')}
          </span>
        ))}
      </div>

      {m && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs bg-gray-50 rounded-lg px-2.5 py-2">
          <Dato k="Precio" v={formatMoney(m.precioFinal)} extra={m.pctDescuento > 0 ? `−${m.pctDescuento.toFixed(0)}% vs ${formatMoney(m.precioLista)}` : undefined} />
          <Dato k="Costo" v={formatMoney(m.costoTotal)} />
          <Dato k="Food cost" v={`${m.foodCost.toFixed(1)}%`} color={getFoodCostColor(m.foodCost)} />
          <Dato k="Ganancia tarjeta" v={formatMoney(m.gananciaTarjeta)} extra={`${m.mcTarjeta.toFixed(0)}%`} color={getMCColor(m.mcTarjeta)} />
        </dl>
      )}
      {p.pasos.length > 0 && <p className="text-[10px] text-text-muted">Con la opción más cara de cada paso (peor caso).</p>}

      {p.por_que && <p className="text-xs leading-relaxed">{p.por_que}</p>}
      <Button onClick={onUsar} className="mt-auto self-end">Usar esta propuesta</Button>
    </article>
  );
}

function Dato({ k, v, extra, color }: { k: string; v: string; extra?: string; color?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-text-muted">{k}</dt>
      <dd className="font-semibold tabular-nums" style={color ? { color } : undefined}>
        {v} {extra && <span className="font-normal text-[10px] text-text-muted">{extra}</span>}
      </dd>
    </div>
  );
}
