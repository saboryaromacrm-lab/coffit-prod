const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// GET / - lista conceptos activos
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT id, nombre, color, activo FROM conceptos_compra WHERE activo = 1 ORDER BY nombre'
    );
    success(res, rows);
  })
);

// POST / - crear concepto
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nombre, color } = req.body;
    if (!nombre || !String(nombre).trim()) return error(res, 'Nombre es requerido');

    const [result] = await pool.query(
      'INSERT INTO conceptos_compra (nombre, color) VALUES (?, ?)',
      [String(nombre).trim(), color || '#666666']
    );
    const [row] = await pool.query('SELECT * FROM conceptos_compra WHERE id = ?', [result.insertId]);
    success(res, row[0], 201);
  })
);

// PUT /:id - actualizar concepto
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { nombre, color } = req.body;
    if (!nombre || !String(nombre).trim()) return error(res, 'Nombre es requerido');

    const [result] = await pool.query(
      'UPDATE conceptos_compra SET nombre = ?, color = ? WHERE id = ? AND activo = 1',
      [String(nombre).trim(), color || '#666666', id]
    );
    if (result.affectedRows === 0) return error(res, 'Concepto no encontrado', 404);
    const [row] = await pool.query('SELECT * FROM conceptos_compra WHERE id = ?', [id]);
    success(res, row[0]);
  })
);

// DELETE /:id - soft delete
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE conceptos_compra SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );
    if (result.affectedRows === 0) return error(res, 'Concepto no encontrado', 404);
    success(res, { message: 'Concepto eliminado' });
  })
);

module.exports = router;
