import type { ResumenCanal } from '../types';

export function calcularCostoConDesperdicio(
  precio: number,
  contenido: number,
  desperdicio: number
): number {
  if (contenido <= 0) return 0;
  const costoUnitario = precio / contenido;
  if (desperdicio > 0 && desperdicio < 100) {
    return costoUnitario / (1 - desperdicio / 100);
  }
  return costoUnitario;
}

export function calcularCostoUnitario(precio: number, contenido: number): number {
  if (contenido <= 0) return 0;
  return precio / contenido;
}

export interface DetalleDeduccion {
  nombre: string;
  monto: number;
  porcentaje: number;
  tipo: string;
}

export interface MCNetoResult {
  ganancia: number;
  mc: number;
  deducciones: DetalleDeduccion[];
  totalDeducciones: number;
  precioNeto: number;
}

export function calcularMCNeto(
  precio: number,
  costo: number,
  resumenCanal: ResumenCanal
): MCNetoResult {
  let totalDeducciones = 0;
  let descuentoMonto = 0;
  const deducciones: DetalleDeduccion[] = [];

  for (const concepto of resumenCanal.conceptos) {
    const monto = precio * (concepto.valor / 100);

    if (concepto.tipo === 'descuento') {
      descuentoMonto = monto;
    }

    totalDeducciones += monto;
    deducciones.push({
      nombre: concepto.nombre,
      monto,
      porcentaje: concepto.valor,
      tipo: concepto.tipo,
    });
  }

  const precioNeto = precio - descuentoMonto;
  const ganancia = precio - costo - totalDeducciones;
  const mc = precioNeto > 0 ? (ganancia / precioNeto) * 100 : 0;

  return { ganancia, mc, deducciones, totalDeducciones, precioNeto };
}

export function getMCClass(mc: number): 'danger' | 'warning' | 'success' {
  if (mc < 25) return 'danger';
  if (mc < 35) return 'warning';
  return 'success';
}

export function getMCColor(mc: number): string {
  if (mc < 25) return '#dc3545';
  if (mc < 35) return '#f57c00';
  return '#2e7d32';
}

export function calcularMarkup(precio: number, costo: number): number {
  if (costo <= 0) return 0;
  return ((precio - costo) / costo) * 100;
}

/**
 * Food cost %: que porcentaje del precio de venta se va en el costo del plato.
 * Es el indicador clasico de gastronomia, inverso al markup: cuanto MAS bajo,
 * mejor. Se calcula sobre el precio de lista (no sobre el neto de descuentos),
 * que es la definicion estandar.
 */
export function calcularFoodCost(precio: number, costo: number): number {
  if (precio <= 0) return 0;
  return (costo / precio) * 100;
}

// Bandas de referencia de gastronomia. Ojo: al reves que el MC, aca menos es
// mejor, por eso las comparaciones van invertidas respecto de getMCClass.
export function getFoodCostClass(fc: number): 'danger' | 'warning' | 'success' {
  if (fc > 40) return 'danger';
  if (fc > 30) return 'warning';
  return 'success';
}

export function getFoodCostColor(fc: number): string {
  if (fc > 40) return '#dc3545';
  if (fc > 30) return '#f57c00';
  return '#2e7d32';
}

/**
 * Calcula el precio efectivo unitario aplicando una promo.
 *
 * Tipos:
 *  - descuento_porcentaje (valor=10): resta 10% al precio
 *  - descuento_fijo (valor=500): resta $500 al precio
 *  - precio_especial (valor=6000): reemplaza el precio
 *  - 2x1: precio efectivo = precio / 2 (compra 2 paga 1)
 *  - 3x2: precio efectivo = precio * 2/3 (compra 3 paga 2)
 *
 * IMPORTANTE: para 2x1 y 3x2 el resultado es el "precio efectivo unitario",
 * que es lo que importa para calcular MC y markup en las metricas.
 */
export function calcularPrecioConPromo(
  precio: number,
  tipo: string,
  valor: number
): number {
  if (precio <= 0) return 0;
  const v = Number(valor) || 0;
  switch (tipo) {
    case 'descuento_porcentaje': {
      const pct = Math.max(0, Math.min(100, v));
      return Math.max(0, precio * (1 - pct / 100));
    }
    case 'descuento_fijo':
      return Math.max(0, precio - v);
    case 'precio_especial':
      return Math.max(0, v);
    case '2x1':
      return precio / 2;
    case '3x2':
      return (precio * 2) / 3;
    default:
      return precio;
  }
}
