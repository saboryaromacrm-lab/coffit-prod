import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Loader2, AlertTriangle, ExternalLink, Sparkles } from 'lucide-react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import { nutricionApi } from './api';
import type { FuenteNutri, ProductoNutri } from './types';
import { ESTADOS_PRODUCTO, fmtNutriente, fmtGramos } from './utils';
import TablaNutricional from './TablaNutricional';
import IngredientesDeReceta from './IngredientesDeReceta';

// Detalle calculado de un producto: rotulo por porcion / cada 100 g, de donde
// sale cada numero, lo que falta, y el control (que se vence si algo cambia).
// Pedidos personalizados (fuente 'pp') igual: lo controlado sale en su catalogo.
export default function ProductoNutriModal({ fuente = 'carta', productoId, onClose }: {
  fuente?: FuenteNutri; productoId: number; onClose: () => void;
}) {
  const qc = useQueryClient();
  const clave = ['nutri-producto', fuente, productoId];
  const { data, isLoading, error } = useQuery({
    queryKey: clave,
    queryFn: () => nutricionApi.getProducto(fuente, productoId),
    // La receta se edita en otra pestaña ("Abrir receta"): al volver se recalcula sola
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const p = data?.data;

  const controlar = useMutation({
    mutationFn: (valor: boolean) => nutricionApi.controlarProducto(fuente, productoId, valor),
    onSuccess: (res, valor) => {
      qc.setQueryData(clave, res);
      qc.invalidateQueries({ queryKey: ['nutri-productos'] });
      toast.success(valor ? `Controlado: ya se muestra en ${fuente === 'carta' ? 'la carta' : 'el catálogo de Pedidos personalizados'}` : 'Control quitado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // La IA lee la receta y completa los ingredientes que no tienen info. Si ya
  // esta todo cargado, vuelve a analizar los que no estan controlados.
  const reanalizar = !!p && p.faltantes.length === 0;
  const completar = useMutation({
    mutationFn: () => nutricionApi.completarProducto(fuente, productoId, reanalizar),
    onSuccess: ({ data: r }) => {
      qc.setQueryData(clave, { success: true, data: r.producto });
      qc.invalidateQueries({ queryKey: ['nutri-productos'] });
      qc.invalidateQueries({ queryKey: ['nutri-ingredientes'] });
      if (r.errores.length) toast.error(`No se pudo completar: ${r.errores.map((e) => `${e.nombre} (${e.motivo})`).join(', ')}`, { duration: 8000 });
      else toast.success(`Listo: la IA analizó ${r.completados} ${r.completados === 1 ? 'ingrediente' : 'ingredientes'}. Revisalo y marcalo controlado.`);
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const accion = p && (p.estado === 'controlado'
    ? <Button variant="secondary" onClick={() => controlar.mutate(false)} loading={controlar.isPending}>Quitar control</Button>
    : <Button onClick={() => controlar.mutate(true)} loading={controlar.isPending} disabled={!p.completa}
        title={p.completa ? undefined : 'Faltan datos de algunos ingredientes'}>
        {p.estado === 'vencido' ? 'Volver a controlar' : 'Marcar controlado'}
      </Button>);

  return (
    <Modal isOpen onClose={onClose} title={p?.nombre || 'Producto'} size="xl"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        {p && (!p.completa || p.sin_controlar.length > 0) && (
          <Button variant="secondary" onClick={() => completar.mutate()} loading={completar.isPending}
            title={reanalizar ? 'Vuelve a analizar los ingredientes sin controlar (por ejemplo después de corregir una cantidad)' : undefined}>
            {!completar.isPending && <Sparkles size={14} />}
            {completar.isPending ? 'Leyendo la receta…' : reanalizar ? 'Volver a analizar' : 'Completar con IA'}
          </Button>
        )}
        {accion}
      </>}>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
      ) : !p ? (
        <p className="text-sm text-red-600">{(error as Error)?.message || 'No se pudo cargar'}</p>
      ) : <Detalle p={p} fuente={fuente} />}
    </Modal>
  );
}

function Detalle({ p, fuente }: { p: ProductoNutri; fuente: FuenteNutri }) {
  const estado = ESTADOS_PRODUCTO[p.estado];
  const pp = fuente === 'pp';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estado.clase}`}>{estado.label}</span>
        <span className="text-text-muted text-xs">{estado.ayuda}</span>
        <a href={pp ? `/pedidos-personalizados?producto=${p.id}` : `/productos?openId=${p.id}`} target="_blank" rel="noopener noreferrer"
          className="ml-auto text-xs text-primary hover:underline inline-flex items-center gap-1">Abrir receta <ExternalLink size={12} /></a>
      </div>

      {p.alertas.length > 0 && (
        <Aviso clase="bg-red-50 border-red-100 text-red-800" titulo="Cantidades que no cierran con la unidad (también afectan el costo). Corregilas en la receta y tocá «Volver a analizar»">
          {p.alertas.map((a) => <li key={`${a.nombre}-${a.cantidad}`}><strong>{a.nombre}</strong> ({a.cantidad.toLocaleString('es-AR')}): {a.motivo}</li>)}
        </Aviso>
      )}
      {p.faltantes.length > 0 && (
        <Aviso clase="bg-amber-50 border-amber-100 text-amber-900" titulo="Sin información nutricional: tocá «Completar con IA»">
          <li>{p.faltantes.join(', ')}</li>
        </Aviso>
      )}
      {p.sin_controlar.length > 0 && (
        <Aviso clase="bg-sky-50 border-sky-100 text-sky-900" titulo="Ingredientes con valores sin controlar">
          <li>{p.sin_controlar.join(', ')}</li>
        </Aviso>
      )}

      {p.con_datos && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <TablaNutricional columnas={[
            { titulo: `${pp ? 'Producto entero' : 'Por porción'}${p.porcion_g ? ` (${fmtGramos(p.porcion_g)})` : ''}`, valores: p.por_porcion },
            ...(p.por_100g ? [{ titulo: 'Cada 100 g', valores: p.por_100g }] : []),
          ]} />
          <div className="text-xs text-text-muted space-y-1">
            {pp ? (
              <p>Receta base del producto{p.peso_total_g ? <>, que pesa <strong>{fmtGramos(p.peso_total_g)}</strong>.</> : '.'}</p>
            ) : (
              <p>La receta rinde <strong>{p.porciones}</strong> {p.porciones === 1 ? 'porción' : 'porciones'}
                {p.peso_total_g ? <> y pesa <strong>{fmtGramos(p.peso_total_g)}</strong> terminada.</> : '.'}</p>
            )}
            <p>Peso de los ingredientes (crudo): {fmtGramos(p.gramos_receta)}.</p>
            {!p.peso_total_g && <p>{pp
              ? 'Los valores cada 100 g se ven cuando el producto tiene peso (hoy, los que se venden por kg).'
              : 'Para ver los valores cada 100 g cargá el peso final del producto en su receta.'}</p>}
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[620px] text-xs">
          <thead>
            <tr className="bg-gray-50 text-text-muted">
              <th className="px-3 py-1.5 text-left font-medium">Receta completa</th>
              <th className="px-3 py-1.5 text-right font-medium">Cantidad</th>
              <th className="px-3 py-1.5 text-right font-medium">Gramos</th>
              <th className="px-3 py-1.5 text-right font-medium">Kcal</th>
              <th className="px-3 py-1.5 text-right font-medium">Prot.</th>
              <th className="px-3 py-1.5 text-right font-medium">Carbs</th>
              <th className="px-3 py-1.5 text-right font-medium">Grasas</th>
            </tr>
          </thead>
          <tbody>
            {p.lineas.map((l) => (
              <tr key={`${l.tipo}-${l.linea_id}`} className={clsx('border-t border-gray-100', !l.completa && 'bg-amber-50/60')}>
                <td className="px-3 py-1.5">
                  {l.nombre}
                  {(l.tipo === 'subreceta' || l.tipo === 'producto') && <span className="ml-1 text-[10px] text-text-muted">({l.tipo})</span>}
                  {l.tipo === 'manual' && <span className="ml-1 text-[10px] text-text-muted">(item manual: no suma)</span>}
                  {!l.completa && <span className="ml-1 text-[10px] text-amber-700">{l.valores ? 'incompleta' : 'sin datos'}</span>}
                  {l.alerta && <AlertTriangle size={11} className="inline ml-1 text-red-600" />}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{l.cantidad.toLocaleString('es-AR')} {l.unidad}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.gramos != null ? fmtGramos(l.gramos) : '—'}</td>
                {(['energia_kcal', 'proteinas_g', 'carbohidratos_g', 'grasas_g'] as const).map((k) => (
                  <td key={k} className="px-3 py-1.5 text-right tabular-nums">{l.valores ? fmtNutriente(k, l.valores[k]) : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <IngredientesDeReceta ids={p.ingredientes} />
    </div>
  );
}

function Aviso({ clase, titulo, children }: { clase: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className={`border rounded-lg px-3 py-2 text-xs ${clase}`}>
      <div className="font-semibold mb-0.5">{titulo}</div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}
