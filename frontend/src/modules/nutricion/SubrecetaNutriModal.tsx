import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import { nutricionApi } from './api';
import { fmtGramos } from './utils';
import TablaNutricional from './TablaNutricional';
import LineasReceta from './LineasReceta';
import IngredientesDeReceta from './IngredientesDeReceta';
import Aviso from './Aviso';

// Info nutricional de una subreceta, abierta desde la receta de un producto.
// Se calcula con sus ingredientes: no se controla aparte.
export default function SubrecetaNutriModal({ subrecetaId, nombre, onClose }: {
  subrecetaId: number; nombre: string; onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['nutri-subreceta', subrecetaId],
    queryFn: () => nutricionApi.getSubreceta(subrecetaId),
    staleTime: 0, // los ingredientes se corrigen aca mismo o en otra pantalla
  });
  const s = data?.data;

  return (
    <Modal isOpen onClose={onClose} title={s?.nombre || nombre} size="xl"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
      ) : !s ? (
        <p className="text-sm text-red-600">{(error as Error)?.message || 'No se pudo cargar'}</p>
      ) : (() => {
        const porPorcion = s.tipo_rendimiento === 'porciones';
        const rinde = porPorcion ? `${s.rendimiento} ${s.rendimiento === 1 ? 'porción' : 'porciones'}` : fmtGramos(s.rendimiento);
        return (
          <div className="space-y-4">
            <p className="text-xs text-text-muted">Subreceta · se calcula con sus ingredientes.</p>

            {s.alertas.length > 0 && (
              <Aviso clase="bg-red-50 border-red-100 text-red-800" titulo="Cantidades que no cierran con la unidad: corregilas en la subreceta">
                {s.alertas.map((a) => <li key={`${a.nombre}-${a.cantidad}`}><strong>{a.nombre}</strong> ({a.cantidad.toLocaleString('es-AR')}): {a.motivo}</li>)}
              </Aviso>
            )}
            {s.faltantes.length > 0 && (
              <Aviso clase="bg-amber-50 border-amber-100 text-amber-900" titulo="Sin información nutricional">
                <li>{s.faltantes.join(', ')}</li>
              </Aviso>
            )}
            {s.sin_controlar.length > 0 && (
              <Aviso clase="bg-sky-50 border-sky-100 text-sky-900" titulo="Ingredientes con valores sin controlar">
                <li>{s.sin_controlar.join(', ')}</li>
              </Aviso>
            )}

            {s.con_datos && (
              <div className="space-y-2">
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[{ k: 'Rinde', v: rinde }, { k: 'Ingredientes en crudo', v: fmtGramos(s.gramos_receta) }].map((d) => (
                    <div key={d.k} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                      <dt className="text-[11px] text-text-muted">{d.k}</dt>
                      <dd className="text-sm font-semibold tabular-nums">{d.v}</dd>
                    </div>
                  ))}
                </dl>
                <TablaNutricional columnas={[
                  ...(s.por_unidad ? [{ titulo: porPorcion ? 'Por porción' : 'Cada 100 g', valores: s.por_unidad }] : []),
                  { titulo: 'Receta completa', detalle: rinde, valores: s.total },
                ]} />
              </div>
            )}

            <LineasReceta lineas={s.lineas} />
            <IngredientesDeReceta ids={s.lineas.flatMap((l) => (l.tipo === 'ingrediente' && l.ref_id != null ? [l.ref_id] : []))} />
          </div>
        );
      })()}
    </Modal>
  );
}
