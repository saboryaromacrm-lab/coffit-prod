const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');
const V = require('../utils/cartaVariantes');
const { getIngredientesDeProductos } = require('../utils/recetas');
const { JOIN_CATEGORIAS, CARTA_CATEGORIA, CARTA_SUBCATEGORIA } = require('../utils/categoriaSql');

// ============================================================================
// CHECKLIST DE CONTROL DE LA CARTA
// Recorre la carta item por item para verificar que cada producto se hace como
// corresponde. Muestra lo necesario para comparar (foto, receta y como se
// prepara) y NUNCA costos: lo usa gente de afuera por su link de colaborador.
//
// Entran los mismos items que ve el cliente en el menu: activos, no pausados,
// y si son un combo/box, solo con la promo activa. Desde la app se pueden
// excluir productos o categorias enteras: se devuelven igual marcados
// (excluido / categoria_excluida) y el front decide que mostrar.
// ============================================================================

const MAX_OBSERVACION = 1000;

// GET / - items de la carta con su receta y el estado del control
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [filas] = await pool.query(
      `SELECT ci.id, ci.producto_id, ci.oferta_id, ci.imagen, ci.descripcion,
              COALESCE(p.nombre, o.nombre, ci.nombre) AS nombre,
              ${CARTA_CATEGORIA} AS categoria,
              ${CARTA_SUBCATEGORIA} AS subcategoria,
              p.preparacion, p.coccion, p.tener_en_cuenta,
              ch.hecho, ch.observacion, ch.excluido, ch.actualizado_por, ch.actualizado_en
       FROM carta_items ci
       LEFT JOIN productos p ON p.id = ci.producto_id AND p.activo = 1
       ${JOIN_CATEGORIAS('p')}
       LEFT JOIN ofertas o ON o.id = ci.oferta_id AND o.activo = 1
       LEFT JOIN carta_checklist ch ON ch.carta_item_id = ci.id
       WHERE ci.activo = 1 AND (ci.desactivar = 0 OR ci.desactivar IS NULL)
         AND (ci.oferta_id IS NULL OR o.estado = 'activa')
       ORDER BY ci.orden ASC, nombre ASC`
    );

    // Recetas de todos los productos en una sola tanda. Solo nombre, cantidad
    // y unidad: el costo se queda en el servidor.
    const productoIds = filas.map((f) => f.producto_id).filter((id) => id != null);
    const recetas = await getIngredientesDeProductos(productoIds);
    const promos = await V.getPromosMap(pool, filas.map((f) => f.oferta_id).filter((id) => id != null));
    const [catExcluidas] = await pool.query('SELECT categoria FROM carta_checklist_categorias_excluidas');
    const excluidas = new Set(catExcluidas.map((c) => c.categoria));

    const items = filas.map((f) => {
      const esProducto = f.producto_id != null && recetas.has(Number(f.producto_id));
      const promo = f.oferta_id != null ? promos[f.oferta_id] : null;
      const categoria = f.categoria || 'Sin categoria';
      return {
        carta_item_id: f.id,
        nombre: f.nombre,
        categoria,
        // La categoria entera esta fuera del control (se excluye desde la app)
        categoria_excluida: excluidas.has(categoria),
        subcategoria: f.subcategoria || null,
        imagen: f.imagen || null,
        descripcion: f.descripcion || null,
        tipo: esProducto ? 'producto' : promo ? 'combo' : 'sin_receta',
        receta: esProducto
          ? recetas.get(Number(f.producto_id)).map((l) => ({
            nombre: l.nombre,
            cantidad: Number(l.cantidad),
            unidad: l.unidad,
            tipo: l.tipo,
          }))
          : [],
        // Combos/boxs: que productos lleva (no tienen receta propia)
        incluye: promo ? promo.productos.map((p) => ({ nombre: p.nombre, cantidad: p.cantidad, es_regalo: p.es_regalo })) : [],
        preparacion: f.preparacion || null,
        coccion: f.coccion || null,
        tener_en_cuenta: f.tener_en_cuenta || null,
        control: {
          hecho: !!f.hecho,
          observacion: f.observacion || '',
          excluido: !!f.excluido,
          actualizado_por: f.actualizado_por || null,
          actualizado_en: f.actualizado_en || null,
        },
      };
    });

    success(res, items);
  })
);

