const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { precioAR } = require('../utils/formato');

// ============================================================================
// API PUBLICA PARA EL POS (read-only, CORS abierto)
// Expone los articulos "Para venta" de la seccion Sabor y Aroma: los que
// coffit revende tal cual llegan de la distribuidora.
//
// Solo campos de venta: NUNCA costo ni margen (la API es publica).
// El precio lo define coffit en el panel; cambiarlo ahi se refleja al instante.
// ============================================================================

// GET /productos - articulos activos con precio cargado
router.get(
  '/productos',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT id, COALESCE(venta_nombre, nombre_crm) AS nombre, venta_precio, updated_at
       FROM sya_articulos
       WHERE usa_venta = 1 AND venta_activo = 1 AND venta_precio IS NOT NULL AND venta_precio > 0
       ORDER BY nombre`
    );
    res.json({
      actualizado: new Date().toISOString(),
      total: rows.length,
      productos: rows.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        precio: parseFloat(r.venta_precio) || 0,
        precio_texto: precioAR(r.venta_precio),
      })),
    });
  })
);

module.exports = router;
