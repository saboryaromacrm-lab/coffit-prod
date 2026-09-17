const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// GET /catalogo - Ingredientes activos (con unidad, envase y costo)
router.get(
  '/catalogo',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT
         i.id,
         i.nombre,
         COALESCE(u.abreviatura, 'g') AS unidad,
         CAST(i.contenido_envase AS DECIMAL(10,2)) AS contenido_envase,
         CAST(i.costo_unitario AS DECIMAL(12,4)) AS costo_unitario
       FROM ingredientes i
       LEFT JOIN unidades u ON u.id = i.unidad_id
       WHERE i.activo = 1
       ORDER BY i.nombre`
    );
    success(res, rows);
  })
);

// GET /reporte - Reporte con costos y agrupaciones
router.get(
  '/reporte',
  asyncHandler(async (req, res) => {
    const { desde, hasta, buscar } = req.query;

    if (!desde || !hasta) {
      return error(res, 'Parametros desde y hasta son requeridos');
    }

    let where = 'WHERE e.fecha >= ? AND e.fecha <= ?';
    const params = [desde, hasta];
    if (buscar) {
      where += ' AND e.ingrediente_nombre LIKE ?';
      params.push(`%${buscar}%`);
    }

    // 1) Registros detallados con costo del ingrediente
    const [registros] = await pool.query(
      `
      SELECT e.id, e.fecha, e.ingrediente_id, e.ingrediente_nombre,
        e.cantidad_enviada, e.cantidad_devuelta,
        (e.cantidad_enviada - e.cantidad_devuelta) AS cantidad_util,
        e.observacion,
        COALESCE(i.costo_unitario, 0) AS costo_unitario,
        (e.cantidad_enviada * COALESCE(i.costo_unitario, 0)) AS monto_enviado,
        (e.cantidad_devuelta * COALESCE(i.costo_unitario, 0)) AS monto_devuelto,
        ((e.cantidad_enviada - e.cantidad_devuelta) * COALESCE(i.costo_unitario, 0)) AS monto_util
      FROM envios_coffit e
      LEFT JOIN ingredientes i ON i.id = e.ingrediente_id
      ${where}
      ORDER BY e.fecha DESC, e.created_at DESC
      `,
      params
    );

    // 2) Agrupado por ingrediente
    const [porIngrediente] = await pool.query(
      `
      SELECT e.ingrediente_nombre,
        COUNT(*) AS n_envios,
        SUM(e.cantidad_enviada) AS total_enviados,
        SUM(e.cantidad_devuelta) AS total_devueltos,
        SUM(e.cantidad_enviada - e.cantidad_devuelta) AS total_utiles,
        COALESCE(MAX(i.costo_unitario), 0) AS costo_unitario,
        SUM(e.cantidad_enviada * COALESCE(i.costo_unitario, 0)) AS monto_enviado,
        SUM(e.cantidad_devuelta * COALESCE(i.costo_unitario, 0)) AS monto_devuelto,
        SUM((e.cantidad_enviada - e.cantidad_devuelta) * COALESCE(i.costo_unitario, 0)) AS monto_util
      FROM envios_coffit e
      LEFT JOIN ingredientes i ON i.id = e.ingrediente_id
      ${where}
      GROUP BY e.ingrediente_nombre
      ORDER BY monto_enviado DESC
      `,
      params
    );

    // 3) Por dia
    const [porDia] = await pool.query(
      `
      SELECT e.fecha,
        SUM(e.cantidad_enviada) AS total_enviados,
        SUM(e.cantidad_devuelta) AS total_devueltos,
        SUM(e.cantidad_enviada * COALESCE(i.costo_unitario, 0)) AS monto_enviado,
        SUM(e.cantidad_devuelta * COALESCE(i.costo_unitario, 0)) AS monto_devuelto
      FROM envios_coffit e
      LEFT JOIN ingredientes i ON i.id = e.ingrediente_id
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
        COALESCE(SUM(e.cantidad_devuelta), 0) AS total_devueltos,
        COALESCE(SUM(e.cantidad_enviada - e.cantidad_devuelta), 0) AS total_utiles,
        COALESCE(SUM(e.cantidad_enviada * COALESCE(i.costo_unitario, 0)), 0) AS monto_enviado,
        COALESCE(SUM(e.cantidad_devuelta * COALESCE(i.costo_unitario, 0)), 0) AS monto_devuelto,
        COALESCE(SUM((e.cantidad_enviada - e.cantidad_devuelta) * COALESCE(i.costo_unitario, 0)), 0) AS monto_util,
        COUNT(DISTINCT e.ingrediente_nombre) AS ingredientes_distintos
      FROM envios_coffit e
      LEFT JOIN ingredientes i ON i.id = e.ingrediente_id
      ${where}
      `,
      params
    );

    const totales = totalesRows[0];
    const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

    success(res, {
      registros: registros.map((r) => ({
        ...r,
        cantidad_enviada: round2(r.cantidad_enviada),
        cantidad_devuelta: round2(r.cantidad_devuelta),
        cantidad_util: round2(r.cantidad_util),
        costo_unitario: round2(r.costo_unitario),
        monto_enviado: round2(r.monto_enviado),
        monto_devuelto: round2(r.monto_devuelto),
        monto_util: round2(r.monto_util),
      })),
      porIngrediente: porIngrediente.map((p) => ({
        ingrediente_nombre: p.ingrediente_nombre,
        n_envios: Number(p.n_envios),
        total_enviados: round2(p.total_enviados),
        total_devueltos: round2(p.total_devueltos),
        total_utiles: round2(p.total_utiles),
        costo_unitario: round2(p.costo_unitario),
        monto_enviado: round2(p.monto_enviado),
        monto_devuelto: round2(p.monto_devuelto),
        monto_util: round2(p.monto_util),
      })),
      porDia: porDia.map((d) => ({
        fecha: d.fecha,
        total_enviados: round2(d.total_enviados),
        total_devueltos: round2(d.total_devueltos),
        monto_enviado: round2(d.monto_enviado),
        monto_devuelto: round2(d.monto_devuelto),
      })),
      totales: {
        total_envios: Number(totales.total_envios),
        total_enviados: round2(totales.total_enviados),
        total_devueltos: round2(totales.total_devueltos),
        total_utiles: round2(totales.total_utiles),
        monto_enviado: round2(totales.monto_enviado),
        monto_devuelto: round2(totales.monto_devuelto),
        monto_util: round2(totales.monto_util),
        ingredientes_distintos: Number(totales.ingredientes_distintos),
      },
    });
  })
);

// GET / - Lista con filtros
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { desde, hasta, buscar, solo_devueltos, limit: limitStr, offset: offsetStr } = req.query;

    let sql = `
      SELECT id, fecha, ingrediente_id, ingrediente_nombre,
        cantidad_enviada, cantidad_envases, contenido_envase, unidad_base,
        cantidad_devuelta,
        (cantidad_enviada - cantidad_devuelta) AS cantidad_util,
        observacion, created_at, updated_at
      FROM envios_coffit
      WHERE 1=1
    `;
    const params = [];

    if (desde) { sql += ' AND fecha >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND fecha <= ?'; params.push(hasta); }
    if (buscar) { sql += ' AND ingrediente_nombre LIKE ?'; params.push(`%${buscar}%`); }
    if (solo_devueltos === '1' || solo_devueltos === 'true') {
      sql += ' AND cantidad_devuelta > 0';
    }

    sql += ' ORDER BY fecha DESC, created_at DESC';

    const limit = parseInt(limitStr) || 500;
    const offset = parseInt(offsetStr) || 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.query(sql, params);

    let countSql = 'SELECT COUNT(*) AS total FROM envios_coffit WHERE 1=1';
    const countParams = [];
    if (desde) { countSql += ' AND fecha >= ?'; countParams.push(desde); }
    if (hasta) { countSql += ' AND fecha <= ?'; countParams.push(hasta); }
    if (buscar) { countSql += ' AND ingrediente_nombre LIKE ?'; countParams.push(`%${buscar}%`); }
    if (solo_devueltos === '1' || solo_devueltos === 'true') { countSql += ' AND cantidad_devuelta > 0'; }

    const [countRows] = await pool.query(countSql, countParams);
    res.json({ success: true, data: rows, total: countRows[0].total });
  })
);

// POST /batch - Insertar multiples envios en una transaccion
//
// Cada item puede venir cargado de 2 formas:
//   - Modo "unidad base" (default): solo cantidad_enviada (ej: 8000 g)
//   - Modo "envase": cantidad_envases + contenido_envase. El backend calcula
//     cantidad_enviada = cantidad_envases * contenido_envase y guarda los 3 valores.
//     Esto permite mostrar "2 envases (8000 g)" en el historial.
router.post(
  '/batch',
  asyncHandler(async (req, res) => {
    const { envios } = req.body;

    if (!Array.isArray(envios) || envios.length === 0) {
      return error(res, 'Se requiere al menos 1 envio');
    }

    // Normalizar y validar cada item antes de abrir transaccion
    const items = [];
    for (const e of envios) {
      if (!e.fecha || !e.ingrediente_nombre) {
        return error(res, 'Cada envio debe tener fecha e ingrediente_nombre');
      }

      let cantidadEnviada;
      let cantidadEnvases = null;
      let contenidoEnvase = null;
      const unidadBase = e.unidad_base ? String(e.unidad_base) : null;

      if (e.cantidad_envases != null && e.contenido_envase != null) {
        // Modo envase
        const ce = parseFloat(e.cantidad_envases);
        const ct = parseFloat(e.contenido_envase);
        if (isNaN(ce) || ce <= 0) {
          return error(res, `cantidad_envases invalida en "${e.ingrediente_nombre}"`);
        }
        if (isNaN(ct) || ct <= 0) {
          return error(res, `contenido_envase invalido en "${e.ingrediente_nombre}"`);
        }
        cantidadEnvases = ce;
        contenidoEnvase = ct;
        cantidadEnviada = ce * ct;
      } else {
        // Modo unidad base
        cantidadEnviada = parseFloat(e.cantidad_enviada);
        if (isNaN(cantidadEnviada) || cantidadEnviada <= 0) {
          return error(res, `cantidad_enviada invalida en "${e.ingrediente_nombre}"`);
        }
      }

      items.push({
        fecha: e.fecha,
        ingrediente_id: e.ingrediente_id || null,
        ingrediente_nombre: e.ingrediente_nombre,
        cantidad_enviada: cantidadEnviada,
        cantidad_envases: cantidadEnvases,
        contenido_envase: contenidoEnvase,
        unidad_base: unidadBase,
        observacion: e.observacion || null,
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const insertedIds = [];

      for (const it of items) {
        const [result] = await conn.query(
          `INSERT INTO envios_coffit
            (fecha, ingrediente_id, ingrediente_nombre,
             cantidad_enviada, cantidad_envases, contenido_envase, unidad_base,
             cantidad_devuelta, observacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            it.fecha,
            it.ingrediente_id,
            it.ingrediente_nombre,
            it.cantidad_enviada,
            it.cantidad_envases,
            it.contenido_envase,
            it.unidad_base,
            it.observacion,
          ]
        );
        insertedIds.push(result.insertId);
      }

      await conn.commit();

      if (insertedIds.length > 0) {
        const placeholders = insertedIds.map(() => '?').join(',');
        const [rows] = await pool.query(
          `SELECT id, fecha, ingrediente_id, ingrediente_nombre,
            cantidad_enviada, cantidad_envases, contenido_envase, unidad_base,
            cantidad_devuelta,
            (cantidad_enviada - cantidad_devuelta) AS cantidad_util,
            observacion, created_at, updated_at
           FROM envios_coffit
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

// POST / - Create envio (individual)
// Soporta carga por unidad base O por envase (igual que /batch).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      fecha, ingrediente_id, ingrediente_nombre, cantidad_enviada, observacion,
      cantidad_envases, contenido_envase, unidad_base,
    } = req.body;

    if (!fecha || !ingrediente_nombre) {
      return error(res, 'fecha y ingrediente_nombre son requeridos');
    }

    let enviada;
    let cantEnvases = null;
    let contEnvase = null;
    if (cantidad_envases != null && contenido_envase != null) {
      const ce = parseFloat(cantidad_envases);
      const ct = parseFloat(contenido_envase);
      if (isNaN(ce) || ce <= 0) return error(res, 'cantidad_envases debe ser mayor a 0');
      if (isNaN(ct) || ct <= 0) return error(res, 'contenido_envase debe ser mayor a 0');
      cantEnvases = ce;
      contEnvase = ct;
      enviada = ce * ct;
    } else {
      enviada = parseFloat(cantidad_enviada);
      if (isNaN(enviada) || enviada <= 0) {
        return error(res, 'cantidad_enviada debe ser mayor a 0');
      }
    }

    const [result] = await pool.query(
      `INSERT INTO envios_coffit
        (fecha, ingrediente_id, ingrediente_nombre,
         cantidad_enviada, cantidad_envases, contenido_envase, unidad_base,
         cantidad_devuelta, observacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        fecha,
        ingrediente_id || null,
        ingrediente_nombre,
        enviada,
        cantEnvases,
        contEnvase,
        unidad_base || null,
        observacion || null,
      ]
    );

    const [newRow] = await pool.query(
      `SELECT id, fecha, ingrediente_id, ingrediente_nombre,
        cantidad_enviada, cantidad_envases, contenido_envase, unidad_base,
        cantidad_devuelta,
        (cantidad_enviada - cantidad_devuelta) AS cantidad_util,
        observacion, created_at, updated_at
       FROM envios_coffit WHERE id = ?`,
      [result.insertId]
    );
    success(res, newRow[0], 201);
  })
);

