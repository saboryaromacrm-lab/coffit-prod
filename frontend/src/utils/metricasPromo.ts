import type { OfertaCostoManual, PasoPromo, Producto, ResumenCanales, TipoOferta } from '../types';
import { calcularMCNeto, calcularMarkup, calcularPrecioConPromo } from './calculators';

// =============================================================================
// METRICAS DE UN BORRADOR DE PROMO (editor, comparador A/B y asistente IA)
// Sirve para cualquier tipo: combo (precio_especial) o por-producto.
// =============================================================================
export interface MetricasDraft {
  unidades: number;
  costoTotal: number;
  precioLista: number;
  precioFinal: number;
  descuento: number;
  pctDescuento: number;
  markupLista: number; // sin promo
  markup: number;      // con promo
  costoRegalo: number; // compra_regalo: lo que cuesta lo que se regala (ya va en costoTotal)
  foodCost: number; // % del precio final que se va en costo
  mcTarjeta: number;
  mcEfectivo: number;
  gananciaTarjeta: number;
  gananciaEfectivo: number;
}

// Costo cargado a mano en la promo (ej. un vaso de $100). Suma costo; con
// precio de venta simulado (> 0) cuenta en el precio como un producto mas.
// Sin precio es solo costo (no entra en promedios ni alertas por producto).
// `key` identifica la fila en el editor.
export type ItemManual = OfertaCostoManual & { key: string };
export const nuevaKeyManual = () => `m${Math.random().toString(36).slice(2, 10)}`;
export const costoManuales = (ms: ItemManual[]) => ms.reduce((s, m) => s + (Number(m.costo) || 0) * (Number(m.cantidad) || 1), 0);
export const precioManuales = (ms: ItemManual[]) => ms.reduce((s, m) => s + (Number(m.precio) || 0) * (Number(m.cantidad) || 1), 0);
export const conPrecio = (m: ItemManual) => (Number(m.precio) || 0) > 0;

export function calcularMetricasDraft(
  productos: (Producto & { cantidad?: number; rol?: string; descuento_pct?: number })[],
  manuales: ItemManual[],
  tipo: TipoOferta,
  valor: number,
  resumenCanales: ResumenCanales,
): MetricasDraft | null {
  if (productos.length === 0) return null;
  let unidades = 0, costoTotal = costoManuales(manuales), precioLista = 0, precioFinal = 0, costoRegalo = 0;
  for (const p of productos) {
    const cant = Number(p.cantidad) || 1;
    const costo = Number(p.costo_total) || 0;
    const precio = Number(p.precio_publico) || 0;
    unidades += cant;
    costoTotal += costo * cant; // el costo del regalo SIEMPRE cuenta
    precioLista += precio * cant;
    if (tipo === 'compra_regalo') {
      // pagados a precio lista; regalos con su descuento aplicado
      const esRegalo = p.rol === 'regalo';
      const desc = Math.min(100, Number(p.descuento_pct) || 100);
      precioFinal += esRegalo ? precio * cant * (1 - desc / 100) : precio * cant;
      if (esRegalo) costoRegalo += costo * cant;
    } else if (tipo !== 'precio_especial') {
      precioFinal += calcularPrecioConPromo(precio, tipo, valor) * cant;
    }
  }
  // Manuales con precio simulado: se venden como un producto pagado
  for (const m of manuales.filter(conPrecio)) {
    const cant = Number(m.cantidad) || 1;
    const precio = Number(m.precio);
    unidades += cant;
    precioLista += precio * cant;
    if (tipo === 'compra_regalo') precioFinal += precio * cant;
    else if (tipo !== 'precio_especial') precioFinal += calcularPrecioConPromo(precio, tipo, valor) * cant;
  }
  // Precio especial = precio del combo entero
  if (tipo === 'precio_especial') precioFinal = Math.max(0, Number(valor) || 0);
  // Compra+regalo con precio escrito a mano: pisa el automatico
  if (tipo === 'compra_regalo' && Number(valor) > 0) precioFinal = Number(valor);
  const descuento = precioLista - precioFinal;
  const pctDescuento = precioLista > 0 ? (descuento / precioLista) * 100 : 0;
  const markup = calcularMarkup(precioFinal, costoTotal);
  const foodCost = precioFinal > 0 ? (costoTotal / precioFinal) * 100 : 0;
  const mcT = precioFinal > 0 ? calcularMCNeto(precioFinal, costoTotal, resumenCanales.tarjeta) : null;
  const mcE = precioFinal > 0 ? calcularMCNeto(precioFinal, costoTotal, resumenCanales.efectivo) : null;
  return {
    unidades, costoTotal, precioLista, precioFinal, descuento, pctDescuento,
    markupLista: calcularMarkup(precioLista, costoTotal), markup, foodCost, costoRegalo,
    mcTarjeta: mcT?.mc ?? 0,
    mcEfectivo: mcE?.mc ?? 0,
    gananciaTarjeta: mcT?.ganancia ?? 0,
    gananciaEfectivo: mcE?.ganancia ?? 0,
  };
}

// Seleccion de un producto en la promo: rol pago | regalo; descuento_pct solo
// aplica al regalo (100 = gratis).
export interface SelProducto { cantidad: number; rol: 'pago' | 'regalo'; descuento_pct: number }
export type Selecciones = Map<number, SelProducto>;

// Lo que entra al calculo: en un combo de precio especial con pasos, la opcion
// mas cara de cada paso cuenta como un producto mas y su recargo suma al precio.
export function conPasos(productos: (Producto & SelProducto)[], tipo: TipoOferta, valor: number, pasos: PasoPromo[], allProducts: Producto[]) {
  if (tipo !== 'precio_especial') return { productos, valor };
  const escenario = escenarioPasos(pasos, allProducts);
  return {
    productos: [...productos, ...escenario.map((e) => ({ ...e.producto, cantidad: 1, rol: 'pago' as const, descuento_pct: 100 }))],
    valor: valor + escenario.reduce((s, e) => s + e.extra, 0),
  };
}

// Opcion con la que se costea cada paso de un combo: la mas cara (peor caso).
// El costo real lo calcula Coffit en cada venta con lo que elige el cliente.
export function escenarioPasos(pasos: PasoPromo[], productos: Producto[]) {
  const porId = new Map(productos.map((p) => [p.id, p]));
  return pasos.flatMap((paso) => {
    const opciones = paso.opciones
      .map((o) => ({ producto: porId.get(o.producto_id), extra: o.extra }))
      .filter((o): o is { producto: Producto; extra: number } => o.producto != null);
    if (opciones.length === 0) return [];
    return [opciones.reduce((a, b) => ((Number(b.producto.costo_total) || 0) > (Number(a.producto.costo_total) || 0) ? b : a))];
  });
}
