const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');

// GET / - Public ingredient list (for external integrations)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT i.id, i.nombre,
              COALESCE(u.abreviatura, 'g') AS unidad,
              ROUND(i.costo_con_desperdicio, 2) AS costo,
              i.categoria
       FROM ingredientes i
       LEFT JOIN unidades u ON i.unidad_id = u.id
       WHERE i.activo = 1
       ORDER BY i.nombre ASC`
    );

    res.json(rows);
  })
);

module.exports = router;
