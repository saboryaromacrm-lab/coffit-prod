// ============================================================================
// COMO SE ASIENTA EN PRODUCCION
// Cada producto / subreceta dice con que unidad se carga en Produccion
// (plancha, bandeja, tanda...) y cuanto rinde esa unidad en la unidad de su
// receta: unidades (productos), porciones o gramos (subrecetas). Sin configurar
// es la receta completa, que es como se interpreto siempre.
// Los registros siguen la configuracion ACTUAL de su producto (al configurarlo
// se reinterpretan los cargados antes), salvo que en esa carga se haya anotado
// que la unidad rindio distinto (produccion_registros.rinde) o que se haya
// anotado de otra forma (produccion_registros.forma): en recetas completas
// ('receta') o en la unidad suelta de su receta ('base': porciones o kg).
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

const FORMAS_CARGA = ['receta', 'base'];

// Como se anoto una carga: forma (null = la unidad configurada) y, si esa vez
// la unidad rindio distinto, cuanto (un numero > 0). La unidad suelta no
// rinde distinto: 1 unidad es 1 unidad.
function leerCarga(body) {
  const forma = FORMAS_CARGA.includes(body.forma) ? body.forma : null;
  const rinde = numeroPositivo(body.rinde);
  return { forma, rinde: forma !== 'base' && rinde > 0 ? rinde : null };
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
// Lo que rinde 1 de lo anotado, en la base de la receta, segun su forma.
const RINDE = `CASE pr.forma
  WHEN 'base' THEN IF(a.base = 'g', 1000, 1)
  WHEN 'receta' THEN COALESCE(pr.rinde, a.rendimiento)
  ELSE COALESCE(pr.rinde, a.asiento_rinde, a.rendimiento) END`;
// Unidad de lo anotado (null = la receta). La suelta, como unidadSuelta del
// front: 1 kg lo que rinde en gramos y 1 porcion el resto (productos incluidos).
const UNIDAD = `CASE pr.forma
  WHEN 'base' THEN IF(a.base = 'g', 'kg', 'porción')
  WHEN 'receta' THEN NULL
  ELSE a.asiento_unidad END`;
// Lo anotado en la unidad configurada (16 unidades de un triple que se asienta
// por plancha de 2 = 8 planchas). Lo que ya no existe cuenta lo anotado.
const ASENTADO = `IF(pr.forma IS NULL OR a.nombre IS NULL, pr.cantidad,
  pr.cantidad * ${RINDE} / COALESCE(a.asiento_rinde, a.rendimiento))`;
// Recetas completas que representa (para el consumo de ingredientes).
const RECETAS = `pr.cantidad * ${RINDE} / a.rendimiento`;
// Unidades reales (unidades o porciones). Lo que rinde en gramos (masas) cuenta
// lo asentado en su unidad configurada.
const UNIDADES = `IF(a.base IN ('u', 'porc'), pr.cantidad * ${RINDE}, ${ASENTADO})`;

module.exports = { leerAsiento, leerCarga, ITEMS_PRODUCCION, RINDE, UNIDAD, ASENTADO, RECETAS, UNIDADES };
