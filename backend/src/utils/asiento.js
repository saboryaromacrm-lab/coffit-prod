// ============================================================================
// COMO SE ASIENTA EN PRODUCCION
// Cada producto / subreceta dice con que unidad se carga en Produccion
// (plancha, bandeja, tanda...) y cuanto rinde esa unidad en la unidad de su
// receta: unidades (productos), porciones o gramos (subrecetas). Sin configurar
// es la receta completa, que es como se interpreto siempre.
// Los registros siguen la configuracion ACTUAL de su producto (al configurarlo
// se reinterpretan los cargados antes), salvo que en esa carga se haya anotado
// que la unidad rindio distinto (produccion_registros.rinde).
// ============================================================================

const MAX_UNIDAD = 30;

const numeroPositivo = (v) => (v == null || v === '' ? null : Number(v));

// asiento_unidad / asiento_rinde del body, validados.
// undefined = no vinieron (en un PUT, no se tocan).
function leerAsiento(body) {
  if (!body || !('asiento_unidad' in body || 'asiento_rinde' in body)) return undefined;
  const unidad = String(body.asiento_unidad ?? '').trim() || null;
  const rinde = numeroPositivo(body.asiento_rinde);
  if (unidad && unidad.length > MAX_UNIDAD) return { error: `La unidad de producción admite hasta ${MAX_UNIDAD} caracteres` };
  if (rinde !== null && !(rinde > 0)) return { error: 'Lo que rinde la unidad de producción tiene que ser mayor a 0' };
  if (rinde !== null && !unidad) return { error: 'Poné el nombre de la unidad con que se asienta en producción' };
  return { unidad, rinde };
}

// Rinde distinto en una carga puntual: null (el de siempre) o un numero > 0.
function leerRindeCarga(v) {
  const rinde = numeroPositivo(v);
  return rinde !== null && rinde > 0 ? rinde : null;
}

// Producto o subreceta de cada registro. El match es por nombre (el producto_id
// del registro es ambiguo entre las dos tablas): gana el producto y, si hay
// nombres repetidos, el de menor id. rendimiento = lo que rinde la receta
// completa; base = su unidad ('u' unidades, 'porc' porciones, 'g' gramos).
const ITEMS_PRODUCCION = `(
  SELECT p.id, p.nombre, 'producto' AS tipo, p.asiento_unidad, p.asiento_rinde,
         NULLIF(p.porciones, 0) AS rendimiento, 'u' AS base
  FROM productos p
  WHERE p.activo = 1 AND p.es_borrador = 0
    AND p.id = (SELECT MIN(x.id) FROM productos x WHERE x.nombre = p.nombre AND x.activo = 1 AND x.es_borrador = 0)
  UNION ALL
  SELECT s.id, s.nombre, 'subreceta', s.asiento_unidad, s.asiento_rinde,
         NULLIF(s.rendimiento_gramos, 0), IF(s.tipo_rendimiento = 'porciones', 'porc', 'g')
  FROM subrecetas s
  WHERE s.activo = 1
    AND s.id = (SELECT MIN(x.id) FROM subrecetas x WHERE x.nombre = s.nombre AND x.activo = 1)
    AND NOT EXISTS (SELECT 1 FROM productos p WHERE p.nombre = s.nombre AND p.activo = 1 AND p.es_borrador = 0)
)`;

// Expresiones sobre un registro `pr` unido a su item `a`
// (LEFT JOIN ${ITEMS_PRODUCCION} a ON a.nombre = pr.producto_nombre).
const RINDE = 'COALESCE(pr.rinde, a.asiento_rinde, a.rendimiento)';
// Recetas completas que representa (para el consumo de ingredientes).
const RECETAS = `pr.cantidad * ${RINDE} / a.rendimiento`;
// Unidades reales (unidades o porciones). Lo que rinde en gramos (masas) y lo
// que ya no existe cuentan lo asentado.
const UNIDADES = `IF(a.base IN ('u', 'porc'), pr.cantidad * ${RINDE}, pr.cantidad)`;

module.exports = { leerAsiento, leerRindeCarga, ITEMS_PRODUCCION, RINDE, RECETAS, UNIDADES };