// PUT /categorias - excluye o vuelve a incluir una categoria completa.
// Va antes de /:cartaItemId para que "categorias" no se tome como un id.
// Solo desde la app: un link de colaborador no puede cambiar que se controla.
router.put(
  '/categorias',
  asyncHandler(async (req, res) => {
    const { categoria, excluida, key } = req.body;
    if (key) return error(res, 'Solo se puede excluir desde la app', 403);
    const nombre = String(categoria || '').trim().slice(0, 120);
    if (!nombre) return error(res, 'Categoria requerida');

    if (excluida) {
      await pool.query('INSERT IGNORE INTO carta_checklist_categorias_excluidas (categoria) VALUES (?)', [nombre]);
    } else {
      await pool.query('DELETE FROM carta_checklist_categorias_excluidas WHERE categoria = ?', [nombre]);
    }
    success(res, { categoria: nombre, excluida: !!excluida });
  })
);

// PUT /:cartaItemId - marca/desmarca, guarda la observacion o excluye un item.
// Solo pisa los campos que vienen: tildar no borra la observacion y viceversa.
router.put(
  '/:cartaItemId',
  asyncHandler(async (req, res) => {
    const cartaItemId = Number(req.params.cartaItemId);
    const { hecho, observacion, excluido, key } = req.body;

    if (hecho === undefined && observacion === undefined && excluido === undefined) {
      return error(res, 'Nada para guardar');
    }
    if (excluido !== undefined && key) return error(res, 'Solo se puede excluir desde la app', 403);

    const [[item]] = await pool.query('SELECT id FROM carta_items WHERE id = ? AND activo = 1', [cartaItemId]);
    if (!item) return error(res, 'Item de carta no encontrado', 404);

    // Quien marco: el colaborador del link, o la app si no vino link.
    let quien = 'Admin';
    if (key) {
      const [[colab]] = await pool.query(
        'SELECT nombre FROM colaboradores WHERE access_key = ? AND activo = 1', [String(key)]
      );
      if (!colab) return error(res, 'Acceso no valido', 403);
      quien = colab.nombre;
    }

    const obs = observacion === undefined ? undefined : String(observacion).trim().slice(0, MAX_OBSERVACION);
    // Excluir es configuracion, no un control: no cambia quien controlo ni
    // cuando (si no, un producto excluido pasaria a figurar "controlado por
    // Admin" con la fecha de la exclusion).
    const esControl = hecho !== undefined || obs !== undefined;

    await pool.query(
      `INSERT INTO carta_checklist (carta_item_id, hecho, observacion, excluido, actualizado_por)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         hecho = ${hecho === undefined ? 'hecho' : 'VALUES(hecho)'},
         observacion = ${obs === undefined ? 'observacion' : 'VALUES(observacion)'},
         excluido = ${excluido === undefined ? 'excluido' : 'VALUES(excluido)'},
         actualizado_por = ${esControl ? 'VALUES(actualizado_por)' : 'actualizado_por'},
         actualizado_en = ${esControl ? 'CURRENT_TIMESTAMP' : 'actualizado_en'}`,
      [cartaItemId, hecho ? 1 : 0, obs || null, excluido ? 1 : 0, esControl ? quien : null]
    );

    const [[fila]] = await pool.query(
      'SELECT hecho, observacion, excluido, actualizado_por, actualizado_en FROM carta_checklist WHERE carta_item_id = ?',
      [cartaItemId]
    );
    success(res, {
      hecho: !!fila.hecho,
      observacion: fila.observacion || '',
      excluido: !!fila.excluido,
      actualizado_por: fila.actualizado_por,
      actualizado_en: fila.actualizado_en,
    });
  })
);

module.exports = router;
