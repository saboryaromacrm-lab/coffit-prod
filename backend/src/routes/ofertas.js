const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// Categorias fijas de carta para una promo (whitelist, evita guardar basura)
const CATEGORIAS_CARTA = ['Promo', 'Combo', 'Boxs'];
const normCategoriaCarta = (v) => (CATEGORIAS_CARTA.includes(v) ? v : 'Promo');

// Subcategoria opcional de carta (texto libre, ej: 'Boxs > Para regalar').
// La Carta y el menu publico ya la heredan; todavia no hay campo en el editor.
const normSubcategoriaCarta = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, 60) : null;
};

// Normaliza la lista de productos a [{ id, cantidad, rol, descuento_pct }]
// Acepta formato viejo (array de ids u objetos sin rol) o nuevo (con rol/descuento).
// rol: 'pago' (default) | 'regalo'. descuento_pct solo aplica a regalo (100 = gratis).
function normalizarProductos(productos) {
  if (!Array.isArray(productos)) return [];
  return productos
    .map((p) => {
      if (typeof p === 'number') return { id: p, cantidad: 1, rol: 'pago', descuento_pct: 100 };
      if (p && typeof p === 'object' && p.id) {
        const cant = parseFloat(p.cantidad);
        const desc = parseFloat(p.descuento_pct);
        return {
          id: Number(p.id),
          cantidad: isNaN(cant) || cant <= 0 ? 1 : cant,
          rol: p.rol === 'regalo' ? 'regalo' : 'pago',
          descuento_pct: isNaN(desc) || desc < 0 ? 100 : Math.min(100, desc),
        };
      }
      return null;
    })
    .filter((x) => x != null);
}

// GET / - List offers with products
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Auto-expire offers past their end date
    await pool.query(
      `UPDATE ofertas SET estado = 'vencida'
       WHERE fecha_fin < CURDATE() AND estado = 'activa' AND activo = 1`
    );

    // Auto-activate programmed offers
    await pool.query(
      `UPDATE ofertas SET estado = 'activa'
       WHERE fecha_inicio <= CURDATE() AND fecha_fin >= CURDATE() AND estado = 'programada' AND activo = 1`
    );

    const [ofertas] = await pool.query(
      'SELECT * FROM ofertas WHERE activo = 1 ORDER BY created_at DESC'
    );

    for (const oferta of ofertas) {
      const [prods] = await pool.query(
        `SELECT p.id, p.nombre, p.precio_publico, p.precio_pedidosya, p.costo_total,
                COALESCE(op.cantidad, 1) AS cantidad,
                COALESCE(op.rol, 'pago') AS rol,
                COALESCE(op.descuento_pct, 100) AS descuento_pct
         FROM oferta_productos op
         JOIN productos p ON op.producto_id = p.id
         WHERE op.oferta_id = ?`,
        [oferta.id]
      );
      oferta.productos = prods.map((p) => ({
        ...p,
        cantidad: Number(p.cantidad),
        descuento_pct: Number(p.descuento_pct),
      }));
    }

    success(res, ofertas);
  })
);

