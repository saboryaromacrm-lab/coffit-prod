import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { cartaApi } from '../../api/carta';
import type { ComponenteDisponible, PasoPromo, Producto } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { escenarioPasos } from '../../utils/pasosCombo';
import NumericInput from '../common/NumericInput';

const input = 'px-2.5 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30';

// Pasos de eleccion de un combo ("Infusión a elección"): el cliente elige un
// producto de la carta en cada paso. Solo en promos de precio especial.
export default function PasosCombo({ pasos, onChange, productos, habilitado }: {
  pasos: PasoPromo[]; onChange: (p: PasoPromo[]) => void; productos: Producto[]; habilitado: boolean;
}) {
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const elegidas = useMemo(
    () => new Set(escenarioPasos(pasos, productos).map((e) => e.producto.id)),
    [pasos, productos]
  );

  if (!habilitado) {
    return (
      <p className="text-xs text-text-muted bg-white border border-dashed border-gray-300 rounded-lg px-3 py-2">
        Para que el cliente elija (ej. "Infusión a elección"), elegí el tipo <strong>Precio especial</strong> en el paso del precio:
        el combo tiene un precio cerrado y acá armás qué se elige.
        {pasos.length > 0 && <span className="text-amber-700"> Con otro tipo, los pasos cargados no se guardan.</span>}
      </p>
    );
  }

  const setPaso = (i: number, patch: Partial<PasoPromo>) => onChange(pasos.map((p, x) => (x === i ? { ...p, ...patch } : p)));
  const setExtra = (i: number, productoId: number, extra: number) => setPaso(i, {
    opciones: pasos[i].opciones.map((o) => (o.producto_id === productoId ? { ...o, extra } : o)),
  });

  return (
    <div className="space-y-2">
      {pasos.map((paso, i) => (
        <div key={i} className="bg-white border border-violet-200 rounded-lg p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={paso.nombre}
              onChange={(e) => setPaso(i, { nombre: e.target.value })}
              placeholder="Qué se elige (ej: Infusión)"
              className={`${input} flex-1 min-w-0 font-medium`}
            />
            <Quitar onClick={() => onChange(pasos.filter((_, x) => x !== i))} titulo="Quitar paso" />
          </div>

          <div className="space-y-1.5 sm:pl-3 sm:border-l-2 border-violet-100">
            {paso.opciones.map((o) => {
              const p = porId.get(o.producto_id);
              return (
                <div key={o.producto_id} className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-[150px] text-sm">
                    {p ? p.nombre : <span className="text-red-600">Producto no disponible</span>}
                    {p && <span className="block text-[11px] text-text-muted">costo {formatMoney(Number(p.costo_total) || 0)}
                      {elegidas.has(o.producto_id) && paso.opciones.length > 1 && <span className="text-violet-700"> · la más cara: se usa para el costo</span>}
                    </span>}
                  </div>
                  <label className="flex items-center gap-1 text-xs text-text-muted shrink-0" title="Recargo de esta opción (0 = sin cargo)">
                    +$
                    <NumericInput
                      value={o.extra} min={0} step="100" placeholder="0"
                      onChange={(v) => setExtra(i, o.producto_id, Math.max(0, v))}
                      className={`${input} w-24 text-right`}
                    />
                  </label>
                  <Quitar onClick={() => setPaso(i, { opciones: paso.opciones.filter((x) => x.producto_id !== o.producto_id) })} titulo="Quitar opción" />
                </div>
              );
            })}
            {paso.opciones.length === 0 && <p className="text-xs text-text-muted/70 italic">Sin opciones todavía</p>}
            <SelectorProductosCarta
              elegidos={paso.opciones.map((o) => o.producto_id)}
              onAgregar={(nuevos) => setPaso(i, { opciones: [...paso.opciones, ...nuevos.map((n) => ({ producto_id: n.id, extra: 0 }))] })}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...pasos, { nombre: '', opciones: [] }])}
        className="text-xs text-violet-700 hover:underline flex items-center gap-1 font-medium"
      >
        <Plus size={12} /> Agregar paso
      </button>
      <p className="text-[11px] text-text-muted">
        "2 de lo mismo" (ej. 2 cookies que pueden ser distintas) = dos pasos con las mismas opciones: "Cookie 1" y "Cookie 2".
        El resultado de abajo se calcula con la opción más cara de cada paso (con su recargo); el costo real de cada venta lo calcula Coffit.
      </p>
    </div>
  );
}

// Productos de la carta para un paso: de a uno o toda la categoria. Solo
// ofrece los que todavia no estan en el paso.
function SelectorProductosCarta({ elegidos, onAgregar }: {
  elegidos: number[]; onAgregar: (productos: ComponenteDisponible[]) => void;
}) {
  const { data } = useQuery({
    queryKey: ['carta-componentes-disponibles'],
    queryFn: () => cartaApi.getComponentesDisponibles(),
    staleTime: 60_000,
  });
  const [categoria, setCategoria] = useState('');
  const libres = (data?.data || []).filter((p) => !elegidos.includes(p.id));
  const categorias = [...new Set(libres.map((p) => p.categoria))];
  const catActiva = categorias.includes(categoria) ? categoria : (categorias[0] ?? '');
  const deCategoria = libres.filter((p) => p.categoria === catActiva);

  if (libres.length === 0) {
    return <p className="text-xs text-text-muted/70 italic">{data ? 'Ya están todos los productos de la carta' : 'Cargando productos…'}</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:flex sm:items-center gap-2">
      <select value={catActiva} onChange={(e) => setCategoria(e.target.value)} className={input} aria-label="Categoría">
        {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select
        value=""
        onChange={(e) => {
          const p = deCategoria.find((x) => x.id === Number(e.target.value));
          if (p) onAgregar([p]);
        }}
        className={`${input} sm:flex-1 min-w-0`}
        aria-label="Agregar producto"
      >
        <option value="">+ Agregar producto…</option>
        {deCategoria.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <button
        type="button"
        onClick={() => onAgregar(deCategoria)}
        className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
      >
        <Plus size={12} /> Toda la categoría ({deCategoria.length})
      </button>
    </div>
  );
}

function Quitar({ onClick, titulo }: { onClick: () => void; titulo: string }) {
  return (
    <button type="button" onClick={onClick} className="p-1.5 text-text-muted hover:text-red-600 shrink-0" title={titulo} aria-label={titulo}>
      <X size={14} />
    </button>
  );
}
