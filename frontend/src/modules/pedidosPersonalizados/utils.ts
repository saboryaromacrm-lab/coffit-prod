import { formatMoney } from '../../utils/formatters';
import type { LineaReceta, OpcionEditor } from './types';

// Clave de una opcion o paso nuevo (sin id todavia). El servidor la usa para
// resolver dependencias entre opciones nuevas al guardar.
export const nuevaKey = () => `n${Math.random().toString(36).slice(2, 10)}`;

// Identificador de una opcion en el editor: el id si ya esta guardada, si no la key.
export const refOpcion = (o: { id?: number; key?: string }) => String(o.id ?? o.key);

export const opcionVacia = (): OpcionEditor => ({
  key: nuevaKey(), nombre: '', descripcion: null, precio: 0, precio_modo: 'fijo',
  peso_kg: null, depende_de: null, etiquetas: [], imagen: null, activo: true, receta: [],
});

// Costo de una receta separado en fijo y por kg (las lineas por kg se
// multiplican por el peso del producto, que se conoce recien al elegir).
export function costoReceta(lineas: LineaReceta[]) {
  let fijo = 0;
  let porKg = 0;
  let incompleto = false;
  for (const l of lineas) {
    if (l.costo_unitario == null) incompleto = true;
    const c = l.cantidad * (l.costo_unitario ?? 0);
    if (l.por_kg) porKg += c; else fijo += c;
  }
  return { fijo, porKg, incompleto };
}

// "$1,200.00 + $3,000.00/kg"; null si la receta no tiene costo.
export function textoCosto(lineas: LineaReceta[]) {
  const { fijo, porKg } = costoReceta(lineas);
  if (!fijo && !porKg) return null;
  return [fijo ? formatMoney(fijo) : null, porKg ? `${formatMoney(porKg)}/kg` : null].filter(Boolean).join(' + ');
}
