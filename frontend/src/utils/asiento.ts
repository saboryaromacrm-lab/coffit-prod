import type { AsientoInput, BaseAsiento, FormaCarga, ProductoCatalogo } from '../types';

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

// Lo asentado de un producto en un reporte: "8 planchas", "2 recetas = 5,6 kg".
export function detalleAsentado(cantidad: number, unidad: string | null, base: BaseAsiento | null, equivalente: number | null) {
  if (!base) return '';
  const asentado = enUnidad(cantidad, unidad);
  return base === 'g' && equivalente != null ? `${asentado} = ${enBase(equivalente, 'g')}` : asentado;
}

// La unidad suelta de una receta: 1 unidad, 1 porción o 1 kg (como UNIDAD del backend).
const unidadSuelta = (base: BaseAsiento) =>
  base === 'g' ? { unidad: 'kg', rinde: 1000 } : { unidad: NOMBRE_BASE[base], rinde: 1 };

// Atajo "por unidad" segun la base de la receta.
export function asientoPorUnidad(base: BaseAsiento): AsientoInput & { label: string } {
  const { unidad, rinde } = unidadSuelta(base);
  return { asiento_unidad: unidad, asiento_rinde: rinde, label: `Por ${unidad}` };
}

// Una forma de anotar una carga: su unidad (null = la receta) y lo que rinde 1.
export interface OpcionCarga { forma: FormaCarga | null; unidad: string | null; rinde: number }

// Como RINDE / UNIDAD del backend: la unidad configurada (forma null), la receta
// completa o la unidad suelta.
export function opcionDeCarga(a: ProductoCatalogo, forma: FormaCarga | null): OpcionCarga {
  if (forma === 'receta') return { forma, unidad: null, rinde: a.rendimiento };
  if (forma === 'base') return { forma, ...unidadSuelta(a.base) };
  return { forma, unidad: a.asiento_unidad, rinde: rindeDe(a) };
}

// Formas de anotar una carga de un producto, la configurada primero y sin
// repetir las que rinden lo mismo (sin configurar, la receta ya es la configurada).
export function formasDeCarga(a: ProductoCatalogo): OpcionCarga[] {
  const todas = ([null, 'receta', 'base'] as const).map((f) => opcionDeCarga(a, f));
  return todas.filter((o, i) => todas.findIndex((x) => x.rinde === o.rinde) === i);
}

// Si se anota en la unidad suelta (1 unidad, 1 porción, 1 kg): no tiene
// equivalencia que mostrar ni rinde distinto (1 unidad es 1 unidad).
export const esUnidadSuelta = (o: OpcionCarga, base: BaseAsiento) => o.rinde === unidadSuelta(base).rinde;

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
