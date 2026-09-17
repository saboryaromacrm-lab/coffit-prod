const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// Helper: parsea un query param que puede venir como:
//   - String con comas: "Cafe latte,Torta bruce"  -> ['Cafe latte', 'Torta bruce']
//   - Array (Express query parser): ['Cafe latte', 'Torta bruce'] -> idem
//   - undefined/null/vacio -> []
// Hace trim, filtra vacios y deduplica.
function parseListParam(val) {
  if (!val) return [];
  let arr;
  if (Array.isArray(val)) arr = val;
  else arr = String(val).split(',');
  const cleaned = arr.map((s) => String(s).trim()).filter((s) => s.length > 0);
  return Array.from(new Set(cleaned));
}

// ============================================================================
// OPERARIOS
// ============================================================================

// GET /operarios - List active operarios
router.get(
  '/operarios',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM operarios WHERE activo = 1 ORDER BY nombre'
    );
    success(res, rows);
  })
);

// POST /operarios - Create operario
router.post(
  '/operarios',
  asyncHandler(async (req, res) => {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return error(res, 'Nombre es requerido');

    const [result] = await pool.query(
      'INSERT INTO operarios (nombre) VALUES (?)',
      [nombre.trim()]
    );

    const [newOp] = await pool.query('SELECT * FROM operarios WHERE id = ?', [result.insertId]);
    success(res, newOp[0], 201);
  })
);

// DELETE /operarios/:id - Soft delete operario
router.delete(
  '/operarios/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE operarios SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );
    if (result.affectedRows === 0) return error(res, 'Operario no encontrado', 404);
    success(res, { message: 'Operario eliminado' });
  })
);

// ============================================================================
// REGISTROS DE PRODUCCION
// ============================================================================

