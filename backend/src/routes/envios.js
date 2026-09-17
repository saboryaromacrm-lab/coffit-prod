const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// GET /catalogo - Productos (con peso, porciones, costo)
router.get(
  '/catalogo',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT
         id,
         nombre,
         CAST(porciones AS SIGNED) AS porciones,
         CAST(costo_total AS DECIMAL(12,2)) AS costo_total,
         CAST(peso_total_g AS DECIMAL(10,2)) AS peso_total_g
       FROM productos
       WHERE activo = 1 AND es_borrador = 0
       ORDER BY nombre`
    );
    success(res, rows);
  })
);

// GET /reporte - Reporte con costos y agrupaciones
// Placed before /:id to avoid route conflicts
router.get(
  '/reporte',
  asyncHandler(async (req, res) => {
    const { desde, hasta, buscar } = req.query;

    if (!desde || !hasta) {
      return error(res, 'Parametros desde y hasta son requeridos');
    }

    // Base filters
    let where = 'WHERE e.fecha >= ? AND e.fecha <= ?';
    const params = [desde, hasta];
    if (buscar) {
      where += ' AND e.producto_nombre LIKE ?';
      params.push(`%${buscar}%`);
    }

    // 1) Registros detallados con costo del producto
    const [registros] = await pool.query(
      `
      SELECT e.id, e.fecha, e.producto_id, e.producto_nombre,
        e.cantidad_enviada, e.cantidad_vencida,
        (e.cantidad_enviada - e.cantidad_vencida) AS cantidad_vendida,
        e.observacion,
        COALESCE(p.costo_total, 0) AS costo_unitario,
        (e.cantidad_enviada * COALESCE(p.costo_total, 0)) AS monto_enviado,
        (e.cantidad_vencida * COALESCE(p.costo_total, 0)) AS monto_vencido,
        ((e.cantidad_enviada - e.cantidad_vencida) * COALESCE(p.costo_total, 0)) AS monto_vendido
      FROM envios_saboryaroma e
      LEFT JOIN productos p ON p.id = e.producto_id
      ${where}
      ORDER BY e.fecha DESC, e.created_at DESC
      `,
      params
    );

    // 2) Agrupado por producto
    const [porProducto] = await pool.query(
      `
      SELECT e.producto_nombre,
        COUNT(*) AS n_envios,
        SUM(e.cantidad_enviada) AS total_enviados,
        SUM(e.cantidad_vencida) AS total_vencidos,
        SUM(e.cantidad_enviada - e.cantidad_vencida) AS total_vendidos,
        COALESCE(MAX(p.costo_total), 0) AS costo_unitario,
        SUM(e.cantidad_enviada * COALESCE(p.costo_total, 0)) AS monto_enviado,
        SUM(e.cantidad_vencida * COALESCE(p.costo_total, 0)) AS monto_vencido,
        SUM((e.cantidad_enviada - e.cantidad_vencida) * COALESCE(p.costo_total, 0)) AS monto_vendido
      FROM envios_saboryaroma e
      LEFT JOIN productos p ON p.id = e.producto_id
      ${where}
      GROUP BY e.producto_nombre
      ORDER BY monto_enviado DESC
      `,
      params
    );

    // 3) Por dia
    const [porDia] = await pool.query(
      `
      SELECT e.fecha,
        SUM(e.cantidad_enviada) AS total_enviados,
        SUM(e.cantidad_vencida) AS total_vencidos,
        SUM(e.cantidad_enviada * COALESCE(p.costo_total, 0)) AS monto_enviado,
        SUM(e.cantidad_vencida * COALESCE(p.costo_total, 0)) AS monto_vencido
      FROM envios_saboryaroma e
      LEFT JOIN productos p ON p.id = e.producto_id
      ${where}
      GROUP BY e.fecha
      ORDER BY e.fecha ASC
      `,
      params
    );

    // 4) Totales
    const [totalesRows] = await pool.query(
      `
      SELECT
        COUNT(*) AS total_envios,
        COALESCE(SUM(e.cantidad_enviada), 0) AS total_enviados,
        COALESCE(SUM(e.cantidad_vencida), 0) AS total_vencidos,
        COALESCE(SUM(e.cantidad_enviada - e.cantidad_vencida), 0) AS total_vendidos,
        COALESCE(SUM(e.cantidad_enviada * COALESCE(p.costo_total, 0)), 0) AS monto_enviado,
        COALESCE(SUM(e.cantidad_vencida * COALESCE(p.costo_total, 0)), 0) AS monto_vencido,
        COALESCE(SUM((e.cantidad_enviada - e.cantidad_vencida) * COALESCE(p.costo_total, 0)), 0) AS monto_vendido,
        COUNT(DISTINCT e.producto_nombre) AS productos_distintos
      FROM envios_saboryaroma e
      LEFT JOIN productos p ON p.id = e.producto_id
      ${where}
      `,
      params
    );

    const totales = totalesRows[0];

    // Normalizar numeros
    const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

    success(res, {
      registros: registros.map((r) => ({
        ...r,
        cantidad_enviada: round2(r.cantidad_enviada),
        cantidad_vencida: round2(r.cantidad_vencida),
        cantidad_vendida: round2(r.cantidad_vendida),
        costo_unitario: round2(r.costo_unitario),
        monto_enviado: round2(r.monto_enviado),
        monto_vencido: round2(r.monto_vencido),
        monto_vendido: round2(r.monto_vendido),
      })),
      porProducto: porProducto.map((p) => ({
        producto_nombre: p.producto_nombre,
        n_envios: Number(p.n_envios),
        total_enviados: round2(p.total_enviados),
        total_vencidos: round2(p.total_vencidos),
        total_vendidos: round2(p.total_vendidos),
        costo_unitario: round2(p.costo_unitario),
        monto_enviado: round2(p.monto_enviado),
        monto_vencido: round2(p.monto_vencido),
        monto_vendido: round2(p.monto_vendido),
      })),
      porDia: porDia.map((d) => ({
        fecha: d.fecha,
        total_enviados: round2(d.total_enviados),
        total_vencidos: round2(d.total_vencidos),
        monto_enviado: round2(d.monto_enviado),
        monto_vencido: round2(d.monto_vencido),
      })),
      totales: {
        total_envios: Number(totales.total_envios),
        total_enviados: round2(totales.total_enviados),
        total_vencidos: round2(totales.total_vencidos),
        total_vendidos: round2(totales.total_vendidos),
        monto_enviado: round2(totales.monto_enviado),
        monto_vencido: round2(totales.monto_vencido),
        monto_vendido: round2(totales.monto_vendido),
        productos_distintos: Number(totales.productos_distintos),
      },
    });
  })
);

// GET /resultados - Balance combinado entre envios Coffit -> SyA y SyA -> Coffit
// Calcula diferencia a favor/en contra usando monto_util (descontando vencidos/devueltos)
router.get(
  '/resultados',
  asyncHandler(async (req, res) => {
    const { desde, hasta } = req.query;

    if (!desde || !hasta) {
      return error(res, 'Parametros desde y hasta son requeridos');
    }

    // 1) Envios Coffit -> SyA (productos)
    const [syaRows] = await pool.query(
      `
      SELECT
        COALESCE(SUM(e.cantidad_enviada * COALESCE(p.costo_total, 0)), 0) AS monto_enviado,
        COALESCE(SUM(e.cantidad_vencida * COALESCE(p.costo_total, 0)), 0) AS monto_vencido,
        COALESCE(SUM((e.cantidad_enviada - e.cantidad_vencida) * COALESCE(p.costo_total, 0)), 0) AS monto_util,
        COALESCE(SUM(e.cantidad_enviada), 0) AS cant_enviada,
        COALESCE(SUM(e.cantidad_vencida), 0) AS cant_vencida
      FROM envios_saboryaroma e
      LEFT JOIN productos p ON p.id = e.producto_id
      WHERE e.fecha >= ? AND e.fecha <= ?
      `,
      [desde, hasta]
    );

    // 2) Envios SyA -> Coffit (ingredientes)
    const [coffitRows] = await pool.query(
      `
      SELECT
        COALESCE(SUM(e.cantidad_enviada * COALESCE(i.costo_unitario, 0)), 0) AS monto_enviado,
        COALESCE(SUM(e.cantidad_devuelta * COALESCE(i.costo_unitario, 0)), 0) AS monto_devuelto,
        COALESCE(SUM((e.cantidad_enviada - e.cantidad_devuelta) * COALESCE(i.costo_unitario, 0)), 0) AS monto_util,
        COALESCE(SUM(e.cantidad_enviada), 0) AS cant_enviada,
        COALESCE(SUM(e.cantidad_devuelta), 0) AS cant_devuelta
      FROM envios_coffit e
      LEFT JOIN ingredientes i ON i.id = e.ingrediente_id
      WHERE e.fecha >= ? AND e.fecha <= ?
      `,
      [desde, hasta]
    );

    // 3) Por dia - SyA (Coffit -> SyA)
    const [porDiaSya] = await pool.query(
      `
      SELECT e.fecha,
        COALESCE(SUM((e.cantidad_enviada - e.cantidad_vencida) * COALESCE(p.costo_total, 0)), 0) AS monto_util
      FROM envios_saboryaroma e
      LEFT JOIN productos p ON p.id = e.producto_id
      WHERE e.fecha >= ? AND e.fecha <= ?
      GROUP BY e.fecha
      `,
      [desde, hasta]
    );

    // 4) Por dia - Coffit (SyA -> Coffit)
    const [porDiaCoffit] = await pool.query(
      `
      SELECT e.fecha,
        COALESCE(SUM((e.cantidad_enviada - e.cantidad_devuelta) * COALESCE(i.costo_unitario, 0)), 0) AS monto_util
      FROM envios_coffit e
      LEFT JOIN ingredientes i ON i.id = e.ingrediente_id
      WHERE e.fecha >= ? AND e.fecha <= ?
      GROUP BY e.fecha
      `,
      [desde, hasta]
    );

    const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

    // Merge both "porDia" by date into a single timeline
    const mapaPorDia = new Map();
    porDiaSya.forEach((d) => {
      const key = typeof d.fecha === 'string' ? d.fecha.substring(0, 10) : d.fecha.toISOString().substring(0, 10);
      mapaPorDia.set(key, { fecha: key, enviado_sya: round2(d.monto_util), recibido_coffit: 0 });
    });
    porDiaCoffit.forEach((d) => {
      const key = typeof d.fecha === 'string' ? d.fecha.substring(0, 10) : d.fecha.toISOString().substring(0, 10);
      const existing = mapaPorDia.get(key);
      if (existing) {
        existing.recibido_coffit = round2(d.monto_util);
      } else {
        mapaPorDia.set(key, { fecha: key, enviado_sya: 0, recibido_coffit: round2(d.monto_util) });
      }
    });
    const porDia = Array.from(mapaPorDia.values())
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
      .map((d) => ({ ...d, balance: round2(d.enviado_sya - d.recibido_coffit) }));

    const sya = syaRows[0];
    const cof = coffitRows[0];

    const montoUtilSya = round2(sya.monto_util);
    const montoUtilCoffit = round2(cof.monto_util);
    const balance = round2(montoUtilSya - montoUtilCoffit);

    success(res, {
      enviado_a_sya: {
        monto_enviado: round2(sya.monto_enviado),
        monto_vencido: round2(sya.monto_vencido),
        monto_util: montoUtilSya,
        cant_enviada: round2(sya.cant_enviada),
        cant_vencida: round2(sya.cant_vencida),
      },
      recibido_de_sya: {
        monto_enviado: round2(cof.monto_enviado),
        monto_devuelto: round2(cof.monto_devuelto),
        monto_util: montoUtilCoffit,
        cant_enviada: round2(cof.cant_enviada),
        cant_devuelta: round2(cof.cant_devuelta),
      },
      balance,
      a_favor: balance > 0, // true = SyA me debe, false = yo le debo a SyA
      porDia,
    });
  })
);

// GET / - List envios with filters
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { desde, hasta, buscar, solo_vencidos, limit: limitStr, offset: offsetStr } = req.query;

    let sql = `
      SELECT id, fecha, producto_id, producto_nombre,
        cantidad_enviada, cantidad_vencida,
        (cantidad_enviada - cantidad_vencida) AS cantidad_vendida,
        observacion, created_at, updated_at
      FROM envios_saboryaroma
      WHERE 1=1
    `;
    const params = [];

    if (desde) {
      sql += ' AND fecha >= ?';
      params.push(desde);
    }
    if (hasta) {
      sql += ' AND fecha <= ?';
      params.push(hasta);
    }
    if (buscar) {
      sql += ' AND producto_nombre LIKE ?';
      params.push(`%${buscar}%`);
    }
    if (solo_vencidos === '1' || solo_vencidos === 'true') {
      sql += ' AND cantidad_vencida > 0';
    }

    sql += ' ORDER BY fecha DESC, created_at DESC';

    const limit = parseInt(limitStr) || 500;
    const offset = parseInt(offsetStr) || 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.query(sql, params);

    // Total count
    let countSql = 'SELECT COUNT(*) AS total FROM envios_saboryaroma WHERE 1=1';
    const countParams = [];
    if (desde) { countSql += ' AND fecha >= ?'; countParams.push(desde); }
    if (hasta) { countSql += ' AND fecha <= ?'; countParams.push(hasta); }
    if (buscar) { countSql += ' AND producto_nombre LIKE ?'; countParams.push(`%${buscar}%`); }
    if (solo_vencidos === '1' || solo_vencidos === 'true') { countSql += ' AND cantidad_vencida > 0'; }

    const [countRows] = await pool.query(countSql, countParams);

    res.json({ success: true, data: rows, total: countRows[0].total });
  })
);

// POST /batch - Insertar multiples envios en una transaccion
router.post(
  '/batch',
  asyncHandler(async (req, res) => {
    const { envios } = req.body;

    if (!Array.isArray(envios) || envios.length === 0) {
      return error(res, 'Se requiere al menos 1 envio');
    }

    for (const e of envios) {
      if (!e.fecha || !e.producto_nombre) {
        return error(res, 'Cada envio debe tener fecha y producto_nombre');
      }
      const cant = parseFloat(e.cantidad_enviada);
      if (isNaN(cant) || cant <= 0) {
        return error(res, `cantidad_enviada invalida en "${e.producto_nombre}"`);
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const insertedIds = [];

      for (const e of envios) {
        const [result] = await conn.query(
          `INSERT INTO envios_saboryaroma
            (fecha, producto_id, producto_nombre, cantidad_enviada, cantidad_vencida, observacion)
           VALUES (?, ?, ?, ?, 0, ?)`,
          [
            e.fecha,
            e.producto_id || null,
            e.producto_nombre,
            parseFloat(e.cantidad_enviada),
            e.observacion || null,
          ]
        );
        insertedIds.push(result.insertId);
      }

      await conn.commit();

      if (insertedIds.length > 0) {
        const placeholders = insertedIds.map(() => '?').join(',');
        const [rows] = await pool.query(
          `SELECT id, fecha, producto_id, producto_nombre,
            cantidad_enviada, cantidad_vencida,
            (cantidad_enviada - cantidad_vencida) AS cantidad_vendida,
            observacion, created_at, updated_at
           FROM envios_saboryaroma
           WHERE id IN (${placeholders})
           ORDER BY id`,
          insertedIds
        );
        success(res, rows, 201);
      } else {
        success(res, [], 201);
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// POST / - Create envio (individual, compatibilidad)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { fecha, producto_id, producto_nombre, cantidad_enviada, observacion } = req.body;

    if (!fecha || !producto_nombre) {
      return error(res, 'fecha y producto_nombre son requeridos');
    }
    const enviada = parseFloat(cantidad_enviada);
    if (isNaN(enviada) || enviada <= 0) {
      return error(res, 'cantidad_enviada debe ser mayor a 0');
    }

    const [result] = await pool.query(
      `INSERT INTO envios_saboryaroma
        (fecha, producto_id, producto_nombre, cantidad_enviada, cantidad_vencida, observacion)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [fecha, producto_id || null, producto_nombre, enviada, observacion || null]
    );

    const [newRow] = await pool.query(
      `SELECT id, fecha, producto_id, producto_nombre,
        cantidad_enviada, cantidad_vencida,
        (cantidad_enviada - cantidad_vencida) AS cantidad_vendida,
        observacion, created_at, updated_at
       FROM envios_saboryaroma WHERE id = ?`,
      [result.insertId]
    );
    success(res, newRow[0], 201);
  })
);

