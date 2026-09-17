const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// GET /items-catalogo - Get productos + ingredientes for dropdown
// MUST be before /:id routes to avoid matching "items-catalogo" as an id
router.get(
  '/items-catalogo',
  asyncHandler(async (req, res) => {
    const [items] = await pool.query(
      `SELECT id, nombre, 'producto' AS tipo FROM productos WHERE activo = 1
       UNION ALL
       SELECT id, nombre, 'ingrediente' AS tipo FROM ingredientes WHERE activo = 1
       ORDER BY nombre`
    );
    success(res, items);
  })
);

// GET / - List perdidas with filters
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { desde, hasta, item_tipo, motivo, responsable, buscar, limit: limitStr, offset: offsetStr } = req.query;

    let sql = 'SELECT * FROM perdidas WHERE 1=1';
    const params = [];

    if (desde) {
      sql += ' AND fecha >= ?';
      params.push(desde);
    }
    if (hasta) {
      sql += ' AND fecha <= ?';
      params.push(hasta);
    }
    if (item_tipo) {
      sql += ' AND item_tipo = ?';
      params.push(item_tipo);
    }
    if (motivo) {
      sql += ' AND motivo = ?';
      params.push(motivo);
    }
    if (responsable) {
      sql += ' AND responsable = ?';
      params.push(responsable);
    }
    if (buscar) {
      sql += ' AND item_nombre LIKE ?';
      params.push(`%${buscar}%`);
    }

    sql += ' ORDER BY fecha DESC, created_at DESC';

    const limit = parseInt(limitStr) || 200;
    const offset = parseInt(offsetStr) || 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.query(sql, params);

    // Total count
    let countSql = 'SELECT COUNT(*) AS total FROM perdidas WHERE 1=1';
    const countParams = [];
    if (desde) { countSql += ' AND fecha >= ?'; countParams.push(desde); }
    if (hasta) { countSql += ' AND fecha <= ?'; countParams.push(hasta); }
    if (item_tipo) { countSql += ' AND item_tipo = ?'; countParams.push(item_tipo); }
    if (motivo) { countSql += ' AND motivo = ?'; countParams.push(motivo); }
    if (responsable) { countSql += ' AND responsable = ?'; countParams.push(responsable); }
    if (buscar) { countSql += ' AND item_nombre LIKE ?'; countParams.push(`%${buscar}%`); }

    const [countRows] = await pool.query(countSql, countParams);

    res.json({ success: true, data: rows, total: countRows[0].total });
  })
);

// POST / - Create perdida
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { fecha, item_tipo, item_nombre, item_id, cantidad, unidad, motivo, responsable, descripcion } = req.body;

    if (!fecha || !item_tipo || !item_nombre) {
      return error(res, 'fecha, item_tipo e item_nombre son requeridos');
    }

    const [result] = await pool.query(
      `INSERT INTO perdidas (fecha, item_tipo, item_nombre, item_id, cantidad, unidad, motivo, responsable, descripcion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fecha, item_tipo, item_nombre, item_id || null, cantidad || 1, unidad || null, motivo || null, responsable || null, descripcion || null]
    );

    const [newRow] = await pool.query('SELECT * FROM perdidas WHERE id = ?', [result.insertId]);
    success(res, newRow[0], 201);
  })
);

// PUT /:id - Update perdida
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { fecha, item_tipo, item_nombre, item_id, cantidad, unidad, motivo, responsable, descripcion } = req.body;

    if (!fecha || !item_tipo || !item_nombre) {
      return error(res, 'fecha, item_tipo e item_nombre son requeridos');
    }

    const [result] = await pool.query(
      `UPDATE perdidas SET
        fecha = ?, item_tipo = ?, item_nombre = ?, item_id = ?, cantidad = ?,
        unidad = ?, motivo = ?, responsable = ?, descripcion = ?
       WHERE id = ?`,
      [fecha, item_tipo, item_nombre, item_id || null, cantidad || 1, unidad || null, motivo || null, responsable || null, descripcion || null, id]
    );

    if (result.affectedRows === 0) return error(res, 'Registro no encontrado', 404);

    const [updated] = await pool.query('SELECT * FROM perdidas WHERE id = ?', [id]);
    success(res, updated[0]);
  })
);

// DELETE /:id - Delete perdida
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM perdidas WHERE id = ?', [id]);
    if (result.affectedRows === 0) return error(res, 'Registro no encontrado', 404);
    success(res, { message: 'Perdida eliminada' });
  })
);

module.exports = router;
