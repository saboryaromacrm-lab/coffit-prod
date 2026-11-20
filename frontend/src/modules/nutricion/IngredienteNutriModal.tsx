import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Sparkles, AlertTriangle, PencilLine, BookOpen } from 'lucide-react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import NumericInput from '../../components/common/NumericInput';
import { formatMoney, formatDate } from '../../utils/formatters';
import { nutricionApi } from './api';
import type { IngredienteNutri, Valores } from './types';
import { NUTRIENTES, campoCorreccion, energiaDe, fmtNutriente } from './utils';
import AlertasUnidad from './AlertasUnidad';

const vacios = (): Valores => Object.fromEntries(NUTRIENTES.map((n) => [n.key, 0])) as Valores;

// Carga / correccion de la info de un ingrediente: cuanto pesa 1 unidad de
// receta, los valores cada 100 g y de que fuente salen. La energia se calcula.
// "Sugerir con IA" lo completa (y lo guarda pendiente de verificacion);
// despues se verifica con la fuente y se marca controlado (sin fuente no se
// puede). Cada valor que se cambia queda asentado y la IA aprende de eso.
const MAX_HISTORIAL = 8;
const num = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 2 });
export default function IngredienteNutriModal({ ingrediente, onClose }: { ingrediente: IngredienteNutri; onClose: () => void }) {
  const qc = useQueryClient();
  const [ing, setIng] = useState(ingrediente); // se actualiza si la IA lo completa
  const [gpu, setGpu] = useState(ing.gramos_por_unidad ?? (ing.unidad === 'g' ? 1 : 0));
  const [valores, setValores] = useState<Valores>(ing.valores ?? vacios());
  const [fuente, setFuente] = useState(ing.fuente ?? '');
  const [controlado, setControlado] = useState(ing.estado === 'controlado');
  const sinFuente = !fuente.trim();

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['nutri-ingredientes'] });
    qc.invalidateQueries({ queryKey: ['nutri-productos'] });
    qc.invalidateQueries({ queryKey: ['nutri-producto'] });
    qc.invalidateQueries({ queryKey: ['nutri-subreceta'] });
  };

  const ia = useMutation({
    mutationFn: () => nutricionApi.sugerirIA([ing.id]),
    onSuccess: ({ data }) => {
      const nuevo = data.actualizados[0];
      if (!nuevo) return toast.error(data.errores[0]?.motivo || 'La IA no pudo completarlo');
      setIng(nuevo);
      setGpu(nuevo.gramos_por_unidad ?? 0);
      setValores(nuevo.valores ?? vacios());
      setFuente(nuevo.fuente ?? '');
      setControlado(false);
      refrescar();
      toast.success('Completado por la IA: revisalo antes de marcarlo controlado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardar = useMutation({
    mutationFn: () => nutricionApi.guardarIngrediente(ing.id, { gramos_por_unidad: gpu, valores, fuente, controlado: controlado && !sinFuente }),
    onSuccess: () => { refrescar(); toast.success('Guardado'); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const unidad = ing.unidad || 'u';
  return (
    <Modal isOpen onClose={onClose} title={ing.nombre} size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => guardar.mutate()} loading={guardar.isPending} disabled={ia.isPending}>Guardar</Button>
      </>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-xs text-text-muted max-w-md">
            Se compra en envases de <strong>{ing.contenido_envase.toLocaleString('es-AR')} {unidad}</strong> a {formatMoney(ing.precio_envase)}
            {' '}({formatMoney(ing.contenido_envase > 0 ? ing.precio_envase / ing.contenido_envase : 0)} por {unidad}).
            Las recetas lo cargan en <strong>{unidad}</strong> · se usa en {ing.usos} {ing.usos === 1 ? 'receta' : 'recetas'}.
          </p>
          <Button variant="secondary" size="sm" onClick={() => ia.mutate()} loading={ia.isPending} disabled={guardar.isPending}>
            {!ia.isPending && <Sparkles size={14} />} {ia.isPending ? 'La IA está analizando…' : 'Sugerir con IA'}
          </Button>
        </div>

        {ing.nota && (
          <div className="text-xs bg-violet-50 border border-violet-100 text-violet-900 rounded-lg px-3 py-2">
            <Sparkles size={12} className="inline mr-1" />
            {ing.nota}
            {ing.confianza && <span className="ml-1 font-medium">· Confianza {ing.confianza}</span>}
          </div>
        )}

        {ing.incoherencias.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
            <div className="font-semibold mb-0.5 flex items-center gap-1"><AlertTriangle size={13} /> Valores que no pueden ser ciertos</div>
            <ul className="list-disc pl-4">{ing.incoherencias.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}

        {ing.alertas.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <div className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1">
              <AlertTriangle size={13} /> Cantidades que no cierran con la unidad (afectan también el costo)
            </div>
            <AlertasUnidad alertas={ing.alertas} unidad={unidad} />
          </div>
        )}

        {ing.correcciones.length > 0 && (
          <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 text-xs text-violet-900">
            <div className="font-semibold mb-1 flex items-center gap-1"><PencilLine size={13} /> Modificado a mano</div>
            <ul className="space-y-0.5">
              {ing.correcciones.slice(0, MAX_HISTORIAL).map((c, k) => {
                const campo = campoCorreccion(c.campo);
                return (
                  <li key={k}>
                    {campo.label}: <span className="line-through opacity-70">{num(c.valor_anterior)}</span> → <strong>{num(c.valor_nuevo)}</strong> {campo.unidad}
                    <span className="opacity-70"> · {c.origen_anterior === 'ia' ? 'lo había puesto la IA' : 'corrección de una carga anterior'} · {formatDate(c.fecha)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Peso de 1 unidad de receta</label>
          <div className="flex items-center gap-2 text-sm">
            <span>1 {unidad} =</span>
            <NumericInput value={gpu} onChange={setGpu} min={0} step="0.01" placeholder="?"
              className="w-28 px-2 py-1.5 text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <span>gramos</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Valores cada 100 g</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {NUTRIENTES.map((n) => (n.key === 'energia_kcal' ? (
              <div key={n.key} className="text-xs" title="4 × proteínas + 4 × carbohidratos + 9 × grasas + 2 × fibra">
                <span className="text-text-muted">{n.label} <span className="opacity-70">(kcal, calculado)</span></span>
                <div className="mt-0.5 px-2 py-1.5 text-sm text-right bg-gray-50 border border-gray-200 rounded-lg tabular-nums">
                  {fmtNutriente('energia_kcal', energiaDe(valores))}
                </div>
              </div>
            ) : (
              <label key={n.key} className="text-xs">
                <span className="text-text-muted">
                  {n.label} <span className="opacity-70">({n.key === 'carbohidratos_g' ? 'g, sin fibra' : n.unidad})</span>
                </span>
                <NumericInput value={valores[n.key]} onChange={(v) => setValores((p) => ({ ...p, [n.key]: v }))} min={0} step="0.1" placeholder="0"
                  className="mt-0.5 w-full px-2 py-1.5 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </label>
            )))}
          </div>
          <p className="text-[11px] text-text-muted mt-1">
            Carbohidratos disponibles, como el rótulo argentino (si la tabla los da totales, restale la fibra).
            La energía se calcula: 4 × proteínas + 4 × carbohidratos + 9 × grasas + 2 × fibra.
          </p>
        </div>

        <label className="block text-xs">
          <span className="font-medium text-text-muted flex items-center gap-1"><BookOpen size={12} /> Fuente de los valores</span>
          <input value={fuente} onChange={(e) => setFuente(e.target.value)} maxLength={255}
            placeholder="Ej.: USDA FDC 170184 · Pistachos crudos / ARGENFOODS / Rótulo de la marca"
            className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>

        <label className={`flex items-center gap-2 text-sm select-none ${sinFuente ? 'opacity-50' : 'cursor-pointer'}`}
          title={sinFuente ? 'Cargá la fuente para poder marcarlo controlado' : undefined}>
          <input type="checkbox" checked={controlado && !sinFuente} disabled={sinFuente} onChange={(e) => setControlado(e.target.checked)} className="w-4 h-4 accent-green-600" />
          Controlado: verifiqué cada valor con la fuente y el peso de la unidad
        </label>
        <p className="text-[11px] text-text-muted -mt-2">
          Si cambiás un valor queda registrado como modificado, y la IA lo tiene en cuenta en los próximos análisis.
        </p>
      </div>
    </Modal>
  );
}
