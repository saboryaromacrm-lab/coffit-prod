const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');

// GET /api/costos-productos
// Devuelve todos los productos con costo cargado (costo_total > 0)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT nombre, costo_total AS costo, updated_at
       FROM productos
       WHERE activo = 1 AND es_borrador = 0 AND costo_total > 0
       ORDER BY nombre`
    );

    const productos = rows.map((r) => ({
      nombre: r.nombre,
      costo: Math.round(parseFloat(r.costo) * 100) / 100,
    }));

    // Timestamp de ultima actualizacion (el mas reciente)
    let actualizado = null;
    if (rows.length > 0) {
      const fechas = rows.map((r) => new Date(r.updated_at)).filter((d) => !isNaN(d));
      if (fechas.length > 0) {
        actualizado = new Date(Math.max(...fechas)).toISOString().replace('Z', '').split('.')[0];
      }
    }

    res.json({
      productos,
      total: productos.length,
      actualizado,
    });
  })
);

module.exports = router;
