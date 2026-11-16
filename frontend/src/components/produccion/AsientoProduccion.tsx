import clsx from 'clsx';
import NumericInput from '../common/NumericInput';
import type { AsientoInput, BaseAsiento } from '../../types';
import { asientoPorUnidad, enBase, enUnidad, nombreBase, plural } from '../../utils/asiento';

// Bloque de la ficha de un producto o subreceta: con que unidad se carga en
// Produccion y cuanto rinde. Lo que rinde vacio = la receta completa (sigue al
// rendimiento aunque cambie). Lo ya cargado en Produccion se lee con lo que
// diga aca (salvo las cargas que anotaron que rindieron distinto).
export default function AsientoProduccion({ value, onChange, base, rendimiento }: {
  value: AsientoInput;
  onChange: (v: AsientoInput) => void;
  base: BaseAsiento;
  rendimiento: number; // lo que rinde la receta completa, en su base
}) {
  const porUnidad = asientoPorUnidad(base);
  const nombre = value.asiento_unidad?.trim() || 'receta';
  const rinde = value.asiento_rinde || rendimiento;
  const atajos = [
    { label: 'Receta completa', activo: !value.asiento_rinde, v: { asiento_unidad: value.asiento_unidad, asiento_rinde: null } },
    {
      label: porUnidad.label,
      activo: value.asiento_rinde === porUnidad.asiento_rinde && value.asiento_unidad === porUnidad.asiento_unidad,
      v: { asiento_unidad: porUnidad.asiento_unidad, asiento_rinde: porUnidad.asiento_rinde },
    },
  ];

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-muted">🏭 Cómo se asienta en producción</p>
        <div className="flex gap-1.5">
          {atajos.map((a) => (
            <button key={a.label} type="button" onClick={() => onChange(a.v)}
              className={clsx('px-2.5 py-1 rounded-full text-[11px] font-medium border',
                a.activo ? 'bg-primary text-white border-primary' : 'border-gray-300 text-text-muted hover:bg-gray-50')}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
        <span>1</span>
        <input value={value.asiento_unidad ?? ''} maxLength={30} placeholder="receta"
          onChange={(e) => onChange({ ...value, asiento_unidad: e.target.value || null })}
          aria-label="Unidad con que se asienta"
          className="w-32 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <span>=</span>
        <NumericInput value={value.asiento_rinde ?? 0} min={0} step="1" placeholder={String(rendimiento)}
          onChange={(v) => onChange({ ...value, asiento_rinde: v > 0 ? v : null })}
          className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <span>{nombreBase(base)}</span>
      </div>
      <p className="text-[11px] text-text-muted">
        En Producción se carga en <strong>{plural(nombre, 2)}</strong>: por ejemplo, {enUnidad(3, nombre)} = {enBase(3 * rinde, base)}.
        {!value.asiento_rinde && ' Vacío = la receta completa.'} Lo ya cargado también se lee así.
      </p>
    </div>
  );
}
