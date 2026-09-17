const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// GET / - List active suppliers with ingredient count
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { buscar } = req.query;

    let sql = `
      SELECT p.*,
        (
          SELECT COUNT(*)
          FROM ingredientes i
          WHERE (i.proveedor1 = p.nombre OR i.proveedor2 = p.nombre)
            AND i.activo = 1
        ) AS cantidad_ingredientes
      FROM proveedores p
      WHERE p.activo = 1
    `;
    const params = [];

    if (buscar) {
      sql += ' AND p.nombre LIKE ?';
      params.push(`%${buscar}%`);
    }

    sql += ' ORDER BY p.nombre';

    const [rows] = await pool.query(sql, params);
    success(res, rows);
  })
);

// POST / - Create supplier
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nombre, telefono, email, direccion, notas } = req.body;

    if (!nombre) {
      return error(res, 'El nombre es requerido');
    }

    const [result] = await pool.query(
      `INSERT INTO proveedores (nombre, telefono, email, direccion, notas)
       VALUES (?, ?, ?, ?, ?)`,
      [nombre, telefono || null, email || null, direccion || null, notas || null]
    );

    const [newRow] = await pool.query(
      'SELECT * FROM proveedores WHERE id = ?',
      [result.insertId]
    );

    success(res, newRow[0], 201);
  })
);

// PUT /:id - Update supplier
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { nombre, telefono, email, direccion, notas } = req.body;

    if (!nombre) {
      return error(res, 'El nombre es requerido');
    }

    const [result] = await pool.query(
      `UPDATE proveedores
       SET nombre = ?, telefono = ?, email = ?, direccion = ?, notas = ?
       WHERE id = ? AND activo = 1`,
      [nombre, telefono || null, email || null, direccion || null, notas || null, id]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Proveedor no encontrado', 404);
    }

    const [updated] = await pool.query(
      'SELECT * FROM proveedores WHERE id = ?',
      [id]
    );

    success(res, updated[0]);
  })
);

// DELETE /:id - Soft delete
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [result] = await pool.query(
      'UPDATE proveedores SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Proveedor no encontrado', 404);
    }

    success(res, { message: 'Proveedor eliminado' });
  })
);

module.exports = router;