// GET /registros - List production records with filters
// Filtros:
//   - desde, hasta: rango de fechas
//   - estado: 'Completado' | 'En proceso' | 'Cancelado'
//   - operario_id: filtra por operario
//   - producto: legacy LIKE por nombre (back-compat)
//   - productos: lista de nombres separados por coma (multi-select, match exacto)
router.get(
  '/registros',
  asyncHandler(async (req, res) => {
    const { desde, hasta, estado, operario_id, producto, productos, limit: limitStr, offset: offsetStr } = req.query;
    const productosList = parseListParam(productos);

    let sql = `
      SELECT pr.*, o.nombre AS operario_display
      FROM produccion_registros pr
      LEFT JOIN operarios o ON pr.operario_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (desde) {
      sql += ' AND pr.fecha >= ?';
      params.push(desde);
    }
    if (hasta) {
      sql += ' AND pr.fecha <= ?';
      params.push(hasta);
    }
    if (estado) {
      sql += ' AND pr.estado = ?';
      params.push(estado);
    }
    if (operario_id) {
      sql += ' AND pr.operario_id = ?';
      params.push(operario_id);
    }
    // Priorizar multi-select si viene. Si no, caer al LIKE legacy.
    if (productosList.length > 0) {
      sql += ` AND pr.producto_nombre IN (${productosList.map(() => '?').join(',')})`;
      params.push(...productosList);
    } else if (producto) {
      sql += ' AND pr.producto_nombre LIKE ?';
      params.push(`%${producto}%`);
    }

    sql += ' ORDER BY pr.fecha DESC, pr.created_at DESC';

    const limit = parseInt(limitStr) || 200;
    const offset = parseInt(offsetStr) || 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.query(sql, params);

    // Count
    let countSql = `
      SELECT COUNT(*) AS total
      FROM produccion_registros pr
      WHERE 1=1
    `;
    const countParams = [];
    if (desde) { countSql += ' AND pr.fecha >= ?'; countParams.push(desde); }
    if (hasta) { countSql += ' AND pr.fecha <= ?'; countParams.push(hasta); }
    if (estado) { countSql += ' AND pr.estado = ?'; countParams.push(estado); }
    if (operario_id) { countSql += ' AND pr.operario_id = ?'; countParams.push(operario_id); }
    if (productosList.length > 0) {
      countSql += ` AND pr.producto_nombre IN (${productosList.map(() => '?').join(',')})`;
      countParams.push(...productosList);
    } else if (producto) {
      countSql += ' AND pr.producto_nombre LIKE ?';
      countParams.push(`%${producto}%`);
    }

    const [countRows] = await pool.query(countSql, countParams);

    res.json({ success: true, data: rows, total: countRows[0].total });
  })
);

// POST /registros - Save batch of production records
router.post(
  '/registros',
  asyncHandler(async (req, res) => {
    const { registros } = req.body;

    if (!registros || !Array.isArray(registros) || registros.length === 0) {
      return error(res, 'Se requiere al menos 1 registro');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const insertedIds = [];

      for (const reg of registros) {
        if (!reg.producto_nombre || !reg.fecha) {
          await conn.rollback();
          return error(res, 'Cada registro debe tener producto_nombre y fecha');
        }

        const [result] = await conn.query(
          `INSERT INTO produccion_registros
           (fecha, hora_ingreso, hora_salida, producto_nombre, producto_id, cantidad, estado, observacion, operario_id, operario_nombre)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reg.fecha,
            reg.hora_ingreso || null,
            reg.hora_salida || null,
            reg.producto_nombre,
            reg.producto_id || null,
            reg.cantidad || 1,
            reg.estado || 'Completado',
            reg.observacion || null,
            reg.operario_id || null,
            reg.operario_nombre || null,
          ]
        );
        insertedIds.push(result.insertId);
      }

      await conn.commit();

      // Return all inserted records
      if (insertedIds.length > 0) {
        const placeholders = insertedIds.map(() => '?').join(',');
        const [rows] = await pool.query(
          `SELECT pr.*, o.nombre AS operario_display
           FROM produccion_registros pr
           LEFT JOIN operarios o ON pr.operario_id = o.id
           WHERE pr.id IN (${placeholders})
           ORDER BY pr.id`,
          insertedIds
        );
        success(res, rows, 201);
      } else {
        success(res, [], 201);
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// PUT /registros/:id - Update a single record
router.put(
  '/registros/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { fecha, hora_ingreso, hora_salida, producto_nombre, producto_id, cantidad, estado, observacion, operario_id, operario_nombre } = req.body;

    if (!producto_nombre || !fecha) {
      return error(res, 'producto_nombre y fecha son requeridos');
    }

    const [result] = await pool.query(
      `UPDATE produccion_registros SET
        fecha = ?, hora_ingreso = ?, hora_salida = ?, producto_nombre = ?, producto_id = ?,
        cantidad = ?, estado = ?, observacion = ?, operario_id = ?, operario_nombre = ?
       WHERE id = ?`,
      [
        fecha,
        hora_ingreso || null,
        hora_salida || null,
        producto_nombre,
        producto_id || null,
        cantidad || 1,
        estado || 'Completado',
        observacion || null,
        operario_id || null,
        operario_nombre || null,
        id,
      ]
    );

    if (result.affectedRows === 0) return error(res, 'Registro no encontrado', 404);

    const [updated] = await pool.query(
      `SELECT pr.*, o.nombre AS operario_display
       FROM produccion_registros pr
       LEFT JOIN operarios o ON pr.operario_id = o.id
       WHERE pr.id = ?`,
      [id]
    );
    success(res, updated[0]);
  })
);

