const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');
const { recalculateProducto, recalculateSubreceta } = require('../utils/recalculate');
const { calcularRentabilidades } = require('../utils/mcNeto');
const { JOIN_CATEGORIAS, COLS_CATEGORIA, FILTRO_CATEGORIA } = require('../utils/categoriaSql');

// SELECT + JOIN de categorias con jerarquia resuelta.
// categoria_nombre/icono siguen siendo los de la RAIZ (nada cambia para quien
// ya los consumia); subcategoria_nombre/id son los nuevos.
const SELECT_PROD = `SELECT p.*, ${COLS_CATEGORIA}
      FROM productos p
      ${JOIN_CATEGORIAS('p')}`;

/**
 * Helper: build resumen_canales from DB
 */
async function getResumenCanales() {
  const channelKeys = ['tarjeta', 'efectivo'];
  const resumen = {};

  for (const key of channelKeys) {
    const [channelRows] = await pool.query(
      'SELECT * FROM canales_venta WHERE codigo = ? AND activo = 1',
      [key]
    );

    if (channelRows.length === 0) {
      resumen[key] = { nombre: key, icono: null, conceptos: [] };
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

    const conceptos = linked.map((lc) => ({
      id: lc.id,
      nombre: lc.nombre,
      tipo: lc.tipo,
      valor: lc.porcentaje_override !== null ? parseFloat(lc.porcentaje_override) : parseFloat(lc.porcentaje),
    }));

    resumen[key] = { nombre: channel.nombre, icono: channel.icono, conceptos };
  }

  return resumen;
}

/**
 * Helper: get product ingredients
 */
async function getProductoIngredientes(productoId) {
  // Direct ingredients - use the ingredient's real unit, not the pivot table default
  const [ings] = await pool.query(
    `SELECT pi.id, pi.producto_id, pi.ingrediente_id, pi.subreceta_id,
            pi.cantidad,
            COALESCE(u.abreviatura, pi.unidad, 'g') AS unidad,
            i.nombre, i.costo_con_desperdicio AS costo_unitario,
            'ingrediente' AS tipo
     FROM producto_ingredientes pi
     JOIN ingredientes i ON pi.ingrediente_id = i.id
     LEFT JOIN unidades u ON i.unidad_id = u.id
     WHERE pi.producto_id = ? AND pi.ingrediente_id IS NOT NULL`,
    [productoId]
  );

  // Subreceta items
  const [subs] = await pool.query(
    `SELECT pi.id, pi.producto_id, pi.ingrediente_id, pi.subreceta_id,
            pi.cantidad,
            CASE WHEN s.tipo_rendimiento = 'porciones' THEN 'porc' ELSE 'g' END AS unidad,
            s.nombre,
            CASE
              WHEN s.tipo_rendimiento = 'porciones' THEN s.costo_total / NULLIF(s.rendimiento_gramos, 0)
              ELSE s.costo_por_100g / 100
            END AS costo_unitario,
            'subreceta' AS tipo
     FROM producto_ingredientes pi
     JOIN subrecetas s ON pi.subreceta_id = s.id
     WHERE pi.producto_id = ? AND pi.subreceta_id IS NOT NULL`,
    [productoId]
  );

  return [...ings, ...subs];
}

// GET / - List products with rentabilidades
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { categoria_id, buscar, cambio_precio, dias_cambio, es_borrador } = req.query;

    let sql = `${SELECT_PROD} WHERE p.activo = 1`;
    const params = [];

    if (es_borrador !== undefined) {
      sql += ' AND p.es_borrador = ?';
      params.push(es_borrador);
    }

    // Filtrar por una RAIZ incluye a todas sus subcategorias;
    // filtrar por una SUBCATEGORIA trae solo esa.
    if (categoria_id) {
      sql += ` AND ${FILTRO_CATEGORIA('p')}`;
      params.push(categoria_id, categoria_id);
    }

    if (buscar) {
      sql += ' AND p.nombre LIKE ?';
      params.push(`%${buscar}%`);
    }

    if (cambio_precio && dias_cambio) {
      const dias = parseInt(dias_cambio) || 30;
      if (cambio_precio === 'local' || cambio_precio === 'cualquiera') {
        sql += ' AND p.precio_anterior_local IS NOT NULL AND p.fecha_cambio_precio >= DATE_SUB(NOW(), INTERVAL ? DAY)';
        params.push(dias);
      }
    }

    sql += ' ORDER BY p.nombre';

    const [rows] = await pool.query(sql, params);

    // Get resumen_canales for MC Neto calculation
    const resumenCanales = await getResumenCanales();

    // Enrich each product with ingredients and rentabilidades
    for (const prod of rows) {
      prod.ingredientes = await getProductoIngredientes(prod.id);
      prod.rentabilidades = calcularRentabilidades(prod, resumenCanales);
    }

    success(res, rows);
  })
);

