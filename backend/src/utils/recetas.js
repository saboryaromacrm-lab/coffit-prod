const pool = require('../config/db');

/**
 * Helper: lineas de receta de VARIOS productos de una sola vez.
 * Devuelve Map<productoId, items[]>, con las lineas de cada producto en el
 * mismo orden de siempre: ingredientes, despues subrecetas, despues manuales.
 *
 * Antes se consultaba producto por producto (3 queries por cada uno). Con
 * ~180 productos eso eran mas de 500 idas y vueltas a la base en fila y hacia
 * que la lista tardara ~300ms mientras el resto de la API responde en ~20ms.
 * Ahora son 3 queries en total, sin importar cuantos productos haya.
 */
async function getIngredientesDeProductos(productoIdsCrudos) {
  // Normalizado a numero: el id puede llegar como texto (en el PUT viene de
  // req.params) y la base devuelve producto_id como numero. Para un Map "85"
  // y 85 son claves distintas, asi que sin esto el agrupado no encontraba el
  // producto y editar uno con receta fallaba despues de haber guardado.
  const productoIds = productoIdsCrudos.map(Number);
  const porProducto = new Map(productoIds.map((id) => [id, []]));
  if (productoIds.length === 0) return porProducto;

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
     WHERE pi.producto_id IN (?) AND pi.ingrediente_id IS NOT NULL
     ORDER BY pi.producto_id, pi.id`,
    [productoIds]
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
     WHERE pi.producto_id IN (?) AND pi.subreceta_id IS NOT NULL
     ORDER BY pi.producto_id, pi.id`,
    [productoIds]
  );

  // Items manuales: costo puntual cargado a mano, sin catalogo detras.
  // Se devuelven con la misma forma que los otros para que el front los
  // muestre en la misma tabla (tipo los distingue).
  const [manuales] = await pool.query(
    `SELECT pi.id, pi.producto_id, pi.ingrediente_id, pi.subreceta_id,
            pi.cantidad,
            COALESCE(pi.unidad, 'u') AS unidad,
            pi.nombre_manual AS nombre,
            pi.costo_manual AS costo_unitario,
            'manual' AS tipo
     FROM producto_ingredientes pi
     WHERE pi.producto_id IN (?)
       AND pi.ingrediente_id IS NULL AND pi.subreceta_id IS NULL
       AND pi.costo_manual IS NOT NULL
     ORDER BY pi.producto_id, pi.id`,
    [productoIds]
  );

  // Se agregan por tipo en este orden para respetar el orden de siempre.
  for (const fila of [...ings, ...subs, ...manuales]) {
    porProducto.get(Number(fila.producto_id)).push(fila);
  }
  return porProducto;
}

// Lineas de receta de UN producto (misma logica, un solo id).
async function getProductoIngredientes(productoId) {
  return (await getIngredientesDeProductos([productoId])).get(Number(productoId));
}

module.exports = { getIngredientesDeProductos, getProductoIngredientes };