// POST / - Create offer
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nombre, tipo, valor, categoria_carta, subcategoria_carta, descripcion, fecha_inicio, fecha_fin, estado, productos } = req.body;

    if (!nombre) return error(res, 'Nombre es requerido');
    if (!tipo) return error(res, 'Tipo es requerido');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO ofertas (nombre, tipo, categoria_carta, subcategoria_carta, valor, descripcion, fecha_inicio, fecha_fin, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, tipo, normCategoriaCarta(categoria_carta), normSubcategoriaCarta(subcategoria_carta), valor || 0, descripcion || null, fecha_inicio || null, fecha_fin || null, estado || 'activa']
      );

      const ofertaId = result.insertId;

      const productosNorm = normalizarProductos(productos);
      if (productosNorm.length > 0) {
        const values = productosNorm.map((p) => [ofertaId, p.id, p.cantidad, p.rol, p.descuento_pct]);
        await conn.query(
          'INSERT INTO oferta_productos (oferta_id, producto_id, cantidad, rol, descuento_pct) VALUES ?',
          [values]
        );
      }

      await conn.commit();

      const [newOffer] = await pool.query('SELECT * FROM ofertas WHERE id = ?', [ofertaId]);
      const [prods] = await pool.query(
        `SELECT p.id, p.nombre, COALESCE(op.cantidad, 1) AS cantidad
         FROM oferta_productos op
         JOIN productos p ON op.producto_id = p.id WHERE op.oferta_id = ?`,
        [ofertaId]
      );
      newOffer[0].productos = prods.map((p) => ({ ...p, cantidad: Number(p.cantidad) }));

      success(res, newOffer[0], 201);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// PUT /:id - Update offer
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { nombre, tipo, valor, categoria_carta, subcategoria_carta, descripcion, fecha_inicio, fecha_fin, estado, productos } = req.body;

    if (!nombre) return error(res, 'Nombre es requerido');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // subcategoria_carta AUSENTE = "no tocar". El editor de Promos todavia no
      // manda el campo: si lo pisaramos con NULL, cualquier edicion de la promo
      // borraria la subcategoria en silencio. null EXPLICITO si la limpia.
      const tocaSubcat = subcategoria_carta !== undefined;
      const [result] = await conn.query(
        `UPDATE ofertas SET nombre = ?, tipo = ?, categoria_carta = ?,${tocaSubcat ? ' subcategoria_carta = ?,' : ''} valor = ?, descripcion = ?,
         fecha_inicio = ?, fecha_fin = ?, estado = ?
         WHERE id = ? AND activo = 1`,
        [
          nombre, tipo, normCategoriaCarta(categoria_carta),
          ...(tocaSubcat ? [normSubcategoriaCarta(subcategoria_carta)] : []),
          valor || 0, descripcion || null, fecha_inicio || null, fecha_fin || null, estado || 'activa', id,
        ]
      );

      if (result.affectedRows === 0) {
        await conn.rollback();
        return error(res, 'Oferta no encontrada', 404);
      }

      // Replace product associations
      await conn.query('DELETE FROM oferta_productos WHERE oferta_id = ?', [id]);

      const productosNorm = normalizarProductos(productos);
      if (productosNorm.length > 0) {
        const values = productosNorm.map((p) => [id, p.id, p.cantidad, p.rol, p.descuento_pct]);
        await conn.query(
          'INSERT INTO oferta_productos (oferta_id, producto_id, cantidad, rol, descuento_pct) VALUES ?',
          [values]
        );
      }

      await conn.commit();

      const [updated] = await pool.query('SELECT * FROM ofertas WHERE id = ?', [id]);
      const [prods] = await pool.query(
        `SELECT p.id, p.nombre, COALESCE(op.cantidad, 1) AS cantidad
         FROM oferta_productos op
         JOIN productos p ON op.producto_id = p.id WHERE op.oferta_id = ?`,
        [id]
      );
      updated[0].productos = prods.map((p) => ({ ...p, cantidad: Number(p.cantidad) }));

      success(res, updated[0]);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// DELETE /:id - Soft delete (bloqueado si esta en la carta)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Guardia: si un item de carta esta mapeado a esta promo, no se puede
    // borrar (quedaria un mapeo roto en el menu). Desmapear primero.
    try {
      const [uso] = await pool.query(
        'SELECT nombre FROM carta_items WHERE oferta_id = ? AND activo = 1 LIMIT 1',
        [id]
      );
      if (uso.length > 0) {
        return error(res, `No se puede eliminar: esta promo esta en la carta como "${uso[0].nombre}". Desmapeala o elimina ese item de carta primero.`);
      }
    } catch (e) {
      // Tabla/columna de carta inexistente -> sin guardia, seguir normal.
    }

    const [result] = await pool.query(
      'UPDATE ofertas SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Oferta no encontrada', 404);
    }

    success(res, { message: 'Oferta eliminada' });
  })
);

module.exports = router;