// GET /:id - Single product
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [rows] = await pool.query(
      `${SELECT_PROD} WHERE p.id = ? AND p.activo = 1`,
      [id]
    );

    if (rows.length === 0) return error(res, 'Producto no encontrado', 404);

    const prod = rows[0];
    prod.ingredientes = await getProductoIngredientes(prod.id);

    const resumenCanales = await getResumenCanales();
    prod.rentabilidades = calcularRentabilidades(prod, resumenCanales);

    success(res, prod);
  })
);

// POST / - Create product
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      nombre, categoria_id, porciones, precio_publico,
      es_borrador, notas, peso_total_g, ingredientes,
    } = req.body;

    if (!nombre) return error(res, 'Nombre es requerido');
    if (!ingredientes || ingredientes.length === 0) return error(res, 'Se requiere al menos 1 ingrediente');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO productos (nombre, categoria_id, porciones, precio_publico, es_borrador, notas, peso_total_g)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [nombre, categoria_id || null, porciones || 1, precio_publico || 0, es_borrador || 0, notas || null, peso_total_g || null]
      );

      const prodId = result.insertId;

      for (const item of ingredientes) {
        await conn.query(
          `INSERT INTO producto_ingredientes (producto_id, ingrediente_id, subreceta_id, cantidad, unidad)
           VALUES (?, ?, ?, ?, ?)`,
          [prodId, item.ingrediente_id || null, item.subreceta_id || null, item.cantidad, item.unidad || 'g']
        );
      }

      await recalculateProducto(conn, prodId);

      await conn.commit();

      // Return complete product
      const [newProd] = await pool.query(
        `${SELECT_PROD} WHERE p.id = ?`,
        [prodId]
      );
      newProd[0].ingredientes = await getProductoIngredientes(prodId);
      const resumenCanales = await getResumenCanales();
      newProd[0].rentabilidades = calcularRentabilidades(newProd[0], resumenCanales);

      success(res, newProd[0], 201);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// PUT /:id - Update product
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      nombre, categoria_id, porciones, precio_publico,
      es_borrador, notas, peso_total_g, ingredientes,
    } = req.body;

    if (!nombre) return error(res, 'Nombre es requerido');
    if (!ingredientes || ingredientes.length === 0) return error(res, 'Se requiere al menos 1 ingrediente');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Get current price for history
      const [current] = await conn.query(
        'SELECT precio_publico FROM productos WHERE id = ? AND activo = 1',
        [id]
      );

      if (current.length === 0) {
        await conn.rollback();
        return error(res, 'Producto no encontrado', 404);
      }

      const oldProd = current[0];
      let precioAnteriorLocal = null;
      let fechaCambio = null;

      if (precio_publico !== undefined && parseFloat(precio_publico) !== parseFloat(oldProd.precio_publico)) {
        precioAnteriorLocal = oldProd.precio_publico;
        fechaCambio = new Date();
      }

      const updateFields = [
        'nombre = ?', 'categoria_id = ?', 'porciones = ?',
        'precio_publico = ?',
        'es_borrador = ?', 'notas = ?', 'peso_total_g = ?',
      ];
      const updateParams = [
        nombre, categoria_id || null, porciones || 1,
        precio_publico || 0,
        es_borrador || 0, notas || null, peso_total_g || null,
      ];

      if (precioAnteriorLocal !== null) {
        updateFields.push('precio_anterior_local = ?');
        updateParams.push(precioAnteriorLocal);
      }
      if (fechaCambio) {
        updateFields.push('fecha_cambio_precio = ?');
        updateParams.push(fechaCambio);
      }

      updateParams.push(id);

      await conn.query(
        `UPDATE productos SET ${updateFields.join(', ')} WHERE id = ? AND activo = 1`,
        updateParams
      );

      // Replace recipe items
      await conn.query('DELETE FROM producto_ingredientes WHERE producto_id = ?', [id]);

      for (const item of ingredientes) {
        await conn.query(
          `INSERT INTO producto_ingredientes (producto_id, ingrediente_id, subreceta_id, cantidad, unidad)
           VALUES (?, ?, ?, ?, ?)`,
          [id, item.ingrediente_id || null, item.subreceta_id || null, item.cantidad, item.unidad || 'g']
        );
      }

      await recalculateProducto(conn, id);

      await conn.commit();

      const [updated] = await pool.query(
        `${SELECT_PROD} WHERE p.id = ?`,
        [id]
      );
      updated[0].ingredientes = await getProductoIngredientes(id);
      const resumenCanales = await getResumenCanales();
      updated[0].rentabilidades = calcularRentabilidades(updated[0], resumenCanales);

      success(res, updated[0]);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// POST /:id/convert-to-subreceta - Convierte un producto en subreceta