// DELETE /registros/:id - Delete a record
// DELETE /registros/by-producto - Borra TODOS los registros que matcheen los filtros.
// Pensado para "borrar todos los registros de X producto del periodo visible en el reporte".
// Respeta los filtros activos para no borrar mas de lo que el usuario ve.
//
// IMPORTANTE: declarado ANTES de /:id para que Express no lo interprete como param.
//
// Query params:
//   - producto_nombre (requerido): nombre exacto del producto/subreceta
//   - desde, hasta (requeridos): rango de fechas
//   - estado (opcional)
//   - operario_id (opcional)
router.delete(
  '/registros/by-producto',
  asyncHandler(async (req, res) => {
    const { producto_nombre, desde, hasta, estado, operario_id } = req.query;

    if (!producto_nombre || !desde || !hasta) {
      return error(res, 'producto_nombre, desde y hasta son requeridos');
    }

    let sql = 'DELETE FROM produccion_registros WHERE producto_nombre = ? AND fecha >= ? AND fecha <= ?';
    const params = [producto_nombre, desde, hasta];

    if (estado) {
      sql += ' AND estado = ?';
      params.push(estado);
    }
    if (operario_id) {
      sql += ' AND operario_id = ?';
      params.push(operario_id);
    }

    const [result] = await pool.query(sql, params);
    success(res, { eliminados: result.affectedRows, message: `${result.affectedRows} registro(s) eliminado(s)` });
  })
);

router.delete(
  '/registros/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await pool.query(
      'DELETE FROM produccion_registros WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) return error(res, 'Registro no encontrado', 404);
    success(res, { message: 'Registro eliminado' });
  })
);

// ============================================================================
// REPORTES
// ============================================================================

// GET /reportes - Get aggregated report data
// Filtros:
//   - desde, hasta (requeridos)
//   - operario_id
//   - producto: legacy, un solo nombre (back-compat)
//   - productos: lista separada por coma (multi-select, match exacto)
router.get(
  '/reportes',
  asyncHandler(async (req, res) => {
    const { desde, hasta, operario_id, producto, productos } = req.query;

    if (!desde || !hasta) {
      return error(res, 'Parametros desde y hasta son requeridos');
    }

    const productosList = parseListParam(productos);

    // Build dynamic WHERE clause (con alias pr.)
    let extraWhere = '';
    const extraParams = [];
    if (operario_id) {
      extraWhere += ' AND pr.operario_id = ?';
      extraParams.push(operario_id);
    }
    if (productosList.length > 0) {
      extraWhere += ` AND pr.producto_nombre IN (${productosList.map(() => '?').join(',')})`;
      extraParams.push(...productosList);
    } else if (producto) {
      extraWhere += ' AND pr.producto_nombre = ?';
      extraParams.push(producto);
    }

    // Without alias
    let extraWhereSimple = '';
    const extraParamsSimple = [];
    if (operario_id) {
      extraWhereSimple += ' AND operario_id = ?';
      extraParamsSimple.push(operario_id);
    }
    if (productosList.length > 0) {
      extraWhereSimple += ` AND producto_nombre IN (${productosList.map(() => '?').join(',')})`;
      extraParamsSimple.push(...productosList);
    } else if (producto) {
      extraWhereSimple += ' AND producto_nombre = ?';
      extraParamsSimple.push(producto);
    }

    // Production by product
    const [porProducto] = await pool.query(
      `SELECT producto_nombre, SUM(cantidad) AS total_cantidad, COUNT(*) AS total_registros
       FROM produccion_registros
       WHERE fecha >= ? AND fecha <= ? AND estado = 'Completado'${extraWhereSimple}
       GROUP BY producto_nombre
       ORDER BY total_cantidad DESC`,
      [desde, hasta, ...extraParamsSimple]
    );

    // Production by operario
    const [porOperario] = await pool.query(
      `SELECT COALESCE(o.nombre, pr.operario_nombre, 'Sin asignar') AS operario,
              SUM(pr.cantidad) AS total_cantidad, COUNT(*) AS total_registros
       FROM produccion_registros pr
       LEFT JOIN operarios o ON pr.operario_id = o.id
       WHERE pr.fecha >= ? AND pr.fecha <= ? AND pr.estado = 'Completado'${extraWhere}
       GROUP BY operario
       ORDER BY total_cantidad DESC`,
      [desde, hasta, ...extraParams]
    );

    // Production by day
    const [porDia] = await pool.query(
      `SELECT fecha, SUM(cantidad) AS total_cantidad, COUNT(*) AS total_registros
       FROM produccion_registros
       WHERE fecha >= ? AND fecha <= ? AND estado = 'Completado'${extraWhereSimple}
       GROUP BY fecha
       ORDER BY fecha ASC`,
      [desde, hasta, ...extraParamsSimple]
    );

    // Summary totals
    const [totales] = await pool.query(
      `SELECT
         COUNT(*) AS total_registros,
         SUM(cantidad) AS total_unidades,
         COUNT(DISTINCT producto_nombre) AS total_productos,
         COUNT(DISTINCT DATE(fecha)) AS total_dias
       FROM produccion_registros
       WHERE fecha >= ? AND fecha <= ? AND estado = 'Completado'${extraWhereSimple}`,
      [desde, hasta, ...extraParamsSimple]
    );

    // Status breakdown
    const [porEstado] = await pool.query(
      `SELECT estado, COUNT(*) AS cantidad
       FROM produccion_registros
       WHERE fecha >= ? AND fecha <= ?${extraWhereSimple}
       GROUP BY estado`,
      [desde, hasta, ...extraParamsSimple]
    );

    success(res, {
      porProducto,
      porOperario,
      porDia,
      totales: totales[0],
      porEstado,
    });
  })
);

