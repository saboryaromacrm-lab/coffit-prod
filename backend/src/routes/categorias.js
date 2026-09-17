const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// ============================================================
// INGREDIENT CATEGORIES
// ============================================================

// GET /ingredientes - List active ingredient categories
router.get(
  '/ingredientes',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM categorias_ingredientes WHERE activo = 1 ORDER BY nombre'
    );
    success(res, rows);
  })
);

// POST /ingredientes - Create ingredient category
router.post(
  '/ingredientes',
  asyncHandler(async (req, res) => {
    const { nombre, color } = req.body;

    if (!nombre) {
      return error(res, 'El nombre es requerido');
    }

    const [result] = await pool.query(
      'INSERT INTO categorias_ingredientes (nombre, color) VALUES (?, ?)',
      [nombre, color || null]
    );

    const [newRow] = await pool.query(
      'SELECT * FROM categorias_ingredientes WHERE id = ?',
      [result.insertId]
    );

    success(res, newRow[0], 201);
  })
);

// PUT /ingredientes/:id - Update ingredient category
router.put(
  '/ingredientes/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { nombre, color } = req.body;

    if (!nombre) {
      return error(res, 'El nombre es requerido');
    }

    const [result] = await pool.query(
      'UPDATE categorias_ingredientes SET nombre = ?, color = ? WHERE id = ? AND activo = 1',
      [nombre, color || null, id]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Categoria no encontrada', 404);
    }

    const [updated] = await pool.query(
      'SELECT * FROM categorias_ingredientes WHERE id = ?',
      [id]
    );

    success(res, updated[0]);
  })
);

// DELETE /ingredientes/:id - Soft delete ingredient category
router.delete(
  '/ingredientes/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [result] = await pool.query(
      'UPDATE categorias_ingredientes SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Categoria no encontrada', 404);
    }

    success(res, { message: 'Categoria eliminada' });
  })
);

// ============================================================
// PRODUCT CATEGORIES (jerarquia de 2 niveles: raiz -> subcategoria)
//
// parent_id NULL = categoria raiz | parent_id NOT NULL = subcategoria.
// Cambiarle el parent_id a una categoria existente ES la accion
// "convertir en subcategoria de X": sus productos viajan solos porque
// apuntan a la FILA, no al nombre. No se toca ni un producto.
// ============================================================

// Valida y normaliza el parent_id recibido. Devuelve { parentId } o { err }.
// Reglas (garantizan profundidad maxima = 2 y evitan ciclos):
//   - null/'' -> categoria raiz
//   - el padre debe existir y estar activo
//   - el padre debe ser RAIZ (no se permite nieto)
//   - no puede ser su propio padre
//   - si la categoria YA tiene hijas, no puede volverse hija
async function resolverParent(parentIdRaw, selfId = null) {
  if (parentIdRaw === undefined || parentIdRaw === null || parentIdRaw === '') {
    return { parentId: null };
  }
  const parentId = parseInt(parentIdRaw, 10);
  if (!Number.isInteger(parentId) || parentId <= 0) return { err: 'parent_id invalido' };
  if (selfId !== null && parentId === Number(selfId)) {
    return { err: 'Una categoria no puede ser subcategoria de si misma' };
  }

  const [padre] = await pool.query(
    'SELECT id, nombre, parent_id FROM categorias_productos WHERE id = ? AND activo = 1',
    [parentId]
  );
  if (padre.length === 0) return { err: 'La categoria padre no existe' };
  if (padre[0].parent_id !== null) {
    return { err: `"${padre[0].nombre}" ya es una subcategoria. Solo se admiten 2 niveles.` };
  }

  if (selfId !== null) {
    // Sin filtrar por activo a proposito: el DELETE desengancha a la hija
    // (parent_id = NULL), asi que si algo sigue apuntando aca es una hija real.
    // Filtrar por activo dejaria pasar una cadena de 3 niveles con una hija
    // borrada en el medio, y esos productos se agruparian bajo una categoria
    // que ya no es raiz (romperia la regla de oro).
    const [hijas] = await pool.query(
      'SELECT COUNT(*) AS n FROM categorias_productos WHERE parent_id = ?',
      [selfId]
    );
    if (hijas[0].n > 0) {
      return { err: `Esta categoria tiene ${hijas[0].n} subcategoria(s). Movelas o eliminalas antes de convertirla en subcategoria.` };
    }
  }

  return { parentId };
}

