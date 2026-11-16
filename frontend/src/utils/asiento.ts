import type { AsientoInput, BaseAsiento, ProductoCatalogo } from '../types';

// Como se asienta en Produccion (misma logica que backend/src/utils/asiento.js):
// cada producto/subreceta se carga en su unidad (plancha, bandeja...; sin
// configurar, la receta) y cada una rinde N en la base de su receta.

export const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

function pluralPalabra(w: string): string {
  if (w.length <= 2) return w; // abreviaturas: kg, u
  if (/ón$/i.test(w)) return `${w.slice(0, -2)}ones`;
  if (/z$/i.test(w)) return `${w.slice(0, -1)}ces`;
  if (/[aeiouáéí]$/i.test(w)) return `${w}s`;
  return `${w}es`;
}

// Plural de la primera palabra: plancha -> planchas, unidad -> unidades,
// porción -> porciones, bandeja de 24 -> bandejas de 24.
export function plural(nombre: string, n: number): string {
  if (n === 1) return nombre;
  const [primera, ...resto] = nombre.split(' ');
  return [pluralPalabra(primera), ...resto].join(' ');
}

// "8 planchas", "1 receta"
export const enUnidad = (n: number, unidad: string | null) => `${fmt(n)} ${plural(unidad || 'receta', n)}`;

const NOMBRE_BASE: Record<Exclude<BaseAsiento, 'g'>, string> = { u: 'unidad', porc: 'porción' };

// "16 unidades", "4 porciones", "5,6 kg"
export function enBase(n: number, base: BaseAsiento): string {
  if (base === 'g') return n >= 1000 ? `${fmt(n / 1000)} kg` : `${fmt(n)} g`;
  return `${fmt(n)} ${plural(NOMBRE_BASE[base], n)}`;
}

// Nombre de la base para "1 plancha = [2] unidades"
export const nombreBase = (base: BaseAsiento) => (base === 'g' ? 'g' : plural(NOMBRE_BASE[base], 2));

// Lo que rinde 1 unidad de produccion: el de esa carga, el configurado o la receta completa.
export const rindeDe = (a: AsientoInput & { rendimiento: number }, deLaCarga?: number | null) =>
  deLaCarga || a.asiento_rinde || a.rendimiento;

// Unidades reales de lo asentado (como UNIDADES del backend): en unidades o
// porciones; lo que rinde en gramos y lo que ya no existe cuentan lo asentado.
export const unidadesReales = (cantidad: number, base: BaseAsiento | null, rinde: number) =>
  base === 'u' || base === 'porc' ? cantidad * rinde : cantidad;

// Lo asentado de un producto en un reporte: "8 planchas", "2 recetas = 5,6 kg".
export function detalleAsentado(cantidad: number, unidad: string | null, base: BaseAsiento | null, equivalente: number | null) {
  if (!base) return '';
  const asentado = enUnidad(cantidad, unidad);
  return base === 'g' && equivalente != null ? `${asentado} = ${enBase(equivalente, 'g')}` : asentado;
}

// Atajo "por unidad" segun la base de la receta.
export const asientoPorUnidad = (base: BaseAsiento): AsientoInput & { label: string } =>
  base === 'g'
    ? { asiento_unidad: 'kg', asiento_rinde: 1000, label: 'Por kg' }
    : { asiento_unidad: NOMBRE_BASE[base], asiento_rinde: 1, label: `Por ${NOMBRE_BASE[base]}` };

// El de un registro: como en los reportes, por nombre y gana el producto.
export const asientoPorNombre = (catalogo: ProductoCatalogo[], nombre: string) =>
  catalogo.find((c) => c.nombre === nombre && c.tipo === 'producto') ?? catalogo.find((c) => c.nombre === nombre);

// Lo que viene de la base (DECIMAL como texto) al estado del editor.
export const asientoInicial = (x?: { asiento_unidad: string | null; asiento_rinde: number | string | null } | null): AsientoInput => ({
  asiento_unidad: x?.asiento_unidad ?? null,
  asiento_rinde: x?.asiento_rinde == null ? null : Number(x.asiento_rinde),
});

// Para guardar: sin espacios de mas; si rinde algo propio, necesita nombre.
export function asientoParaGuardar(a: AsientoInput): AsientoInput | { error: string } {
  const unidad = a.asiento_unidad?.trim() || null;
  if (a.asiento_rinde && !unidad) return { error: 'Poné el nombre de la unidad con que se asienta en producción' };
  return { asiento_unidad: unidad, asiento_rinde: a.asiento_rinde || null };
}