// GET /reporte-ingredientes - Ingredientes consumidos desde los registros de produccion
//
// Fuentes de consumo (UNION ALL):
//   Parte 1: Ingredientes directos de PRODUCTOS registrados en produccion
//   Parte 2: Ingredientes dentro de SUBRECETAS que estan como parte de un PRODUCTO registrado
//   Parte 3: Ingredientes de SUBRECETAS registradas DIRECTAMENTE en produccion
//
// IMPORTANTE: el match se hace por `nombre` (no por `producto_id`) porque el ID de la columna
// `produccion_registros.producto_id` es ambiguo entre tablas `productos` y `subrecetas`.
// Ambas tablas pueden tener el mismo ID y `produccion_registros` no guarda el tipo.
//
// Query params opcionales:
//   - buscar: filtra por nombre de ingrediente
//   - subreceta: nombre de una subreceta especifica (excluye parte 1 - ingredientes directos)
//   - productos: lista de nombres (productos/subrecetas) separados por coma, filtra la fuente
//     en las 3 partes por pr.producto_nombre IN (...)
router.get(
  '/reporte-ingredientes',
  asyncHandler(async (req, res) => {
    const { desde, hasta, buscar, subreceta, productos } = req.query;

    if (!desde || !hasta) {
      return error(res, 'Parametros desde y hasta son requeridos');
    }

    const parts = [];
    const params = [];
    const filtroSubreceta = subreceta && subreceta.toString().trim();
    const productosList = parseListParam(productos);
    const hasProductosFilter = productosList.length > 0;
    const inClause = hasProductosFilter
      ? ` AND pr.producto_nombre IN (${productosList.map(() => '?').join(',')})`
      : '';

    // ---- Parte 1: ingredientes directos de productos ----
    if (!filtroSubreceta) {
      parts.push(`
        SELECT
          i.id AS ingrediente_id,
          i.nombre,
          COALESCE(u.abreviatura, 'g') AS unidad,
          SUM(pr.cantidad * pi.cantidad) AS cantidad_total,
          SUM(pr.cantidad * pi.cantidad * i.costo_con_desperdicio) AS costo_total
        FROM produccion_registros pr
        JOIN productos p ON p.nombre = pr.producto_nombre AND p.activo = 1 AND p.es_borrador = 0
        JOIN producto_ingredientes pi ON pi.producto_id = p.id
        JOIN ingredientes i ON i.id = pi.ingrediente_id
        LEFT JOIN unidades u ON u.id = i.unidad_id
        WHERE pr.fecha >= ? AND pr.fecha <= ?
          AND pr.estado = 'Completado'
          AND pi.ingrediente_id IS NOT NULL
          AND i.activo = 1
          ${inClause}
        GROUP BY i.id, i.nombre, u.abreviatura
      `);
      params.push(desde, hasta);
      if (hasProductosFilter) params.push(...productosList);
    }

    // ---- Parte 2: ingredientes dentro de subrecetas usadas en productos ----
    parts.push(`
      SELECT
        i.id AS ingrediente_id,
        i.nombre,
        COALESCE(u.abreviatura, 'g') AS unidad,
        SUM(pr.cantidad * pi.cantidad * (si.cantidad / NULLIF(s.rendimiento_gramos, 0))) AS cantidad_total,
        SUM(pr.cantidad * pi.cantidad * (si.cantidad / NULLIF(s.rendimiento_gramos, 0)) * i.costo_con_desperdicio) AS costo_total
      FROM produccion_registros pr
      JOIN productos p ON p.nombre = pr.producto_nombre AND p.activo = 1 AND p.es_borrador = 0
      JOIN producto_ingredientes pi ON pi.producto_id = p.id
      JOIN subrecetas s ON s.id = pi.subreceta_id AND s.activo = 1
      JOIN subreceta_ingredientes si ON si.subreceta_id = s.id
      JOIN ingredientes i ON i.id = si.ingrediente_id
      LEFT JOIN unidades u ON u.id = i.unidad_id
      WHERE pr.fecha >= ? AND pr.fecha <= ?
        AND pr.estado = 'Completado'
        AND pi.subreceta_id IS NOT NULL
        AND i.activo = 1
        ${filtroSubreceta ? 'AND s.nombre = ?' : ''}
        ${inClause}
      GROUP BY i.id, i.nombre, u.abreviatura
    `);
    params.push(desde, hasta);
    if (filtroSubreceta) params.push(filtroSubreceta);
    if (hasProductosFilter) params.push(...productosList);

    // ---- Parte 3: subrecetas registradas DIRECTAMENTE en produccion ----
    // pr.cantidad = "cantidad de RECETAS COMPLETAS" producidas.
    // Por cada receta, se consume si.cantidad del ingrediente (no se divide por rendimiento).
    // Ejemplo: subreceta rinde 15 porciones, usa 1500g harina. Si produjo 1 receta -> 1500g harina.
    // Si produjo 2 recetas -> 3000g harina. Etc.
    parts.push(`
      SELECT
        i.id AS ingrediente_id,
        i.nombre,
        COALESCE(u.abreviatura, 'g') AS unidad,
        SUM(pr.cantidad * si.cantidad) AS cantidad_total,
        SUM(pr.cantidad * si.cantidad * i.costo_con_desperdicio) AS costo_total
      FROM produccion_registros pr
      JOIN subrecetas s ON s.nombre = pr.producto_nombre AND s.activo = 1
      JOIN subreceta_ingredientes si ON si.subreceta_id = s.id
      JOIN ingredientes i ON i.id = si.ingrediente_id
      LEFT JOIN unidades u ON u.id = i.unidad_id
      WHERE pr.fecha >= ? AND pr.fecha <= ?
        AND pr.estado = 'Completado'
        AND i.activo = 1
        AND NOT EXISTS (
          SELECT 1 FROM productos p
          WHERE p.nombre = pr.producto_nombre
            AND p.activo = 1
            AND p.es_borrador = 0
        )
        ${filtroSubreceta ? 'AND s.nombre = ?' : ''}
        ${inClause}
      GROUP BY i.id, i.nombre, u.abreviatura
    `);
    params.push(desde, hasta);
    if (filtroSubreceta) params.push(filtroSubreceta);
    if (hasProductosFilter) params.push(...productosList);

    let havingClause = '';
    if (buscar) {
      havingClause = ' HAVING nombre LIKE ?';
      params.push(`%${buscar}%`);
    }

    const sql = `
      SELECT
        ingrediente_id,
        nombre,
        unidad,
        SUM(cantidad_total) AS cantidad_total,
        SUM(costo_total) AS costo_total
      FROM (
        ${parts.join(' UNION ALL ')}
      ) combined
      GROUP BY ingrediente_id, nombre, unidad
      ${havingClause}
      ORDER BY cantidad_total DESC
    `;

    const [rows] = await pool.query(sql, params);

    const totalCantidad = rows.reduce((sum, r) => sum + Number(r.cantidad_total || 0), 0);
    const totalCosto = rows.reduce((sum, r) => sum + Number(r.costo_total || 0), 0);

    const data = rows.map((r) => ({
      ingrediente_id: r.ingrediente_id,
      nombre: r.nombre,
      unidad: r.unidad,
      cantidad_total: Math.round(Number(r.cantidad_total || 0) * 100) / 100,
      costo_total: Math.round(Number(r.costo_total || 0) * 100) / 100,
      porcentaje: totalCantidad > 0 ? Math.round((Number(r.cantidad_total || 0) / totalCantidad) * 1000) / 10 : 0,
    }));

    success(res, {
      ingredientes: data,
      totales: {
        total_ingredientes: data.length,
        total_cantidad: Math.round(totalCantidad * 100) / 100,
        total_costo: Math.round(totalCosto * 100) / 100,
      },
      filtro_subreceta: filtroSubreceta || null,
    });
  })
);

