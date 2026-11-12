const pool = require('../../config/db');
const { NUTRIENTES, calcularSubreceta, calcularProducto, estadoProducto } = require('./calculo');
const { JOIN_CATEGORIAS, CAT_NOMBRE, SUBCAT_NOMBRE } = require('../../utils/categoriaSql');

// ============================================================================
// Lectura de la base para el calculo nutricional. Pocas consultas en total
// (ingredientes, subrecetas y lineas de una vez), se calcula en memoria.
// ============================================================================

const COLS_NUTRI = NUTRIENTES.map((k) => `i.nutri_${k}`).join(', ');

// Valores cada 100 g de una fila (o null si el ingrediente no tiene datos)
function valoresDe(fila) {
  if (!fila.nutri_estado) return null;
  return Object.fromEntries(NUTRIENTES.map((k) => [k, Number(fila[`nutri_${k}`]) || 0]));
}

// mysql2 devuelve la columna JSON ya parseada
const alertasDe = (fila) => (Array.isArray(fila.nutri_alertas) ? fila.nutri_alertas : []);

async function cargarIngredientes(db = pool) {
  const [rows] = await db.query(
    `SELECT i.id, i.nombre, i.gramos_por_unidad, i.nutri_estado, i.nutri_alertas, ${COLS_NUTRI}
     FROM ingredientes i WHERE i.activo = 1`
  );
  return new Map(rows.map((r) => [r.id, {
    nombre: r.nombre,
    gramos_por_unidad: r.gramos_por_unidad == null ? null : Number(r.gramos_por_unidad),
    valores: valoresDe(r),
    estado: r.nutri_estado,
    alertas: alertasDe(r),
  }]));
}

// Todas las subrecetas activas, ya calculadas (son pocas)
async function cargarSubrecetas(ingredientes, db = pool) {
  const [subs] = await db.query(
    'SELECT id, nombre, rendimiento_gramos, tipo_rendimiento FROM subrecetas WHERE activo = 1'
  );
  const [lineas] = await db.query(
    `SELECT si.id AS linea_id, si.subreceta_id, si.ingrediente_id AS ref_id, si.cantidad,
            i.nombre, COALESCE(u.abreviatura, si.unidad, 'g') AS unidad
     FROM subreceta_ingredientes si
     JOIN ingredientes i ON i.id = si.ingrediente_id
     LEFT JOIN unidades u ON u.id = i.unidad_id
     ORDER BY si.id`
  );
  const porSub = new Map(subs.map((s) => [s.id, []]));
  for (const l of lineas) porSub.get(l.subreceta_id)?.push({ ...l, tipo: 'ingrediente' });
  return new Map(subs.map((s) => [s.id, { nombre: s.nombre, ...calcularSubreceta(s, porSub.get(s.id), ingredientes) }]));
}

// Lineas de receta de los productos pedidos (mismo criterio que el costo:
// la cantidad esta en la unidad del ingrediente; los manuales solo suman costo)
async function lineasDeProductos(ids, db = pool) {
  const porProd = new Map(ids.map((id) => [Number(id), []]));
  if (ids.length === 0) return porProd;
  const [rows] = await db.query(
    `SELECT pi.id AS linea_id, pi.producto_id, pi.cantidad,
            CASE WHEN pi.ingrediente_id IS NOT NULL THEN 'ingrediente'
                 WHEN pi.subreceta_id IS NOT NULL THEN 'subreceta' ELSE 'manual' END AS tipo,
            COALESCE(pi.ingrediente_id, pi.subreceta_id) AS ref_id,
            COALESCE(i.nombre, s.nombre, pi.nombre_manual) AS nombre,
            CASE WHEN pi.ingrediente_id IS NOT NULL THEN COALESCE(u.abreviatura, pi.unidad, 'g')
                 WHEN pi.subreceta_id IS NOT NULL THEN IF(s.tipo_rendimiento = 'porciones', 'porc', 'g')
                 ELSE COALESCE(pi.unidad, 'u') END AS unidad
     FROM producto_ingredientes pi
     LEFT JOIN ingredientes i ON i.id = pi.ingrediente_id
     LEFT JOIN unidades u ON u.id = i.unidad_id
     LEFT JOIN subrecetas s ON s.id = pi.subreceta_id
     WHERE pi.producto_id IN (?)
       AND (pi.ingrediente_id IS NOT NULL OR pi.subreceta_id IS NOT NULL OR pi.costo_manual IS NOT NULL)
     ORDER BY pi.id`,
    [ids]
  );
  for (const r of rows) porProd.get(Number(r.producto_id))?.push(r);
  return porProd;
}

