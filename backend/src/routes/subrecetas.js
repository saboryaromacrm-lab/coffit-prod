const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');
const { recalculateSubreceta, cascadeFromSubreceta } = require('../utils/recalculate');

// GET / - List subrecetas with ingredients
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [subrecetas] = await pool.query(
      'SELECT * FROM subrecetas WHERE activo = 1 ORDER BY nombre'
    );

    for (const sub of subrecetas) {
      const [items] = await pool.query(
        `SELECT si.id, si.ingrediente_id, si.cantidad,
                COALESCE(u.abreviatura, si.unidad, 'g') AS unidad,
                i.nombre AS ingrediente_nombre, i.costo_con_desperdicio,
                i.fecha_precio,
                u.abreviatura AS unidad_abrev
         FROM subreceta_ingredientes si
         JOIN ingredientes i ON si.ingrediente_id = i.id
         LEFT JOIN unidades u ON i.unidad_id = u.id
         WHERE si.subreceta_id = ?`,
        [sub.id]
      );
      sub.ingredientes = items;
    }

    success(res, subrecetas);
  })
);

// GET /:id - Get single subreceta
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [rows] = await pool.query(
      'SELECT * FROM subrecetas WHERE id = ? AND activo = 1',
      [id]
    );

    if (rows.length === 0) return error(res, 'Subreceta no encontrada', 404);

    const sub = rows[0];
    const [items] = await pool.query(
      `SELECT si.id, si.ingrediente_id, si.cantidad, si.unidad,
              i.nombre AS ingrediente_nombre, i.costo_con_desperdicio,
              u.abreviatura
       FROM subreceta_ingredientes si
       JOIN ingredientes i ON si.ingrediente_id = i.id
       LEFT JOIN unidades u ON i.unidad_id = u.id
       WHERE si.subreceta_id = ?`,
      [id]
    );
    sub.ingredientes = items;

    success(res, sub);
  })
);

// Normaliza un valor nutricional: numero >= 0 o null (campo opcional)
function nutriVal(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(v);
  return Number.isNaN(n) || n < 0 ? null : n;
}

