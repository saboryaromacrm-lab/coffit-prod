const pool = require('../config/db');

/**
 * Recalcula el costo de una subreceta basandose en sus ingredientes
 */
async function recalculateSubreceta(conn, subrecetaId) {
  const [items] = await conn.query(
    `SELECT si.cantidad, si.unidad, i.costo_con_desperdicio, u.abreviatura
     FROM subreceta_ingredientes si
     JOIN ingredientes i ON si.ingrediente_id = i.id
     LEFT JOIN unidades u ON i.unidad_id = u.id
     WHERE si.subreceta_id = ?`,
    [subrecetaId]
  );

  let costoTotal = 0;
  for (const item of items) {
    costoTotal += item.cantidad * item.costo_con_desperdicio;
  }

  const [subreceta] = await conn.query(
    'SELECT rendimiento_gramos, tipo_rendimiento FROM subrecetas WHERE id = ?',
    [subrecetaId]
  );

  if (subreceta.length === 0) return;

  const rendimiento = subreceta[0].rendimiento_gramos;
  const costoPor100g = rendimiento > 0 ? (costoTotal / rendimiento) * 100 : 0;

  await conn.query(
    'UPDATE subrecetas SET costo_total = ?, costo_por_100g = ? WHERE id = ?',
    [costoTotal, costoPor100g, subrecetaId]
  );

  return { costoTotal, costoPor100g };
}

/**
 * Recalcula el costo total de un producto basandose en ingredientes y subrecetas
 */
async function recalculateProducto(conn, productoId) {
  // Ingredientes directos
  const [ingredientes] = await conn.query(
    `SELECT pi.cantidad, i.costo_con_desperdicio
     FROM producto_ingredientes pi
     JOIN ingredientes i ON pi.ingrediente_id = i.id
     WHERE pi.producto_id = ? AND pi.ingrediente_id IS NOT NULL`,
    [productoId]
  );

  // Subrecetas
  const [subrecetas] = await conn.query(
    `SELECT pi.cantidad, pi.unidad, s.costo_total, s.costo_por_100g,
            s.rendimiento_gramos, s.tipo_rendimiento
     FROM producto_ingredientes pi
     JOIN subrecetas s ON pi.subreceta_id = s.id
     WHERE pi.producto_id = ? AND pi.subreceta_id IS NOT NULL`,
    [productoId]
  );

  let costoReceta = 0;

  for (const ing of ingredientes) {
    costoReceta += ing.cantidad * ing.costo_con_desperdicio;
  }

  for (const sub of subrecetas) {
    let costoUnitarioSub;
    if (sub.tipo_rendimiento === 'porciones') {
      costoUnitarioSub = sub.rendimiento_gramos > 0
        ? sub.costo_total / sub.rendimiento_gramos
        : 0;
    } else {
      costoUnitarioSub = sub.costo_por_100g / 100; // costo por gramo
    }
    costoReceta += sub.cantidad * costoUnitarioSub;
  }

  // Obtener porciones del producto
  const [producto] = await conn.query(
    'SELECT porciones FROM productos WHERE id = ?',
    [productoId]
  );

  if (producto.length === 0) return;

  const porciones = producto[0].porciones || 1;
  const costoPorPorcion = costoReceta / porciones;

  await conn.query(
    'UPDATE productos SET costo_total = ? WHERE id = ?',
    [costoPorPorcion, productoId]
  );

  return costoPorPorcion;
}

/**
 * Recalculo en cascada desde un ingrediente actualizado
 * 1. Recalcular subrecetas que usan este ingrediente
 * 2. Recalcular productos que usan este ingrediente directamente
 * 3. Recalcular productos que usan las subrecetas afectadas
 */
async function cascadeFromIngredient(conn, ingredienteId) {
  // 1. Subrecetas afectadas
  const [subrecetasAfectadas] = await conn.query(
    'SELECT DISTINCT subreceta_id FROM subreceta_ingredientes WHERE ingrediente_id = ?',
    [ingredienteId]
  );

  for (const row of subrecetasAfectadas) {
    await recalculateSubreceta(conn, row.subreceta_id);
  }

  // 2. Productos que usan el ingrediente directamente
  const [productosDirectos] = await conn.query(
    'SELECT DISTINCT producto_id FROM producto_ingredientes WHERE ingrediente_id = ?',
    [ingredienteId]
  );

  const productoIds = new Set(productosDirectos.map(r => r.producto_id));

  // 3. Productos que usan las subrecetas afectadas
  if (subrecetasAfectadas.length > 0) {
    const subIds = subrecetasAfectadas.map(r => r.subreceta_id);
    const [productosIndirectos] = await conn.query(
      `SELECT DISTINCT producto_id FROM producto_ingredientes
       WHERE subreceta_id IN (${subIds.map(() => '?').join(',')})`,
      subIds
    );
    productosIndirectos.forEach(r => productoIds.add(r.producto_id));
  }

  // Recalcular todos los productos afectados
  for (const productoId of productoIds) {
    await recalculateProducto(conn, productoId);
  }

  return {
    subrecetasRecalculadas: subrecetasAfectadas.length,
    productosRecalculados: productoIds.size,
  };
}

/**
 * Recalculo en cascada desde una subreceta actualizada
 */
async function cascadeFromSubreceta(conn, subrecetaId) {
  const [productosAfectados] = await conn.query(
    'SELECT DISTINCT producto_id FROM producto_ingredientes WHERE subreceta_id = ?',
    [subrecetaId]
  );

  for (const row of productosAfectados) {
    await recalculateProducto(conn, row.producto_id);
  }

  return { productosRecalculados: productosAfectados.length };
}

module.exports = {
  recalculateSubreceta,
  recalculateProducto,
  cascadeFromIngredient,
  cascadeFromSubreceta,
};