/**
 * Donde se usa cada ingrediente (productos y subrecetas activos), con la
 * cantidad tal como esta cargada. ids = null -> todos.
 * Map ingrediente_id -> [{ tipo, linea_id, receta_id, receta, rinde, cantidad }]
 */
async function usosDeIngredientes(ids = null, db = pool) {
  if (ids && ids.length === 0) return new Map();
  const filtro = (col) => (ids ? `AND ${col} IN (?)` : '');
  const [rows] = await db.query(
    `SELECT 'producto' AS tipo, pi.id AS linea_id, pi.ingrediente_id, p.id AS receta_id, p.nombre AS receta,
            CONCAT(COALESCE(p.porciones, 1), ' porciones') AS rinde, pi.cantidad
     FROM producto_ingredientes pi
     JOIN productos p ON p.id = pi.producto_id AND p.activo = 1
     WHERE pi.ingrediente_id IS NOT NULL ${filtro('pi.ingrediente_id')}
     UNION ALL
     SELECT 'subreceta', si.id, si.ingrediente_id, s.id, s.nombre,
            CONCAT(CAST(s.rendimiento_gramos AS DECIMAL(10,0)), IF(s.tipo_rendimiento = 'porciones', ' porciones', ' g')),
            si.cantidad
     FROM subreceta_ingredientes si
     JOIN subrecetas s ON s.id = si.subreceta_id AND s.activo = 1
     WHERE 1 = 1 ${filtro('si.ingrediente_id')}
     ORDER BY receta`,
    ids ? [ids, ids] : []
  );
  const usos = new Map();
  for (const { ingrediente_id, ...u } of rows) {
    if (!usos.has(ingrediente_id)) usos.set(ingrediente_id, []);
    usos.get(ingrediente_id).push({ ...u, cantidad: Number(u.cantidad) });
  }
  return usos;
}

/**
 * Calcula productos activos. ids = null -> todos.
 * Devuelve Map id -> { id, nombre, categoria, estado, controlado_at, ...calculo }
 */
async function calcularProductos(ids = null, db = pool) {
  if (ids && ids.length === 0) return new Map();
  const [prods] = await db.query(
    `SELECT p.id, p.nombre, p.porciones, p.peso_total_g, p.nutri_controlado_at, p.nutri_huella,
            ${CAT_NOMBRE} AS categoria, ${SUBCAT_NOMBRE} AS subcategoria
     FROM productos p
     ${JOIN_CATEGORIAS('p')}
     WHERE p.activo = 1 ${ids ? 'AND p.id IN (?)' : ''}
     ORDER BY p.nombre`,
    ids ? [ids] : []
  );
  const ingredientes = await cargarIngredientes(db);
  const subrecetas = await cargarSubrecetas(ingredientes, db);
  const lineas = await lineasDeProductos(prods.map((p) => p.id), db);

  return new Map(prods.map((p) => {
    const calc = calcularProducto(p, lineas.get(p.id), ingredientes, subrecetas);
    return [p.id, {
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      subcategoria: p.subcategoria,
      estado: estadoProducto(calc, p.nutri_controlado_at, p.nutri_huella),
      controlado_at: p.nutri_controlado_at,
      ...calc,
    }];
  }));
}

// Productos que se ven en la carta: item activo, sin pausar y que no es un
// box/combo (esos muestran la promo, no la receta del producto).
async function idsEnCarta(db = pool) {
  const [rows] = await db.query(
    `SELECT DISTINCT ci.producto_id AS id
     FROM carta_items ci
     JOIN productos p ON p.id = ci.producto_id AND p.activo = 1
     WHERE ci.activo = 1 AND (ci.desactivar = 0 OR ci.desactivar IS NULL) AND ci.oferta_id IS NULL`
  );
  return rows.map((r) => r.id);
}

/**
 * Para la carta publica: SOLO productos con la info controlada y vigente.
 * Map producto_id -> { porcion_g, por_porcion, por_100g }
 */
async function nutricionPublica(productoIds, db = pool) {
  const ids = [...new Set(productoIds.filter((id) => id != null).map(Number))];
  const calc = await calcularProductos(ids, db);
  return new Map([...calc.values()]
    .filter((p) => p.estado === 'controlado')
    .map((p) => [p.id, { porcion_g: p.porcion_g, por_porcion: p.por_porcion, por_100g: p.por_100g }]));
}

module.exports = {
  COLS_NUTRI, valoresDe, alertasDe, cargarIngredientes, cargarSubrecetas, usosDeIngredientes, calcularProductos,
  idsEnCarta, nutricionPublica,
};