// GET /productos - Lista plana ordenada como arbol (raiz seguida de sus hijas).
// El front arma la jerarquia con parent_id; asi seguimos con UNA sola query.
router.get(
  '/productos',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT c.*, pa.nombre AS parent_nombre
       FROM categorias_productos c
       LEFT JOIN categorias_productos pa ON pa.id = c.parent_id AND pa.activo = 1
       WHERE c.activo = 1
       ORDER BY COALESCE(pa.orden, c.orden), COALESCE(pa.nombre, c.nombre),
                (c.parent_id IS NOT NULL), c.orden, c.nombre`
    );
    success(res, rows);
  })
);

// POST /productos - Create product category (o subcategoria si viene parent_id)
router.post(
  '/productos',
  asyncHandler(async (req, res) => {
    const { nombre, icono, color, orden, parent_id } = req.body;

    if (!nombre) {
      return error(res, 'El nombre es requerido');
    }

    const { parentId, err } = await resolverParent(parent_id);
    if (err) return error(res, err);

    const [result] = await pool.query(
      'INSERT INTO categorias_productos (nombre, parent_id, icono, color, orden) VALUES (?, ?, ?, ?, ?)',
      [nombre, parentId, icono || null, color || null, orden || 0]
    );

    const [newRow] = await pool.query(
      'SELECT * FROM categorias_productos WHERE id = ?',
      [result.insertId]
    );

    success(res, newRow[0], 201);
  })
);

// PUT /productos/:id - Update. Cambiar parent_id convierte la categoria en
// subcategoria (o la devuelve a raiz mandando null).
router.put(
  '/productos/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { nombre, icono, color, orden, parent_id } = req.body;

    if (!nombre) {
      return error(res, 'El nombre es requerido');
    }

    // parent_id AUSENTE = "no tocar la jerarquia" (protege contra que un
    // cliente que no conoce el campo aplane una subcategoria sin querer).
    // parent_id: null EXPLICITO = convertir en categoria principal.
    let parentIdFinal;
    if (parent_id === undefined) {
      const [cur] = await pool.query('SELECT parent_id FROM categorias_productos WHERE id = ?', [id]);
      if (cur.length === 0) return error(res, 'Categoria no encontrada', 404);
      parentIdFinal = cur[0].parent_id;
    } else {
      const { parentId, err } = await resolverParent(parent_id, id);
      if (err) return error(res, err);
      parentIdFinal = parentId;
    }

    const [result] = await pool.query(
      `UPDATE categorias_productos
       SET nombre = ?, parent_id = ?, icono = ?, color = ?, orden = ?
       WHERE id = ? AND activo = 1`,
      [nombre, parentIdFinal, icono || null, color || null, orden || 0, id]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Categoria no encontrada', 404);
    }

    const [updated] = await pool.query(
      'SELECT * FROM categorias_productos WHERE id = ?',
      [id]
    );

    success(res, updated[0]);
  })
);

// DELETE /productos/:id - Soft delete, sin dejar nada colgando.
//
// El problema a evitar: si se borra la fila y quedan productos apuntandola, el
// JOIN los sigue resolviendo contra una categoria muerta -> aparece una
// "categoria fantasma" en la Carta y en el MENU PUBLICO, imposible de limpiar
// desde la app (el select ya no ofrece esa opcion).
//
// Reglas:
//   - Con subcategorias activas -> bloqueado (habria que decidir por el usuario).
//   - SUBCATEGORIA con productos -> los productos SUBEN al padre. No se pierde
//     nada: siguen en la misma categoria, solo sin el detalle.
//   - RAIZ con productos -> bloqueado: dejarlos sin categoria seria una decision
//     silenciosa sobre datos que el usuario no pidio.
//   - Al borrar, se desengancha del padre (parent_id = NULL) para que no siga
//     contando como hija.
router.delete(
  '/productos/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [catRows] = await pool.query(
      'SELECT id, nombre, parent_id FROM categorias_productos WHERE id = ? AND activo = 1',
      [id]
    );
    if (catRows.length === 0) return error(res, 'Categoria no encontrada', 404);
    const cat = catRows[0];

    const [hijas] = await pool.query(
      'SELECT nombre FROM categorias_productos WHERE parent_id = ? AND activo = 1',
      [id]
    );
    if (hijas.length > 0) {
      return error(
        res,
        `No se puede eliminar: tiene ${hijas.length} subcategoria(s) (${hijas.map((h) => h.nombre).join(', ')}). Eliminalas o movelas primero.`,
        409
      );
    }

    const [[{ n: productos }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM productos WHERE categoria_id = ? AND activo = 1',
      [id]
    );

    // Raiz con productos: no se decide por el usuario.
    if (productos > 0 && cat.parent_id === null) {
      return error(
        res,
        `No se puede eliminar: hay ${productos} producto(s) en "${cat.nombre}". Reasignalos a otra categoria primero.`,
        409
      );
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Subcategoria con productos: suben al padre (misma categoria, sin detalle)
      if (productos > 0 && cat.parent_id !== null) {
        await conn.query(
          'UPDATE productos SET categoria_id = ? WHERE categoria_id = ? AND activo = 1',
          [cat.parent_id, id]
        );
      }

      await conn.query(
        'UPDATE categorias_productos SET activo = 0, parent_id = NULL WHERE id = ? AND activo = 1',
        [id]
      );

      await conn.commit();
      success(res, {
        message: productos > 0 && cat.parent_id !== null
          ? `Subcategoria eliminada. ${productos} producto(s) pasaron a la categoria principal.`
          : 'Categoria eliminada',
        productos_movidos: cat.parent_id !== null ? productos : 0,
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

module.exports = router;
