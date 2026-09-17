const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success } = require('../utils/response');
const { calcularRentabilidades } = require('../utils/mcNeto');

// GET / - Dashboard data
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Counters
    const [[{ count: ingredientes }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM ingredientes WHERE activo = 1'
    );
    const [[{ count: subrecetas }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM subrecetas WHERE activo = 1'
    );
    const [[{ count: productos }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM productos WHERE activo = 1'
    );
    const [[{ count: categorias }]] = await pool.query(
      // Solo raices: las subcategorias no son categorias nuevas
      'SELECT COUNT(*) AS count FROM categorias_productos WHERE activo = 1 AND parent_id IS NULL'
    );

    // Config
    const [configRows] = await pool.query('SELECT clave, valor FROM configuracion');
    const config = {};
    for (const row of configRows) config[row.clave] = row.valor;

    // Units
    const [unidades] = await pool.query(
      'SELECT id, nombre, abreviatura FROM unidades WHERE activo = 1'
    );

    // Ingredient categories
    const [catIngredientes] = await pool.query(
      'SELECT DISTINCT categoria AS nombre FROM ingredientes WHERE activo = 1 AND categoria IS NOT NULL ORDER BY categoria'
    );

    // Products with low margin (MC < 25% in any channel)
    const [allProducts] = await pool.query(
      `SELECT p.id, p.nombre, p.precio_publico, p.precio_pedidosya, p.costo_total
       FROM productos p WHERE p.activo = 1 AND p.es_borrador = 0`
    );

    // Build resumen_canales
    const channelKeys = ['tarjeta', 'efectivo', 'pedidosya'];
    const resumenCanales = {};

    for (const key of channelKeys) {
      const [channelRows] = await pool.query(
        'SELECT * FROM canales_venta WHERE codigo = ? AND activo = 1',
        [key]
      );
      if (channelRows.length === 0) {
        resumenCanales[key] = { nombre: key, icono: null, conceptos: [] };
        continue;
      }
      const channel = channelRows[0];
      const [linked] = await pool.query(
        `SELECT cc.porcentaje_override, c.*
         FROM conceptos_canales cc
         JOIN conceptos_costo c ON c.id = cc.concepto_id
         WHERE cc.canal_id = ? AND c.activo = 1`,
        [channel.id]
      );
      resumenCanales[key] = {
        nombre: channel.nombre,
        icono: channel.icono,
        conceptos: linked.map((lc) => ({
          id: lc.id,
          nombre: lc.nombre,
          tipo: lc.tipo,
          valor: lc.porcentaje_override !== null ? parseFloat(lc.porcentaje_override) : parseFloat(lc.porcentaje),
        })),
      };
    }

    const productosBajoMargen = [];
    for (const prod of allProducts) {
      const rent = calcularRentabilidades(prod, resumenCanales);
      const minMC = Math.min(
        rent.local_tarjeta.mc_neto,
        rent.local_efectivo.mc_neto,
        rent.pedidosya.mc_neto
      );
      if (minMC < 25) {
        productosBajoMargen.push({
          id: prod.id,
          nombre: prod.nombre,
          mc_min: Math.round(minMC * 10) / 10,
        });
      }
    }

    // Ingredients without supplier
    const [sinProveedor] = await pool.query(
      `SELECT id, nombre FROM ingredientes
       WHERE activo = 1 AND (proveedor1 IS NULL OR proveedor1 = '')
       ORDER BY nombre LIMIT 20`
    );

    success(res, {
      ingredientes,
      subrecetas,
      productos,
      categorias,
      config,
      unidades,
      categorias_ingredientes: catIngredientes,
      productos_bajo_margen: productosBajoMargen,
      ingredientes_sin_proveedor: sinProveedor,
    });
  })
);

module.exports = router;
