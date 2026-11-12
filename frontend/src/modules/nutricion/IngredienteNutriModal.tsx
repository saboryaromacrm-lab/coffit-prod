import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Sparkles, AlertTriangle } from 'lucide-react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import NumericInput from '../../components/common/NumericInput';
import { formatMoney } from '../../utils/formatters';
import { nutricionApi } from './api';
import type { IngredienteNutri, Valores } from './types';
import { NUTRIENTES } from './utils';
import AlertasUnidad from './AlertasUnidad';

const vacios = (): Valores => Object.fromEntries(NUTRIENTES.map((n) => [n.key, 0])) as Valores;

// Carga / correccion de la info de un ingrediente: cuanto pesa 1 unidad de
// receta y los valores cada 100 g. "Sugerir con IA" lo completa (y lo guarda
// como sin revisar); despues se corrige y se marca controlado.
export default function IngredienteNutriModal({ ingrediente, onClose }: { ingrediente: IngredienteNutri; onClose: () => void }) {
  const qc = useQueryClient();
  const [ing, setIng] = useState(ingrediente); // se actualiza si la IA lo completa
  const [gpu, setGpu] = useState(ing.gramos_por_unidad ?? (ing.unidad === 'g' ? 1 : 0));
  const [valores, setValores] = useState<Valores>(ing.valores ?? vacios());
  const [controlado, setControlado] = useState(ing.estado === 'controlado');

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
      setControlado(false);
      refrescar();
      toast.success('Completado por la IA: revisalo antes de marcarlo controlado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardar = useMutation({
    mutationFn: () => nutricionApi.guardarIngrediente(ing.id, { gramos_por_unidad: gpu, valores, controlado }),
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

        {ing.alertas.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <div className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1">
              <AlertTriangle size={13} /> Cantidades que no cierran con la unidad (afectan también el costo)
            </div>
            <AlertasUnidad alertas={ing.alertas} unidad={unidad} />
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
            {NUTRIENTES.map((n) => (
              <label key={n.key} className="text-xs">
                <span className="text-text-muted">{n.label} <span className="opacity-70">({n.unidad})</span></span>
                <NumericInput value={valores[n.key]} onChange={(v) => setValores((p) => ({ ...p, [n.key]: v }))} min={0} step="0.1" placeholder="0"
                  className="mt-0.5 w-full px-2 py-1.5 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={controlado} onChange={(e) => setControlado(e.target.checked)} className="w-4 h-4 accent-green-600" />
          Controlado: revisé estos valores y el peso de la unidad
        </label>
      </div>
    </Modal>
  );
}