// PUT /:id - Full update
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { fecha, producto_id, producto_nombre, cantidad_enviada, cantidad_vencida, observacion } = req.body;

    if (!fecha || !producto_nombre) {
      return error(res, 'fecha y producto_nombre son requeridos');
    }
    const enviada = parseFloat(cantidad_enviada);
    const vencida = parseFloat(cantidad_vencida) || 0;
    if (isNaN(enviada) || enviada <= 0) {
      return error(res, 'cantidad_enviada debe ser mayor a 0');
    }
    if (vencida < 0) {
      return error(res, 'cantidad_vencida no puede ser negativa');
    }
    if (vencida > enviada) {
      return error(res, 'cantidad_vencida no puede ser mayor a cantidad_enviada');
    }

    const [result] = await pool.query(
      `UPDATE envios_saboryaroma SET
        fecha = ?, producto_id = ?, producto_nombre = ?,
        cantidad_enviada = ?, cantidad_vencida = ?, observacion = ?
       WHERE id = ?`,
      [fecha, producto_id || null, producto_nombre, enviada, vencida, observacion || null, id]
    );

    if (result.affectedRows === 0) return error(res, 'Envio no encontrado', 404);

    const [updated] = await pool.query(
      `SELECT id, fecha, producto_id, producto_nombre,
        cantidad_enviada, cantidad_vencida,
        (cantidad_enviada - cantidad_vencida) AS cantidad_vendida,
        observacion, created_at, updated_at
       FROM envios_saboryaroma WHERE id = ?`,
      [id]
    );
    success(res, updated[0]);
  })
);