// PUT /:id - Full update
//
// Soporta editar tambien el modo de carga (envase / unidad base).
// Si se mandan cantidad_envases + contenido_envase:
//   -> guarda como envase y calcula cantidad_enviada = ce * ct
// Si no:
//   -> usa cantidad_enviada tal cual (unidad base) y limpia los campos de envase
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      fecha, ingrediente_id, ingrediente_nombre,
      cantidad_enviada, cantidad_devuelta, observacion,
      cantidad_envases, contenido_envase, unidad_base,
    } = req.body;

    if (!fecha || !ingrediente_nombre) {
      return error(res, 'fecha y ingrediente_nombre son requeridos');
    }

    // Resolver cantidad enviada (modo envase tiene prioridad si vienen ambos)
    let enviada;
    let cantEnvases = null;
    let contEnvase = null;
    let uBase = null;
    if (cantidad_envases != null && contenido_envase != null) {
      const ce = parseFloat(cantidad_envases);
      const ct = parseFloat(contenido_envase);
      if (isNaN(ce) || ce <= 0) return error(res, 'cantidad_envases debe ser mayor a 0');
      if (isNaN(ct) || ct <= 0) return error(res, 'contenido_envase debe ser mayor a 0');
      cantEnvases = ce;
      contEnvase = ct;
      uBase = unidad_base ? String(unidad_base) : null;
      enviada = ce * ct;
    } else {
      enviada = parseFloat(cantidad_enviada);
      if (isNaN(enviada) || enviada <= 0) {
        return error(res, 'cantidad_enviada debe ser mayor a 0');
      }
    }

    const devuelta = parseFloat(cantidad_devuelta) || 0;
    if (devuelta < 0) return error(res, 'cantidad_devuelta no puede ser negativa');
    if (devuelta > enviada) {
      return error(res, 'cantidad_devuelta no puede ser mayor a cantidad_enviada');
    }

    const [result] = await pool.query(
      `UPDATE envios_coffit SET
        fecha = ?, ingrediente_id = ?, ingrediente_nombre = ?,
        cantidad_enviada = ?, cantidad_envases = ?, contenido_envase = ?, unidad_base = ?,
        cantidad_devuelta = ?, observacion = ?
       WHERE id = ?`,
      [
        fecha,
        ingrediente_id || null,
        ingrediente_nombre,
        enviada,
        cantEnvases,
        contEnvase,
        uBase,
        devuelta,
        observacion || null,
        id,
      ]
    );
    if (result.affectedRows === 0) return error(res, 'Envio no encontrado', 404);

    const [updated] = await pool.query(
      `SELECT id, fecha, ingrediente_id, ingrediente_nombre,
        cantidad_enviada, cantidad_envases, contenido_envase, unidad_base,
        cantidad_devuelta,
        (cantidad_enviada - cantidad_devuelta) AS cantidad_util,
        observacion, created_at, updated_at
       FROM envios_coffit WHERE id = ?`,
      [id]
    );
    success(res, updated[0]);
  })
);