// GET /subrecetas-usadas - Subrecetas que aparecen en la produccion (para dropdown del reporte)
// Devuelve solo las subrecetas que tuvieron consumo dentro del rango, para no mostrar opciones inutiles.
router.get(
  '/subrecetas-usadas',
  asyncHandler(async (req, res) => {
    const { desde, hasta } = req.query;

    if (!desde || !hasta) {
      return error(res, 'Parametros desde y hasta son requeridos');
    }

    // Unimos:
    // - Subrecetas que estan como parte de un producto registrado en produccion
    // - Subrecetas registradas directamente en produccion
    const [rows] = await pool.query(
      `
      SELECT DISTINCT nombre FROM (
        SELECT s.nombre
        FROM produccion_registros pr
        JOIN productos p ON p.nombre = pr.producto_nombre AND p.activo = 1 AND p.es_borrador = 0
        JOIN producto_ingredientes pi ON pi.producto_id = p.id
        JOIN subrecetas s ON s.id = pi.subreceta_id AND s.activo = 1
        WHERE pr.fecha >= ? AND pr.fecha <= ? AND pr.estado = 'Completado'

        UNION

        SELECT s.nombre
        FROM produccion_registros pr
        JOIN subrecetas s ON s.nombre = pr.producto_nombre AND s.activo = 1
        WHERE pr.fecha >= ? AND pr.fecha <= ? AND pr.estado = 'Completado'
          AND NOT EXISTS (
            SELECT 1 FROM productos p
            WHERE p.nombre = pr.producto_nombre
              AND p.activo = 1
              AND p.es_borrador = 0
          )
      ) AS sub
      ORDER BY nombre
      `,
      [desde, hasta, desde, hasta]
    );

    success(res, rows.map((r) => r.nombre));
  })
);

// GET /productos-catalogo - Get products + subrecetas for dropdown
router.get(
  '/productos-catalogo',
  asyncHandler(async (req, res) => {
    const [productos] = await pool.query(
      `SELECT id, nombre, 'producto' AS tipo FROM productos WHERE activo = 1 AND es_borrador = 0
       UNION ALL
       SELECT id, nombre, 'subreceta' AS tipo FROM subrecetas WHERE activo = 1
       ORDER BY nombre`
    );
    success(res, productos);
  })
);

module.exports = router;
