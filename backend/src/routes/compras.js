const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');
const { cascadeFromIngredient } = require('../utils/recalculate');

// =============================================================================
// COMPRAS
// =============================================================================
// Modelo: cada compra registra un movimiento de gasto en mercaderia/insumos.
// Si se vincula a un ingrediente: al guardar actualiza precio1 + fecha_precio
// del ingrediente y CASCADE recalcula subrecetas y productos que lo usan.
// =============================================================================

// Helper: respuesta enriquecida con joins
async function fetchCompraConJoins(id) {
  const [rows] = await pool.query(
    `SELECT c.*,
            p.nombre AS proveedor_nombre_actual,
            cc.nombre AS concepto_nombre, cc.color AS concepto_color,
            mp.nombre AS metodo_pago_nombre,
            i.nombre AS ingrediente_nombre,
            i.contenido_envase AS ingrediente_contenido_envase,
            u.abreviatura AS ingrediente_unidad
     FROM compras c
     LEFT JOIN proveedores p ON p.id = c.proveedor_id
     LEFT JOIN conceptos_compra cc ON cc.id = c.concepto_id
     LEFT JOIN metodos_pago mp ON mp.id = c.metodo_pago_id
     LEFT JOIN ingredientes i ON i.id = c.ingrediente_id
     LEFT JOIN unidades u ON u.id = i.unidad_id
     WHERE c.id = ?`,
    [id]
  );
  return rows[0] || null;
}