// PATCH /:id/devueltos - Update only cantidad_devuelta (inline edit)
router.patch(
  '/:id/devueltos',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { cantidad_devuelta } = req.body;

    const devuelta = parseFloat(cantidad_devuelta);
    if (isNaN(devuelta) || devuelta < 0) {
      return error(res, 'cantidad_devuelta debe ser >= 0');
    }

    const [currentRows] = await pool.query(
      'SELECT cantidad_enviada FROM envios_coffit WHERE id = ?',
      [id]
    );
    if (currentRows.length === 0) return error(res, 'Envio no encontrado', 404);
    if (devuelta > Number(currentRows[0].cantidad_enviada)) {
      return error(res, 'cantidad_devuelta no puede ser mayor que cantidad_enviada');
    }

    await pool.query(
      'UPDATE envios_coffit SET cantidad_devuelta = ? WHERE id = ?',
      [devuelta, id]
    );

    const [updated] = await pool.query(
      `SELECT id, fecha, ingrediente_id, ingrediente_nombre,
        cantidad_enviada, cantidad_envases, contenido_envase, unidad_base,
        cantidad_devuelta,
        (cantidad_enviada - cantidad_devuelta) AS cantidad_util,
        observacion, created_at, updated_at
       FROM envios_coffit WHERE id = ?`,
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
    const [result] = await pool.query('DELETE FROM envios_coffit WHERE id = ?', [id]);
    if (result.affectedRows === 0) return error(res, 'Envio no encontrado', 404);
    success(res, { message: 'Envio eliminado' });
  })
);

module.exports = router;
