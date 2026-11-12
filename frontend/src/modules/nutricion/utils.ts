import type { Nutriente, EstadoProducto, IngredienteNutri } from './types';

// Orden y nombres del rotulo nutricional. `sub` = se muestra con sangria
// debajo del anterior (azucares dentro de carbohidratos, etc.).
export const NUTRIENTES: readonly { key: Nutriente; label: string; corto: string; unidad: string; sub?: boolean }[] = [
  { key: 'energia_kcal', label: 'Valor energético', corto: 'Kcal', unidad: 'kcal' },
  { key: 'carbohidratos_g', label: 'Carbohidratos', corto: 'Carbs', unidad: 'g' },
  { key: 'azucares_g', label: 'Azúcares', corto: 'Azúc.', unidad: 'g', sub: true },
  { key: 'proteinas_g', label: 'Proteínas', corto: 'Prot.', unidad: 'g' },
  { key: 'grasas_g', label: 'Grasas totales', corto: 'Grasas', unidad: 'g' },
  { key: 'grasas_sat_g', label: 'Saturadas', corto: 'Sat.', unidad: 'g', sub: true },
  { key: 'grasas_trans_g', label: 'Trans', corto: 'Trans', unidad: 'g', sub: true },
  { key: 'fibra_g', label: 'Fibra alimentaria', corto: 'Fibra', unidad: 'g' },
  { key: 'sodio_mg', label: 'Sodio', corto: 'Sodio', unidad: 'mg' },
];

// Energia y sodio sin decimales; el resto con uno.
export function fmtNutriente(key: Nutriente, v: number): string {
  const entero = key === 'energia_kcal' || key === 'sodio_mg';
  return v.toLocaleString('es-AR', { maximumFractionDigits: entero ? 0 : 1 });
}

export const fmtGramos = (g: number) => `${g.toLocaleString('es-AR', { maximumFractionDigits: g < 10 ? 1 : 0 })} g`;

// "1 u = 55 g" / "1 ml = 1,03 g": que representa 1 unidad de receta
export function textoUnidad(ing: Pick<IngredienteNutri, 'unidad' | 'gramos_por_unidad'>): string {
  if (ing.gramos_por_unidad == null) return '—';
  return `1 ${ing.unidad || 'u'} = ${ing.gramos_por_unidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })} g`;
}

export const ESTADOS_PRODUCTO: Record<EstadoProducto, { label: string; clase: string; ayuda: string }> = {
  sin_datos: { label: 'Sin datos', clase: 'bg-gray-100 text-gray-600', ayuda: 'Ningún ingrediente tiene información nutricional.' },
  incompleto: { label: 'Incompleto', clase: 'bg-amber-100 text-amber-800', ayuda: 'Falta información de algún ingrediente.' },
  pendiente: { label: 'Sin controlar', clase: 'bg-sky-100 text-sky-800', ayuda: 'Calculado completo, falta que alguien lo controle.' },
  controlado: { label: 'Controlado', clase: 'bg-green-100 text-green-800', ayuda: 'Controlado: es lo que se muestra en la carta.' },
  vencido: { label: 'Cambió', clase: 'bg-red-100 text-red-700', ayuda: 'Se controló, pero después cambió la receta o un ingrediente.' },
};