// =============================================================================
// GET / - lista compras con filtros
// Filtros: desde, hasta, proveedor_id, concepto_id, ingrediente_id, buscar
// =============================================================================
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { desde, hasta, proveedor_id, concepto_id, ingrediente_id, buscar, limit, offset } = req.query;

    let sql = `
      SELECT c.*,
             COALESCE(p.nombre, c.proveedor_nombre) AS proveedor_nombre_display,
             cc.nombre AS concepto_nombre, cc.color AS concepto_color,
             mp.nombre AS metodo_pago_nombre,
             i.nombre AS ingrediente_nombre
      FROM compras c
      LEFT JOIN proveedores p ON p.id = c.proveedor_id
      LEFT JOIN conceptos_compra cc ON cc.id = c.concepto_id
      LEFT JOIN metodos_pago mp ON mp.id = c.metodo_pago_id
      LEFT JOIN ingredientes i ON i.id = c.ingrediente_id
      WHERE c.activo = 1
    `;
    const params = [];

    if (desde) { sql += ' AND c.fecha >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND c.fecha <= ?'; params.push(hasta); }
    if (proveedor_id) { sql += ' AND c.proveedor_id = ?'; params.push(proveedor_id); }
    if (concepto_id) { sql += ' AND c.concepto_id = ?'; params.push(concepto_id); }
    if (ingrediente_id) { sql += ' AND c.ingrediente_id = ?'; params.push(ingrediente_id); }
    if (buscar) {
      sql += ' AND (c.detalle LIKE ? OR c.proveedor_nombre LIKE ? OR i.nombre LIKE ?)';
      const term = `%${buscar}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY c.fecha DESC, c.created_at DESC';

    const limitNum = parseInt(limit) || 500;
    const offsetNum = parseInt(offset) || 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offsetNum);

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows, total: rows.length });
  })
);

// =============================================================================
// GET /metricas - resumen mes actual vs anterior + tops
// =============================================================================
router.get(
  '/metricas',
  asyncHandler(async (req, res) => {
    // Mes actual: del 1 del mes en curso hasta hoy
    const hoy = new Date();
    const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().substring(0, 10);
    const finMesActual = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().substring(0, 10);
    const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().substring(0, 10);
    const finMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().substring(0, 10);

    const [actualRows] = await pool.query(
      `SELECT COALESCE(SUM(monto_total), 0) AS total, COUNT(*) AS cantidad
       FROM compras WHERE activo = 1 AND fecha BETWEEN ? AND ?`,
      [inicioMesActual, finMesActual]
    );
    const [anteriorRows] = await pool.query(
      `SELECT COALESCE(SUM(monto_total), 0) AS total, COUNT(*) AS cantidad
       FROM compras WHERE activo = 1 AND fecha BETWEEN ? AND ?`,
      [inicioMesAnterior, finMesAnterior]
    );

    const [topProveedores] = await pool.query(
      `SELECT COALESCE(p.nombre, c.proveedor_nombre, 'Sin proveedor') AS proveedor,
              SUM(c.monto_total) AS total
       FROM compras c
       LEFT JOIN proveedores p ON p.id = c.proveedor_id
       WHERE c.activo = 1 AND c.fecha BETWEEN ? AND ?
       GROUP BY proveedor
       ORDER BY total DESC
       LIMIT 5`,
      [inicioMesActual, finMesActual]
    );

    const [topConceptos] = await pool.query(
      `SELECT COALESCE(cc.nombre, 'Sin concepto') AS concepto,
              COALESCE(cc.color, '#666666') AS color,
              SUM(c.monto_total) AS total
       FROM compras c
       LEFT JOIN conceptos_compra cc ON cc.id = c.concepto_id
       WHERE c.activo = 1 AND c.fecha BETWEEN ? AND ?
       GROUP BY concepto, color
       ORDER BY total DESC
       LIMIT 10`,
      [inicioMesActual, finMesActual]
    );

    const totalActual = Number(actualRows[0].total) || 0;
    const totalAnterior = Number(anteriorRows[0].total) || 0;
    const variacionPct = totalAnterior > 0
      ? ((totalActual - totalAnterior) / totalAnterior) * 100
      : null;

    success(res, {
      mes_actual: {
        total: totalActual,
        cantidad: Number(actualRows[0].cantidad) || 0,
        desde: inicioMesActual,
        hasta: finMesActual,
      },
      mes_anterior: {
        total: totalAnterior,
        cantidad: Number(anteriorRows[0].cantidad) || 0,
        desde: inicioMesAnterior,
        hasta: finMesAnterior,
      },
      variacion_pct: variacionPct,
      top_proveedores: topProveedores.map((r) => ({ proveedor: r.proveedor, total: Number(r.total) })),
      top_conceptos: topConceptos.map((r) => ({
        concepto: r.concepto, color: r.color, total: Number(r.total),
      })),
    });
  })
);

// =============================================================================
// POST / - crear compra (con vinculacion opcional a ingrediente)
// =============================================================================
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      fecha, proveedor_id, proveedor_nombre, concepto_id,
      ingrediente_id, cantidad_envases, monto_total,
      metodo_pago_id, detalle,
    } = req.body;

    if (!fecha) return error(res, 'fecha es requerida');
    const monto = parseFloat(monto_total);
    if (isNaN(monto) || monto <= 0) return error(res, 'monto_total debe ser mayor a 0');

    let cantEnv = null;
    if (ingrediente_id && cantidad_envases != null) {
      cantEnv = parseFloat(cantidad_envases);
      if (isNaN(cantEnv) || cantEnv <= 0) {
        return error(res, 'cantidad_envases debe ser mayor a 0');
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO compras
          (fecha, proveedor_id, proveedor_nombre, concepto_id, ingrediente_id,
           cantidad_envases, monto_total, metodo_pago_id, detalle)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fecha,
          proveedor_id || null,
          proveedor_nombre || null,
          concepto_id || null,
          ingrediente_id || null,
          cantEnv,
          monto,
          metodo_pago_id || null,
          detalle || null,
        ]
      );
      const compraId = result.insertId;

      // Si se vinculo a un ingrediente: actualizar precio1 + fecha_precio
      // Precio por envase = monto_total / cantidad_envases
      if (ingrediente_id && cantEnv && cantEnv > 0) {
        const precioPorEnvase = monto / cantEnv;

        // Actualizar el ingrediente con el nuevo precio y recalcular costo
        const [ingRows] = await conn.query(
          'SELECT contenido_envase, desperdicio FROM ingredientes WHERE id = ?',
          [ingrediente_id]
        );
        if (ingRows.length > 0) {
          const contenidoEnvase = Number(ingRows[0].contenido_envase) || 1;
          const desperdicio = Number(ingRows[0].desperdicio) || 0;
          const costoUnitario = precioPorEnvase / contenidoEnvase;
          const costoConDesperdicio = desperdicio > 0 && desperdicio < 100
            ? costoUnitario / (1 - desperdicio / 100)
            : costoUnitario;

          await conn.query(
            `UPDATE ingredientes
             SET precio1 = ?, fecha_precio = ?, costo_unitario = ?, costo_con_desperdicio = ?
             WHERE id = ?`,
            [precioPorEnvase, fecha, costoUnitario, costoConDesperdicio, ingrediente_id]
          );

          // Cascade: recalcular subrecetas y productos que usan este ingrediente
          await cascadeFromIngredient(conn, ingrediente_id);
        }
      }

      await conn.commit();
      const compra = await fetchCompraConJoins(compraId);
      success(res, compra, 201);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// =============================================================================
// PUT /:id - actualizar compra
// NOTA: si cambia el vinculo al ingrediente o el precio, vuelve a actualizar
// el ingrediente y cascadea.
// =============================================================================
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      fecha, proveedor_id, proveedor_nombre, concepto_id,
      ingrediente_id, cantidad_envases, monto_total,
      metodo_pago_id, detalle,
    } = req.body;

    if (!fecha) return error(res, 'fecha es requerida');
    const monto = parseFloat(monto_total);
    if (isNaN(monto) || monto <= 0) return error(res, 'monto_total debe ser mayor a 0');

    let cantEnv = null;
    if (ingrediente_id && cantidad_envases != null) {
      cantEnv = parseFloat(cantidad_envases);
      if (isNaN(cantEnv) || cantEnv <= 0) {
        return error(res, 'cantidad_envases debe ser mayor a 0');
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existing] = await conn.query(
        'SELECT ingrediente_id FROM compras WHERE id = ? AND activo = 1',
        [id]
      );
      if (existing.length === 0) {
        await conn.rollback();
        return error(res, 'Compra no encontrada', 404);
      }

      await conn.query(
        `UPDATE compras SET
          fecha = ?, proveedor_id = ?, proveedor_nombre = ?, concepto_id = ?,
          ingrediente_id = ?, cantidad_envases = ?, monto_total = ?,
          metodo_pago_id = ?, detalle = ?
         WHERE id = ?`,
        [
          fecha,
          proveedor_id || null,
          proveedor_nombre || null,
          concepto_id || null,
          ingrediente_id || null,
          cantEnv,
          monto,
          metodo_pago_id || null,
          detalle || null,
          id,
        ]
      );

      // Si vinculo a ingrediente, actualizar precio del ingrediente y cascadear
      if (ingrediente_id && cantEnv && cantEnv > 0) {
        const precioPorEnvase = monto / cantEnv;
        const [ingRows] = await conn.query(
          'SELECT contenido_envase, desperdicio FROM ingredientes WHERE id = ?',
          [ingrediente_id]
        );
        if (ingRows.length > 0) {
          const contenidoEnvase = Number(ingRows[0].contenido_envase) || 1;
          const desperdicio = Number(ingRows[0].desperdicio) || 0;
          const costoUnitario = precioPorEnvase / contenidoEnvase;
          const costoConDesperdicio = desperdicio > 0 && desperdicio < 100
            ? costoUnitario / (1 - desperdicio / 100)
            : costoUnitario;

          await conn.query(
            `UPDATE ingredientes
             SET precio1 = ?, fecha_precio = ?, costo_unitario = ?, costo_con_desperdicio = ?
             WHERE id = ?`,
            [precioPorEnvase, fecha, costoUnitario, costoConDesperdicio, ingrediente_id]
          );
          await cascadeFromIngredient(conn, ingrediente_id);
        }
      }

      await conn.commit();
      const compra = await fetchCompraConJoins(id);
      success(res, compra);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// =============================================================================
// DELETE /:id - soft delete (NO revierte la actualizacion del ingrediente,
// ya que el historico de precios no se "reversa")
// =============================================================================
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE compras SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );
    if (result.affectedRows === 0) return error(res, 'Compra no encontrada', 404);
    success(res, { message: 'Compra eliminada' });
  })
);

module.exports = router;
