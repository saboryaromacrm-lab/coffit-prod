const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');
const { cascadeFromIngredient } = require('../utils/recalculate');

// GET / - List ingredients with filters
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { categoria, buscar, orden, antiguedad, fecha_desde, fecha_hasta, solo_no_usados } = req.query;

    // uso_recetas se calcula siempre: alimenta el badge y el filtro "no usados".
    // Cuenta TODAS las filas pivote (activas o no), coherente con la guardia del DELETE.
    let sql = `
      SELECT i.*, u.nombre AS unidad_nombre, u.abreviatura AS unidad_abrev,
        DATEDIFF(CURDATE(), i.fecha_precio) AS dias_desde_actualizacion,
        (
          IFNULL((SELECT COUNT(*) FROM producto_ingredientes pi WHERE pi.ingrediente_id = i.id), 0)
          + IFNULL((SELECT COUNT(*) FROM subreceta_ingredientes si WHERE si.ingrediente_id = i.id), 0)
        ) AS uso_recetas
      FROM ingredientes i
      LEFT JOIN unidades u ON i.unidad_id = u.id
      WHERE i.activo = 1
    `;
    const params = [];

    if (categoria) {
      sql += ' AND i.categoria = ?';
      params.push(categoria);
    }

    if (buscar) {
      sql += ' AND i.nombre LIKE ?';
      params.push(`%${buscar}%`);
    }

    // Filtro: solo los que NO se usan en ninguna receta (subreceta ni producto)
    if (solo_no_usados === '1' || solo_no_usados === 'true') {
      sql += ` AND NOT EXISTS (SELECT 1 FROM producto_ingredientes pi WHERE pi.ingrediente_id = i.id)
               AND NOT EXISTS (SELECT 1 FROM subreceta_ingredientes si WHERE si.ingrediente_id = i.id)`;
    }

    if (antiguedad) {
      if (antiguedad.startsWith('act_')) {
        const days = parseInt(antiguedad.replace('act_', ''));
        sql += ' AND i.fecha_precio IS NOT NULL AND DATEDIFF(CURDATE(), i.fecha_precio) <= ?';
        params.push(days);
      } else {
        const days = parseInt(antiguedad);
        sql += ' AND (i.fecha_precio IS NULL OR DATEDIFF(CURDATE(), i.fecha_precio) >= ?)';
        params.push(days);
      }
    }

    if (fecha_desde) {
      sql += ' AND i.fecha_precio >= ?';
      params.push(fecha_desde);
    }

    if (fecha_hasta) {
      sql += ' AND i.fecha_precio <= ?';
      params.push(fecha_hasta);
    }

    // Ordering
    switch (orden) {
      case 'precio':
        sql += ' ORDER BY i.precio1 DESC';
        break;
      case 'fecha_desc':
        sql += ' ORDER BY i.fecha_precio DESC';
        break;
      case 'antiguedad':
        sql += ' ORDER BY i.created_at ASC';
        break;
      case 'uso_recetas':
        sql += ' ORDER BY uso_recetas DESC, i.nombre ASC';
        break;
      default:
        sql += ' ORDER BY i.nombre ASC';
    }

    const [rows] = await pool.query(sql, params);

    // Get distinct categories for filter dropdown
    const [cats] = await pool.query(
      'SELECT DISTINCT categoria FROM ingredientes WHERE activo = 1 AND categoria IS NOT NULL ORDER BY categoria'
    );

    res.json({
      success: true,
      data: rows,
      categorias: cats.map((c) => c.categoria),
      total: rows.length,
    });
  })
);

