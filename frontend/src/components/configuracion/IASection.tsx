import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import { nutricionApi } from '../../modules/nutricion/api';

// Modelo de IA que completa la info nutricional (y si la clave esta cargada).
export default function IASection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['ia-modelo'], queryFn: nutricionApi.getModeloIA });
  const config = data?.data;

  const cambiar = useMutation({
    mutationFn: (modelo: string) => nutricionApi.setModeloIA(modelo),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ia-modelo'] }); toast.success('Modelo de IA guardado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!config) return null;
  return (
    <section className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Sparkles size={16} /> Inteligencia artificial</h2>
      <p className="text-[11px] text-text-muted mb-3">
        Modelo de Claude que lee las recetas y completa la info nutricional.
        {!config.clave_configurada && <span className="text-red-600 font-medium"> Falta cargar ANTHROPIC_API_KEY en el servidor.</span>}
      </p>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Modelo de IA">
        {config.opciones.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={config.modelo === o.id}
            onClick={() => config.modelo !== o.id && cambiar.mutate(o.id)} disabled={cambiar.isPending}
            className={clsx('text-left rounded-lg border p-3 transition-colors cursor-pointer',
              config.modelo === o.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-gray-200 hover:border-gray-300')}>
            <div className="text-sm font-medium">{o.nombre}</div>
            <div className="text-xs text-text-muted">{o.detalle}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