// POST / - Create subreceta
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      nombre, rendimiento_gramos, tipo_rendimiento, notas, ingredientes,
      nutri_energia_kcal, nutri_proteinas_g, nutri_carbohidratos_g, nutri_azucares_g,
      nutri_grasas_g, nutri_grasas_sat_g, nutri_grasas_trans_g, nutri_sodio_mg,
    } = req.body;

    if (!nombre) return error(res, 'Nombre es requerido');
    if (!ingredientes || ingredientes.length === 0) return error(res, 'Se requiere al menos 1 ingrediente');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO subrecetas (nombre, rendimiento_gramos, tipo_rendimiento, notas,
           nutri_energia_kcal, nutri_proteinas_g, nutri_carbohidratos_g, nutri_azucares_g,
           nutri_grasas_g, nutri_grasas_sat_g, nutri_grasas_trans_g, nutri_sodio_mg)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nombre, rendimiento_gramos || 100, tipo_rendimiento || 'gramos', notas || null,
          nutriVal(nutri_energia_kcal), nutriVal(nutri_proteinas_g), nutriVal(nutri_carbohidratos_g), nutriVal(nutri_azucares_g),
          nutriVal(nutri_grasas_g), nutriVal(nutri_grasas_sat_g), nutriVal(nutri_grasas_trans_g), nutriVal(nutri_sodio_mg),
        ]
      );

      const subId = result.insertId;

      // Insert ingredients
      for (const ing of ingredientes) {
        await conn.query(
          'INSERT INTO subreceta_ingredientes (subreceta_id, ingrediente_id, cantidad, unidad) VALUES (?, ?, ?, ?)',
          [subId, ing.ingrediente_id, ing.cantidad, ing.unidad || 'g']
        );
      }

      // Calculate costs
      await recalculateSubreceta(conn, subId);

      await conn.commit();

      // Return complete subreceta
      const [newSub] = await pool.query('SELECT * FROM subrecetas WHERE id = ?', [subId]);
      const [items] = await pool.query(
        `SELECT si.id, si.ingrediente_id, si.cantidad,
                COALESCE(u.abreviatura, si.unidad, 'g') AS unidad,
                i.nombre AS ingrediente_nombre, i.costo_con_desperdicio,
                i.fecha_precio,
                u.abreviatura AS unidad_abrev
         FROM subreceta_ingredientes si
         JOIN ingredientes i ON si.ingrediente_id = i.id
         LEFT JOIN unidades u ON i.unidad_id = u.id
         WHERE si.subreceta_id = ?`,
        [subId]
      );
      newSub[0].ingredientes = items;

      success(res, newSub[0], 201);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// PUT /:id - Update subreceta
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      nombre, rendimiento_gramos, tipo_rendimiento, notas, ingredientes,
      nutri_energia_kcal, nutri_proteinas_g, nutri_carbohidratos_g, nutri_azucares_g,
      nutri_grasas_g, nutri_grasas_sat_g, nutri_grasas_trans_g, nutri_sodio_mg,
    } = req.body;

    if (!nombre) return error(res, 'Nombre es requerido');
    if (!ingredientes || ingredientes.length === 0) return error(res, 'Se requiere al menos 1 ingrediente');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `UPDATE subrecetas SET nombre = ?, rendimiento_gramos = ?, tipo_rendimiento = ?, notas = ?,
           nutri_energia_kcal = ?, nutri_proteinas_g = ?, nutri_carbohidratos_g = ?, nutri_azucares_g = ?,
           nutri_grasas_g = ?, nutri_grasas_sat_g = ?, nutri_grasas_trans_g = ?, nutri_sodio_mg = ?
         WHERE id = ? AND activo = 1`,
        [
          nombre, rendimiento_gramos || 100, tipo_rendimiento || 'gramos', notas || null,
          nutriVal(nutri_energia_kcal), nutriVal(nutri_proteinas_g), nutriVal(nutri_carbohidratos_g), nutriVal(nutri_azucares_g),
          nutriVal(nutri_grasas_g), nutriVal(nutri_grasas_sat_g), nutriVal(nutri_grasas_trans_g), nutriVal(nutri_sodio_mg),
          id,
        ]
      );

      if (result.affectedRows === 0) {
        await conn.rollback();
        return error(res, 'Subreceta no encontrada', 404);
      }

      // Delete old ingredients and insert new
      await conn.query('DELETE FROM subreceta_ingredientes WHERE subreceta_id = ?', [id]);

      for (const ing of ingredientes) {
        await conn.query(
          'INSERT INTO subreceta_ingredientes (subreceta_id, ingrediente_id, cantidad, unidad) VALUES (?, ?, ?, ?)',
          [id, ing.ingrediente_id, ing.cantidad, ing.unidad || 'g']
        );
      }

      // Recalculate subreceta costs
      await recalculateSubreceta(conn, id);

      // Cascade to products using this subreceta
      await cascadeFromSubreceta(conn, id);

      await conn.commit();

      const [updated] = await pool.query('SELECT * FROM subrecetas WHERE id = ?', [id]);
      const [items] = await pool.query(
        `SELECT si.id, si.ingrediente_id, si.cantidad,
                COALESCE(u.abreviatura, si.unidad, 'g') AS unidad,
                i.nombre AS ingrediente_nombre, i.costo_con_desperdicio,
                i.fecha_precio,
                u.abreviatura AS unidad_abrev
         FROM subreceta_ingredientes si
         JOIN ingredientes i ON si.ingrediente_id = i.id
         LEFT JOIN unidades u ON i.unidad_id = u.id
         WHERE si.subreceta_id = ?`,
        [id]
      );
      updated[0].ingredientes = items;

      success(res, updated[0]);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// DELETE /:id - Soft delete
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if used in products
    const [uso] = await pool.query(
      'SELECT COUNT(*) AS count FROM producto_ingredientes WHERE subreceta_id = ?',
      [id]
    );
    if (uso[0].count > 0) {
      return error(res, 'No se puede eliminar: esta subreceta se usa en productos');
    }

    const [result] = await pool.query(
      'UPDATE subrecetas SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Subreceta no encontrada', 404);
    }

    success(res, { message: 'Subreceta eliminada' });
  })
);

module.exports = router;
