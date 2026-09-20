const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');
const { JOIN_CATEGORIAS, COLS_CATEGORIA, FILTRO_CATEGORIA } = require('../utils/categoriaSql');

// GET / - List products or subrecetas for selection
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { tipo, categoria_id } = req.query;

    if (tipo === 'subrecetas') {
      const [rows] = await pool.query(
        `SELECT s.id, s.nombre, s.notas,
                (s.notas IS NOT NULL AND s.notas != '') AS tiene_preparacion
         FROM subrecetas s
         WHERE s.activo = 1
         ORDER BY s.nombre`
      );
      return success(res, rows);
    }

    // Default: productos
    let sql = `
      SELECT p.id, p.nombre, p.porciones, ${COLS_CATEGORIA},
             (p.preparacion IS NOT NULL AND p.preparacion != '') AS tiene_preparacion
      FROM productos p
      ${JOIN_CATEGORIAS('p')}
      WHERE p.activo = 1
    `;
    const params = [];

    // Una RAIZ incluye a sus subcategorias; una SUBCATEGORIA trae solo esa.
    if (categoria_id) {
      sql += ` AND ${FILTRO_CATEGORIA('p')}`;
      params.push(categoria_id, categoria_id);
    }

    sql += ' ORDER BY p.nombre';

    const [rows] = await pool.query(sql, params);

    // Categorias para el filtro (jerarquia incluida: el front indenta las hijas)
    const [cats] = await pool.query(
      `SELECT c.id, c.nombre, c.icono, c.parent_id, pa.nombre AS parent_nombre
       FROM categorias_productos c
       LEFT JOIN categorias_productos pa ON pa.id = c.parent_id AND pa.activo = 1
       WHERE c.activo = 1
       ORDER BY COALESCE(pa.orden, c.orden), COALESCE(pa.nombre, c.nombre),
                (c.parent_id IS NOT NULL), c.orden, c.nombre`
    );

    success(res, { recetas: rows, categorias: cats });
  })
);

// GET /:tipo/:id - Get full preparation detail
router.get(
  '/:tipo/:id',
  asyncHandler(async (req, res) => {
    const { tipo, id } = req.params;

    if (tipo === 'subreceta') {
      const [rows] = await pool.query(
        'SELECT id, nombre, rendimiento_gramos, tipo_rendimiento, notas FROM subrecetas WHERE id = ? AND activo = 1',
        [id]
      );
      if (rows.length === 0) return error(res, 'Subreceta no encontrada', 404);

      const subreceta = rows[0];

      // Get ingredients with real unit from ingredientes table
      const [ings] = await pool.query(
        `SELECT si.cantidad,
                COALESCE(u.abreviatura, si.unidad, 'g') AS unidad,
                i.nombre, 0 AS es_subreceta
         FROM subreceta_ingredientes si
         JOIN ingredientes i ON si.ingrediente_id = i.id
         LEFT JOIN unidades u ON i.unidad_id = u.id
         WHERE si.subreceta_id = ?`,
        [id]
      );

      success(res, {
        id: subreceta.id,
        nombre: subreceta.nombre,
        porciones: subreceta.tipo_rendimiento === 'porciones' ? subreceta.rendimiento_gramos : null,
        rendimiento: subreceta.rendimiento_gramos,
        tipo_rendimiento: subreceta.tipo_rendimiento,
        preparacion: subreceta.notas || '',
        coccion: '',
        tener_en_cuenta: '',
        ingredientes: ings.map((i) => ({
          nombre: i.nombre,
          cantidad: parseFloat(i.cantidad),
          unidad: i.unidad,
          es_subreceta: false,
        })),
      });
    } else {
      // Producto
      const [rows] = await pool.query(
        `SELECT p.id, p.nombre, p.porciones, p.preparacion, p.coccion, p.tener_en_cuenta,
                ${COLS_CATEGORIA}
         FROM productos p
         ${JOIN_CATEGORIAS('p')}
         WHERE p.id = ? AND p.activo = 1`,
        [id]
      );
      if (rows.length === 0) return error(res, 'Producto no encontrado', 404);

      const prod = rows[0];

      // Get ingredients (direct + subrecetas) with real units
      const [ings] = await pool.query(
        `SELECT pi.cantidad,
                COALESCE(u.abreviatura, pi.unidad, 'g') AS unidad,
                COALESCE(i.nombre, s.nombre) AS nombre,
                CASE WHEN pi.subreceta_id IS NOT NULL THEN 1 ELSE 0 END AS es_subreceta
         FROM producto_ingredientes pi
         LEFT JOIN ingredientes i ON pi.ingrediente_id = i.id
         LEFT JOIN unidades u ON i.unidad_id = u.id
         LEFT JOIN subrecetas s ON pi.subreceta_id = s.id
         WHERE pi.producto_id = ?
           -- Los items manuales son un costo, no algo que se prepare: sin
           -- este filtro saldrian aca como una fila con el nombre vacio.
           AND (pi.ingrediente_id IS NOT NULL OR pi.subreceta_id IS NOT NULL)`,
        [id]
      );

      success(res, {
        id: prod.id,
        nombre: prod.nombre,
        porciones: prod.porciones,
        categoria_nombre: prod.categoria_nombre,
        categoria_icono: prod.categoria_icono,
        subcategoria_nombre: prod.subcategoria_nombre,
        preparacion: prod.preparacion || '',
        coccion: prod.coccion || '',
        tener_en_cuenta: prod.tener_en_cuenta || '',
        ingredientes: ings.map((i) => ({
          nombre: i.nombre,
          cantidad: parseFloat(i.cantidad),
          unidad: i.unidad,
          es_subreceta: !!i.es_subreceta,
        })),
      });
    }
  })
);

// PUT /:tipo/:id - Update preparation only
router.put(
  '/:tipo/:id',
  asyncHandler(async (req, res) => {
    const { tipo, id } = req.params;
    const { preparacion, coccion, tener_en_cuenta } = req.body;

    if (tipo === 'subreceta') {
      // For subrecetas, store preparation in notas field
      const [result] = await pool.query(
        'UPDATE subrecetas SET notas = ? WHERE id = ? AND activo = 1',
        [preparacion || null, id]
      );
      if (result.affectedRows === 0) return error(res, 'Subreceta no encontrada', 404);
    } else {
      // For productos, use dedicated columns
      const [result] = await pool.query(
        'UPDATE productos SET preparacion = ?, coccion = ?, tener_en_cuenta = ? WHERE id = ? AND activo = 1',
        [preparacion || null, coccion || null, tener_en_cuenta || null, id]
      );
      if (result.affectedRows === 0) return error(res, 'Producto no encontrado', 404);
    }

    success(res, { message: 'Preparacion actualizada' });
  })
);

module.exports = router;
