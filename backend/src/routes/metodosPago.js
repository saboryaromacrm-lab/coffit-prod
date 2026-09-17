const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT id, nombre, activo FROM metodos_pago WHERE activo = 1 ORDER BY nombre'
    );
    success(res, rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nombre } = req.body;
    if (!nombre || !String(nombre).trim()) return error(res, 'Nombre es requerido');

    const [result] = await pool.query(
      'INSERT INTO metodos_pago (nombre) VALUES (?)',
      [String(nombre).trim()]
    );
    const [row] = await pool.query('SELECT * FROM metodos_pago WHERE id = ?', [result.insertId]);
    success(res, row[0], 201);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { nombre } = req.body;
    if (!nombre || !String(nombre).trim()) return error(res, 'Nombre es requerido');

    const [result] = await pool.query(
      'UPDATE metodos_pago SET nombre = ? WHERE id = ? AND activo = 1',
      [String(nombre).trim(), id]
    );
    if (result.affectedRows === 0) return error(res, 'Metodo de pago no encontrado', 404);
    const [row] = await pool.query('SELECT * FROM metodos_pago WHERE id = ?', [id]);
    success(res, row[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE metodos_pago SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );
    if (result.affectedRows === 0) return error(res, 'Metodo de pago no encontrado', 404);
    success(res, { message: 'Metodo de pago eliminado' });
  })
);

module.exports = router;