//
// Body:
//   - rendimiento_gramos (requerido): valor numerico (segun tipo)
//   - tipo_rendimiento (requerido): 'gramos' | 'porciones'
//   - confirmar_subrecetas_anidadas (opcional): si el producto tiene subrecetas adentro,
//     pasar `true` para confirmar que se ignoraran. Sin esto, devuelve 400.
//
// Acciones (transaccional):
//   1. Lee el producto y sus ingredientes directos (omite las subrecetas anidadas)
//   2. Crea una nueva subreceta con esos datos (nombre, notas)
//   3. Copia los ingredientes directos a subreceta_ingredientes
//   4. Recalcula la subreceta (costo_total, costo_por_100g)
//   5. Hard-delete del producto (cascade borra producto_ingredientes)
//
// Nota sobre histórico: los registros de produccion (`produccion_registros`)
// que tenian el nombre del producto, ahora se atribuyen a la subreceta nueva
// porque el match es por nombre. Esto es coherente con el comportamiento del sistema.
router.post(
  '/:id/convert-to-subreceta',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rendimiento_gramos, tipo_rendimiento, confirmar_subrecetas_anidadas } = req.body;

    // Validaciones de entrada
    const rend = parseFloat(rendimiento_gramos);
    if (isNaN(rend) || rend <= 0) {
      return error(res, 'rendimiento_gramos debe ser mayor a 0');
    }
    if (tipo_rendimiento !== 'gramos' && tipo_rendimiento !== 'porciones') {
      return error(res, 'tipo_rendimiento debe ser "gramos" o "porciones"');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Leer producto
      const [prodRows] = await conn.query(
        'SELECT id, nombre, notas FROM productos WHERE id = ? AND activo = 1',
        [id]
      );
      if (prodRows.length === 0) {
        await conn.rollback();
        return error(res, 'Producto no encontrado', 404);
      }
      const prod = prodRows[0];

      // 2. Verificar que el nombre no exista ya en subrecetas
      const [dupRows] = await conn.query(
        'SELECT id FROM subrecetas WHERE nombre = ? AND activo = 1',
        [prod.nombre]
      );
      if (dupRows.length > 0) {
        await conn.rollback();
        return error(res, `Ya existe una subreceta activa con el nombre "${prod.nombre}". Renombra primero el producto o la subreceta existente.`);
      }

      // 3. Leer ingredientes (separar directos vs subrecetas anidadas)
      const [ingDirectos] = await conn.query(
        `SELECT ingrediente_id, cantidad, unidad
         FROM producto_ingredientes
         WHERE producto_id = ? AND ingrediente_id IS NOT NULL`,
        [id]
      );
      const [subAnidadas] = await conn.query(
        `SELECT pi.subreceta_id, pi.cantidad, s.nombre AS subreceta_nombre
         FROM producto_ingredientes pi
         JOIN subrecetas s ON s.id = pi.subreceta_id
         WHERE pi.producto_id = ? AND pi.subreceta_id IS NOT NULL`,
        [id]
      );

      if (ingDirectos.length === 0 && subAnidadas.length === 0) {
        await conn.rollback();
        return error(res, 'El producto no tiene ingredientes para convertir');
      }

      // 4. Si hay subrecetas anidadas y el usuario no confirmo, abortar con info util
      if (subAnidadas.length > 0 && !confirmar_subrecetas_anidadas) {
        await conn.rollback();
        return error(
          res,
          `El producto contiene ${subAnidadas.length} subreceta(s) anidada(s) que NO se incluiran en la subreceta nueva (las subrecetas no soportan otras subrecetas adentro). Confirma la operacion explicitamente para continuar.`,
          409
        );
      }

      if (ingDirectos.length === 0) {
        await conn.rollback();
        return error(res, 'El producto solo tiene subrecetas anidadas y ningun ingrediente directo. No se puede convertir.');
      }

      // 5. Crear la subreceta
      const [subInsert] = await conn.query(
        `INSERT INTO subrecetas (nombre, rendimiento_gramos, tipo_rendimiento, notas)
         VALUES (?, ?, ?, ?)`,
        [prod.nombre, rend, tipo_rendimiento, prod.notas || null]
      );
      const newSubrecetaId = subInsert.insertId;

      // 6. Copiar ingredientes directos
      for (const item of ingDirectos) {
        await conn.query(
          `INSERT INTO subreceta_ingredientes (subreceta_id, ingrediente_id, cantidad, unidad)
           VALUES (?, ?, ?, ?)`,
          [newSubrecetaId, item.ingrediente_id, item.cantidad, item.unidad || 'g']
        );
      }

      // 7. Recalcular costo
      await recalculateSubreceta(conn, newSubrecetaId);

      // 8. Hard delete del producto (cascade borra producto_ingredientes)
      await conn.query('DELETE FROM productos WHERE id = ?', [id]);

      await conn.commit();

      // Devolver la subreceta nueva
      const [newSub] = await pool.query(
        'SELECT * FROM subrecetas WHERE id = ?',
        [newSubrecetaId]
      );

      success(res, {
        subreceta: newSub[0],
        ingredientes_copiados: ingDirectos.length,
        subrecetas_anidadas_descartadas: subAnidadas.map((s) => s.subreceta_nombre),
        message: `Producto "${prod.nombre}" convertido a subreceta`,
      }, 201);
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

    const [result] = await pool.query(
      'UPDATE productos SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Producto no encontrado', 404);
    }

    success(res, { message: 'Producto eliminado' });
  })
);

module.exports = router;
