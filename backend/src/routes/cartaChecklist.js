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
// y si son un combo/box, solo con la promo activa.
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
              ch.hecho, ch.observacion, ch.actualizado_por, ch.actualizado_en
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

    const items = filas.map((f) => {
      const esProducto = f.producto_id != null && recetas.has(Number(f.producto_id));
      const promo = f.oferta_id != null ? promos[f.oferta_id] : null;
      return {
        carta_item_id: f.id,
        nombre: f.nombre,
        categoria: f.categoria || 'Sin categoria',
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
          actualizado_por: f.actualizado_por || null,
          actualizado_en: f.actualizado_en || null,
        },
      };
    });

    success(res, items);
  })
);

// PUT /:cartaItemId - marca/desmarca y/o guarda la observacion de un item.
// Solo pisa los campos que vienen: tildar no borra la observacion y viceversa.
router.put(
  '/:cartaItemId',
  asyncHandler(async (req, res) => {
    const cartaItemId = Number(req.params.cartaItemId);
    const { hecho, observacion, key } = req.body;

    if (hecho === undefined && observacion === undefined) {
      return error(res, 'Nada para guardar');
    }

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

    await pool.query(
      `INSERT INTO carta_checklist (carta_item_id, hecho, observacion, actualizado_por)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         hecho = ${hecho === undefined ? 'hecho' : 'VALUES(hecho)'},
         observacion = ${obs === undefined ? 'observacion' : 'VALUES(observacion)'},
         actualizado_por = VALUES(actualizado_por)`,
      [cartaItemId, hecho ? 1 : 0, obs || null, quien]
    );

    const [[fila]] = await pool.query(
      'SELECT hecho, observacion, actualizado_por, actualizado_en FROM carta_checklist WHERE carta_item_id = ?',
      [cartaItemId]
    );
    success(res, {
      hecho: !!fila.hecho,
      observacion: fila.observacion || '',
      actualizado_por: fila.actualizado_por,
      actualizado_en: fila.actualizado_en,
    });
  })
);

module.exports = router;
