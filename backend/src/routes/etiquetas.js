const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');
const { JOIN_CATEGORIAS, CARTA_CATEGORIA } = require('../utils/categoriaSql');
const { normalizarLista, desdeTextoCarta, aTextoCarta } = require('../utils/etiquetas');
const { invalidarCatalogo } = require('../modules/pedidosPersonalizados/catalogo');

// ============================================================================
// ETIQUETAS: vista unica de las etiquetas que se usan en la Carta y en Pedidos
// personalizados, con cuantos productos tiene cada una, y para etiquetar
// productos desde un solo lugar. Las etiquetas no tienen tabla propia: viven
// en cada producto (ver utils/etiquetas.js).
// ============================================================================

// GET / - etiquetas en uso (con conteo) + productos con sus etiquetas
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [carta] = await pool.query(
      `SELECT ci.id, ci.nombre, ci.imagen, ci.etiqueta, ${CARTA_CATEGORIA} AS categoria
       FROM carta_items ci
       LEFT JOIN productos p ON p.id = ci.producto_id
       ${JOIN_CATEGORIAS('p')}
       LEFT JOIN ofertas o ON o.id = ci.oferta_id
       WHERE ci.activo = 1
       ORDER BY ci.nombre`
    );
    const [personalizados] = await pool.query(
      'SELECT id, nombre, imagen, categoria, etiquetas FROM pp_productos WHERE activo = 1 ORDER BY nombre'
    );

    const items = [
      ...carta.map((c) => ({
        origen: 'carta', id: c.id, nombre: c.nombre, imagen: c.imagen || null,
        categoria: c.categoria || null, etiquetas: desdeTextoCarta(c.etiqueta),
      })),
      ...personalizados.map((p) => ({
        origen: 'personalizado', id: p.id, nombre: p.nombre, imagen: p.imagen || null,
        categoria: p.categoria || null, etiquetas: normalizarLista(p.etiquetas),
      })),
    ];

    const conteo = new Map();
    for (const it of items) {
      for (const e of it.etiquetas) {
        if (!conteo.has(e)) conteo.set(e, { nombre: e, carta: 0, personalizados: 0 });
        conteo.get(e)[it.origen === 'carta' ? 'carta' : 'personalizados']++;
      }
    }
    const etiquetas = [...conteo.values()]
      .map((e) => ({ ...e, total: e.carta + e.personalizados }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));

    success(res, { etiquetas, items });
  })
);

// PUT /renombrar { de, a } - renombra una etiqueta en TODOS los productos que la
// tienen. Si `a` ya existe, quedan unidas (ej. "ALTO EN FIBRAS" -> "ALTO EN
// FIBRA"). Va antes de /:origen/:id para que "renombrar" no se tome como origen.
router.put(
  '/renombrar',
  asyncHandler(async (req, res) => {
    const [de] = normalizarLista([req.body?.de]);
    const [a] = normalizarLista([req.body?.a]);
    if (!de || !a) return error(res, 'Falta la etiqueta actual o la nueva');
    if (de === a) return success(res, { de, a, carta: 0, personalizados: 0 });

    const reemplazar = (lista) => normalizarLista(lista.map((e) => (e === de ? a : e)));
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      let carta = 0;
      let personalizados = 0;

      const [items] = await conn.query("SELECT id, etiqueta FROM carta_items WHERE etiqueta IS NOT NULL AND etiqueta <> ''");
      for (const it of items) {
        const lista = desdeTextoCarta(it.etiqueta);
        if (!lista.includes(de)) continue;
        await conn.query('UPDATE carta_items SET etiqueta = ? WHERE id = ?', [aTextoCarta(reemplazar(lista)), it.id]);
        carta++;
      }

      const [prods] = await conn.query('SELECT id, etiquetas FROM pp_productos WHERE etiquetas IS NOT NULL');
      for (const p of prods) {
        const lista = normalizarLista(p.etiquetas);
        if (!lista.includes(de)) continue;
        await conn.query('UPDATE pp_productos SET etiquetas = ? WHERE id = ?', [JSON.stringify(reemplazar(lista)), p.id]);
        personalizados++;
      }

      await conn.commit();
      if (personalizados) invalidarCatalogo();
      success(res, { de, a, carta, personalizados });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// PUT /:origen/:id - reemplaza las etiquetas de un producto
// origen: 'carta' (item de la Carta) | 'personalizado' (Pedidos personalizados)
router.put(
  '/:origen/:id',
  asyncHandler(async (req, res) => {
    const { origen } = req.params;
    const id = Number(req.params.id);
    if (!Array.isArray(req.body?.etiquetas)) return error(res, 'etiquetas tiene que ser una lista');
    const etiquetas = normalizarLista(req.body.etiquetas);

    if (origen === 'carta') {
      const texto = aTextoCarta(etiquetas);
      if (texto && texto.length > 255) return error(res, 'Demasiadas etiquetas para este item de la carta');
      const [r] = await pool.query('UPDATE carta_items SET etiqueta = ? WHERE id = ? AND activo = 1', [texto, id]);
      if (!r.affectedRows) return error(res, 'Item de carta no encontrado', 404);
    } else if (origen === 'personalizado') {
      const [r] = await pool.query(
        'UPDATE pp_productos SET etiquetas = ? WHERE id = ? AND activo = 1', [JSON.stringify(etiquetas), id]
      );
      if (!r.affectedRows) return error(res, 'Producto no encontrado', 404);
      invalidarCatalogo(); // el catalogo del POS lleva las etiquetas
    } else {
      return error(res, 'Origen invalido');
    }

    success(res, { origen, id, etiquetas });
  })
);

module.exports = router;
