const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * GET /api/costo-producto?nombre=Cafe+Latte&api_key=xxx
 *
 * Endpoint dedicado para la app externa (rentcoffit PHP).
 * Busca un producto por nombre exacto y devuelve el costo por porción.
 *
 * Response exitosa:
 *   { success: true, costo_porcion: 450.25, producto: "Cafe Latte" }
 *
 * Response error:
 *   { success: false, error: "Producto no encontrado", sugerencias: ["Cafe Latte Doble", ...] }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { nombre } = req.query;

    if (!nombre || !nombre.trim()) {
      return res.json({
        success: false,
        error: 'Parámetro "nombre" es requerido',
        sugerencias: [],
      });
    }

    const nombreTrim = nombre.trim();

    // Buscar producto por nombre exacto (case-insensitive)
    const [exactRows] = await pool.query(
      `SELECT p.id, p.nombre, p.costo_total, p.porciones
       FROM productos p
       WHERE p.activo = 1 AND p.es_borrador = 0
       AND LOWER(p.nombre) = LOWER(?)`,
      [nombreTrim]
    );

    if (exactRows.length > 0) {
      const prod = exactRows[0];
      const costoTotal = parseFloat(prod.costo_total) || 0;
      const porciones = parseInt(prod.porciones) || 1;
      const costoPorcion = costoTotal / porciones;

      return res.json({
        success: true,
        costo_porcion: Math.round(costoPorcion * 100) / 100,
        producto: prod.nombre,
      });
    }

    // No encontrado: buscar sugerencias similares (LIKE)
    const [similarRows] = await pool.query(
      `SELECT p.nombre
       FROM productos p
       WHERE p.activo = 1 AND p.es_borrador = 0
       AND p.nombre LIKE ?
       ORDER BY p.nombre
       LIMIT 5`,
      [`%${nombreTrim}%`]
    );

    return res.json({
      success: false,
      error: 'Producto no encontrado',
      sugerencias: similarRows.map((r) => r.nombre),
    });
  })
);

module.exports = router;
