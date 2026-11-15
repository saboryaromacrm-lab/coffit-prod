import type { PasoPromo, Producto } from '../types';

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