// POST / - Create ingredient
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      nombre, categoria, unidad_id, contenido_envase, desperdicio,
      proveedor1, precio1, proveedor2, precio2, fecha_precio, notas,
      calorias, carbohidratos, proteinas, grasas, fibra,
    } = req.body;

    if (!nombre) return error(res, 'Nombre es requerido');
    if (!contenido_envase || contenido_envase <= 0) return error(res, 'Contenido envase debe ser mayor a 0');

    const p1 = precio1 || 0;
    const ce = contenido_envase || 1;
    const desp = desperdicio || 0;
    const costoUnitario = p1 / ce;
    const costoConDesperdicio = desp > 0 && desp < 100
      ? costoUnitario / (1 - desp / 100)
      : costoUnitario;

    const [result] = await pool.query(
      `INSERT INTO ingredientes
        (nombre, categoria, unidad_id, contenido_envase, desperdicio,
         proveedor1, precio1, proveedor2, precio2,
         costo_unitario, costo_con_desperdicio, fecha_precio, notas,
         calorias, carbohidratos, proteinas, grasas, fibra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre, categoria || null, unidad_id || null, ce, desp,
        proveedor1 || null, p1, proveedor2 || null, precio2 || 0,
        costoUnitario, costoConDesperdicio, fecha_precio || null, notas || null,
        calorias || 0, carbohidratos || 0, proteinas || 0, grasas || 0, fibra || 0,
      ]
    );

    const [newRow] = await pool.query(
      `SELECT i.*, u.nombre AS unidad_nombre, u.abreviatura AS unidad_abrev
       FROM ingredientes i LEFT JOIN unidades u ON i.unidad_id = u.id
       WHERE i.id = ?`,
      [result.insertId]
    );

    success(res, newRow[0], 201);
  })
);

// PUT /:id - Update ingredient with cascading recalculation
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      nombre, categoria, unidad_id, contenido_envase, desperdicio,
      proveedor1, precio1, proveedor2, precio2, fecha_precio, notas,
      calorias, carbohidratos, proteinas, grasas, fibra,
    } = req.body;

    if (!nombre) return error(res, 'Nombre es requerido');
    if (!contenido_envase || contenido_envase <= 0) return error(res, 'Contenido envase debe ser mayor a 0');

    const p1 = precio1 || 0;
    const ce = contenido_envase || 1;
    const desp = desperdicio || 0;
    const costoUnitario = p1 / ce;
    const costoConDesperdicio = desp > 0 && desp < 100
      ? costoUnitario / (1 - desp / 100)
      : costoUnitario;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `UPDATE ingredientes SET
          nombre = ?, categoria = ?, unidad_id = ?, contenido_envase = ?, desperdicio = ?,
          proveedor1 = ?, precio1 = ?, proveedor2 = ?, precio2 = ?,
          costo_unitario = ?, costo_con_desperdicio = ?, fecha_precio = ?, notas = ?,
          calorias = ?, carbohidratos = ?, proteinas = ?, grasas = ?, fibra = ?
        WHERE id = ? AND activo = 1`,
        [
          nombre, categoria || null, unidad_id || null, ce, desp,
          proveedor1 || null, p1, proveedor2 || null, precio2 || 0,
          costoUnitario, costoConDesperdicio, fecha_precio || null, notas || null,
          calorias || 0, carbohidratos || 0, proteinas || 0, grasas || 0, fibra || 0,
          id,
        ]
      );

      if (result.affectedRows === 0) {
        await conn.rollback();
        return error(res, 'Ingrediente no encontrado', 404);
      }

      // Cascading recalculation
      await cascadeFromIngredient(conn, id);

      await conn.commit();

      const [updated] = await pool.query(
        `SELECT i.*, u.nombre AS unidad_nombre, u.abreviatura AS unidad_abrev
         FROM ingredientes i LEFT JOIN unidades u ON i.unidad_id = u.id
         WHERE i.id = ?`,
        [id]
      );

      success(res, updated[0]);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// GET /:id/uso - Lista los productos y subrecetas que usan este ingrediente.
// Util para mostrar al usuario donde se esta utilizando.
// Pensado para abrirse en un modal y poder navegar al editor de cada item.
router.get(
  '/:id/uso',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Productos que usan el ingrediente directamente (no via subreceta)
    const [productos] = await pool.query(
      `SELECT
         p.id,
         p.nombre,
         CAST(pi.cantidad AS DECIMAL(10,4)) AS cantidad,
         COALESCE(u.abreviatura, pi.unidad, 'g') AS unidad,
         COALESCE(cpp.nombre, cp.nombre, '') AS categoria_nombre,
         COALESCE(cpp.icono, cp.icono, '') AS categoria_icono,
         CASE WHEN cpp.id IS NULL THEN NULL ELSE cp.nombre END AS subcategoria_nombre,
         CAST(p.es_borrador AS UNSIGNED) AS es_borrador
       FROM producto_ingredientes pi
       JOIN productos p ON p.id = pi.producto_id
       LEFT JOIN ingredientes i ON i.id = pi.ingrediente_id
       LEFT JOIN unidades u ON u.id = i.unidad_id
       LEFT JOIN categorias_productos cp ON cp.id = p.categoria_id
       LEFT JOIN categorias_productos cpp ON cpp.id = cp.parent_id
       WHERE pi.ingrediente_id = ? AND p.activo = 1
       ORDER BY p.nombre`,
      [id]
    );

    // Subrecetas que usan el ingrediente
    const [subrecetas] = await pool.query(
      `SELECT
         s.id,
         s.nombre,
         CAST(si.cantidad AS DECIMAL(10,4)) AS cantidad,
         COALESCE(si.unidad, 'g') AS unidad,
         s.tipo_rendimiento
       FROM subreceta_ingredientes si
       JOIN subrecetas s ON s.id = si.subreceta_id
       WHERE si.ingrediente_id = ? AND s.activo = 1
       ORDER BY s.nombre`,
      [id]
    );

    success(res, {
      productos: productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        cantidad: Number(p.cantidad),
        unidad: p.unidad,
        categoria_nombre: p.categoria_nombre || null,
        categoria_icono: p.categoria_icono || null,
        subcategoria_nombre: p.subcategoria_nombre || null,
        es_borrador: Number(p.es_borrador) === 1,
      })),
      subrecetas: subrecetas.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        cantidad: Number(s.cantidad),
        unidad: s.unidad,
        tipo_rendimiento: s.tipo_rendimiento,
      })),
      total_productos: productos.length,
      total_subrecetas: subrecetas.length,
    });
  })
);

// POST /bulk-delete - borrado masivo (soft). Borra los que NO se usan y
// saltea + reporta los que estan en uso (mismo criterio que el DELETE: cuenta
// todas las filas pivote). body: { ids: number[] }
router.post(
  '/bulk-delete',
  asyncHandler(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return error(res, 'Se requieren ids');

    const cleanIds = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (cleanIds.length === 0) return error(res, 'Ids invalidos');

    const placeholders = cleanIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT id, nombre FROM ingredientes WHERE id IN (${placeholders}) AND activo = 1`,
      cleanIds
    );
    const nombreById = new Map(rows.map((r) => [r.id, r.nombre]));

    const eliminados = [];
    const omitidos = [];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const id of cleanIds) {
        if (!nombreById.has(id)) continue; // no existe o ya inactivo -> ignorar
        const [[{ c1 }]] = await conn.query(
          'SELECT COUNT(*) AS c1 FROM subreceta_ingredientes WHERE ingrediente_id = ?', [id]
        );
        const [[{ c2 }]] = await conn.query(
          'SELECT COUNT(*) AS c2 FROM producto_ingredientes WHERE ingrediente_id = ?', [id]
        );
        if (c1 + c2 > 0) {
          omitidos.push({ id, nombre: nombreById.get(id) });
          continue;
        }
        await conn.query('UPDATE ingredientes SET activo = 0 WHERE id = ? AND activo = 1', [id]);
        eliminados.push({ id, nombre: nombreById.get(id) });
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    success(res, {
      eliminados,
      omitidos,
      total_eliminados: eliminados.length,
      total_omitidos: omitidos.length,
    });
  })
);

// DELETE /:id - Soft delete (fail if in use)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if used in subrecetas
    const [subUso] = await pool.query(
      'SELECT COUNT(*) AS count FROM subreceta_ingredientes WHERE ingrediente_id = ?',
      [id]
    );
    if (subUso[0].count > 0) {
      return error(res, 'No se puede eliminar: este ingrediente se usa en subrecetas');
    }

    // Check if used in productos
    const [prodUso] = await pool.query(
      'SELECT COUNT(*) AS count FROM producto_ingredientes WHERE ingrediente_id = ?',
      [id]
    );
    if (prodUso[0].count > 0) {
      return error(res, 'No se puede eliminar: este ingrediente se usa en productos');
    }

    const [result] = await pool.query(
      'UPDATE ingredientes SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Ingrediente no encontrado', 404);
    }

    success(res, { message: 'Ingrediente eliminado' });
  })
);

module.exports = router;