// PATCH /:id/vencidos - Update only cantidad_vencida (for inline table edit)
router.patch(
  '/:id/vencidos',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { cantidad_vencida } = req.body;

    const vencida = parseFloat(cantidad_vencida);
    if (isNaN(vencida) || vencida < 0) {
      return error(res, 'cantidad_vencida debe ser >= 0');
    }

    // Validar que no sea mayor que cantidad_enviada
    const [currentRows] = await pool.query(
      'SELECT cantidad_enviada FROM envios_saboryaroma WHERE id = ?',
      [id]
    );
    if (currentRows.length === 0) return error(res, 'Envio no encontrado', 404);
    if (vencida > Number(currentRows[0].cantidad_enviada)) {
      return error(res, 'cantidad_vencida no puede ser mayor que cantidad_enviada');
    }

    await pool.query(
      'UPDATE envios_saboryaroma SET cantidad_vencida = ? WHERE id = ?',
      [vencida, id]
    );

    const [updated] = await pool.query(
      `SELECT id, fecha, producto_id, producto_nombre,
        cantidad_enviada, cantidad_vencida,
        (cantidad_enviada - cantidad_vencida) AS cantidad_vendida,
        observacion, created_at, updated_at
       FROM envios_saboryaroma WHERE id = ?`,
      [id]
    );
    success(res, updated[0]);
  })
);

// DELETE /:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM envios_saboryaroma WHERE id = ?', [id]);
    if (result.affectedRows === 0) return error(res, 'Envio no encontrado', 404);
    success(res, { message: 'Envio eliminado' });
  })
);

module.exports = router;
