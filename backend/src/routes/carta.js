const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');
const { calcularRentabilidadCanal } = require('../utils/mcNeto');
const V = require('../utils/cartaVariantes');
const {
  JOIN_CATEGORIAS, CAT_NOMBRE, SUBCAT_NOMBRE, CARTA_CATEGORIA, CARTA_SUBCATEGORIA,
} = require('../utils/categoriaSql');
const { rankearPorNombre } = require('../utils/similitud');

// =============================================================================
// CARTA
// La carta aporta el PRECIO DE VENTA (mostrador/local). El COSTO viene del
// producto mapeado manualmente (carta_items.producto_id). Con ambos se calcula
// la rentabilidad real por canal Local (tarjeta + efectivo).
//
// Items sin producto mapeado quedan "sin costo" (cafes, bebidas, merch) y se
// diferencian visualmente de los que si tienen costo.
// =============================================================================

// Devuelve los mejores productos candidatos para un nombre de carta.
// (la logica de similitud vive en utils/similitud, compartida con Sabor y Aroma)
function rankearProductos(nombreCarta, productos) {
  return rankearPorNombre(nombreCarta, productos, (p) => ({
    id: p.id,
    nombre: p.nombre,
    costo_total: parseFloat(p.costo_total) || 0,
    precio_publico: parseFloat(p.precio_publico) || 0,
    categoria_nombre: p.categoria_nombre || null,
  }));
}

// Construye resumen de canales LOCALES (tarjeta + efectivo) con sus conceptos.
async function getResumenLocal() {
  const out = {};
  for (const key of ['tarjeta', 'efectivo']) {
    const [chRows] = await pool.query(
      'SELECT * FROM canales_venta WHERE codigo = ? AND activo = 1',
      [key]
    );
    if (chRows.length === 0) { out[key] = { nombre: key, conceptos: [] }; continue; }
    const channel = chRows[0];
    const [linked] = await pool.query(
      `SELECT cc.porcentaje_override, c.*
       FROM conceptos_canales cc
       JOIN conceptos_costo c ON c.id = cc.concepto_id
       WHERE cc.canal_id = ? AND c.activo = 1`,
      [channel.id]
    );
    out[key] = {
      nombre: channel.nombre,
      conceptos: linked.map((lc) => ({
        id: lc.id,
        nombre: lc.nombre,
        tipo: lc.tipo,
        valor: lc.porcentaje_override !== null ? parseFloat(lc.porcentaje_override) : parseFloat(lc.porcentaje),
      })),
    };
  }
  return out;
}

// Enriquece un item de carta con valores EFECTIVOS (heredados del producto si
// esta mapeado), rentabilidad Local, variantes parseadas y estado "nuevo".
//
// UNIFICACION:
//  - mapeado -> nombre/categoria salen del producto (fuente de verdad).
//  - precio: si esta mapeado y precio_manual=0 -> usa precio_publico del producto;
//    si precio_manual=1 (override) o no esta mapeado -> usa precio_venta propio.
function enriquecer(item, resumenLocal, dias, hoy, promosMap, adicionesMap) {
  const precioManual = !!item.precio_manual;
  const precioVentaPropio = parseFloat(item.precio_venta) || 0;
  const precioProducto = item.producto_precio_publico != null ? parseFloat(item.producto_precio_publico) : null;

  // El item puede estar mapeado a una PROMO (oferta) o a un PRODUCTO (excluyentes).
  const promo = (item.oferta_id != null && promosMap) ? promosMap[item.oferta_id] : null;
  const mapeadoOferta = !!promo;
  const mapeadoProducto = !mapeadoOferta && item.producto_id != null && item.producto_nombre != null;
  const mapeado = mapeadoOferta || mapeadoProducto;
  const tipo_mapeo = mapeadoOferta ? 'oferta' : (mapeadoProducto ? 'producto' : null);

  // Precio heredado (del producto o del combo) y costo
  let precioInherido = null;
  let costo = null;
  if (mapeadoOferta) {
    precioInherido = promo.precio_combo;
    costo = promo.costo_combo;
  } else if (mapeadoProducto) {
    precioInherido = precioProducto;
    costo = parseFloat(item.costo_total) || 0;
  }

  // Precio efectivo (el que vale y se muestra)
  const usaInherido = mapeado && !precioManual && precioInherido != null;
  const precio_efectivo = usaInherido ? precioInherido : precioVentaPropio;

  // Nombre / categoria efectivos (ambos heredados en vivo del mapeo)
  const nombre_efectivo = mapeadoOferta ? promo.nombre
    : (mapeadoProducto ? item.producto_nombre : item.nombre);
  const categoria_efectiva = mapeadoOferta
    ? (promo.categoria_carta || item.categoria) // Promo | Combo | Boxs, definida en la promo
    : (mapeadoProducto ? (item.producto_categoria || item.categoria) : item.categoria);

  // Subcategoria efectiva. null es un valor legitimo ("sin subcategoria"), por
  // eso se elige por QUIEN manda y no con un fallback encadenado: si no, un
  // producto sin subcategoria mostraria el snapshot viejo del item.
  const subcategoria_efectiva = mapeadoOferta
    ? (promo.subcategoria_carta || null)
    : (mapeadoProducto ? (item.producto_subcategoria || null) : (item.subcategoria || null));

  const tieneCosto = costo !== null && costo > 0;

  let rentabilidad = null;
  if (tieneCosto) {
    rentabilidad = {
      tarjeta: calcularRentabilidadCanal(precio_efectivo, costo, resumenLocal.tarjeta?.conceptos || []),
      efectivo: calcularRentabilidadCanal(precio_efectivo, costo, resumenLocal.efectivo?.conceptos || []),
    };
  }

  const estado_mapeo = !mapeado
    ? 'sin_mapear'
    : (tieneCosto ? 'con_costo' : 'sin_costo'); // mapeado pero sin costo (>0)

  // Variantes (raw para edicion) + es_nuevo computado
  const tamanos = V.parseTamanos(item.tamanos);
  const toppings = V.parseToppings(item.toppings);
  const sabores = V.parseSabores(item.sabores).map((s) => ({
    ...s,
    es_nuevo: V.esNuevo(s.fecha_nuevo, dias, hoy),
  }));
  const fecha_lanzamiento = V.toDateStr(item.fecha_lanzamiento);
  const es_nuevo = V.esNuevo(fecha_lanzamiento, dias, hoy);
  const es_nuevo_total = es_nuevo || sabores.some((s) => s.es_nuevo);

  return {
    ...item,
    precio_venta: precioVentaPropio,   // raw (override manual)
    precio_manual: precioManual ? 1 : 0,
    precio_efectivo,                   // el precio que realmente vale
    precio_inherido: precioInherido,   // el que daria el producto/promo (para el toggle)
    nombre_efectivo,
    categoria_efectiva,
    subcategoria_efectiva,
    mapeado,
    tipo_mapeo,
    oferta_nombre: promo ? promo.nombre : null,
    oferta_estado: promo ? promo.estado : null,
    incluye: promo ? promo.productos : [],
    // Adiciones resueltas en vivo contra la seccion Productos
    adiciones: V.resolverAdiciones(item.adiciones, adicionesMap),
    costo_total: costo,
    tiene_costo: tieneCosto,
    estado_mapeo,
    rentabilidad,
    tamanos,
    sabores,
    toppings,
    fecha_lanzamiento,
    es_nuevo,
    es_nuevo_total,
  };
}

// =============================================================================
// GET / - lista de carta con filtros + rentabilidad Local
// Filtros: categoria, buscar, estado (sin_mapear|con_costo|sin_costo|mapeado),
//          incluir_desactivados (1)
// =============================================================================
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { categoria, subcategoria, buscar, estado, incluir_desactivados, solo_nuevos } = req.query;

    let sql = `
      SELECT ci.*,
             p.nombre AS producto_nombre,
             p.costo_total,
             p.precio_publico AS producto_precio_publico,
             ${CAT_NOMBRE} AS producto_categoria,
             ${SUBCAT_NOMBRE} AS producto_subcategoria
      FROM carta_items ci
      LEFT JOIN productos p ON p.id = ci.producto_id AND p.activo = 1
      ${JOIN_CATEGORIAS('p')}
      LEFT JOIN ofertas o ON o.id = ci.oferta_id AND o.activo = 1
      WHERE ci.activo = 1
    `;
    const params = [];

    // categoria/subcategoria/buscar trabajan sobre los valores EFECTIVOS
    // (producto -> su categoria raiz; promo -> categoria_carta; sino la propia)
    if (categoria) { sql += ` AND ${CARTA_CATEGORIA} = ?`; params.push(categoria); }
    // "__sin__" = los que no tienen subcategoria (para poder aislarlos)
    if (subcategoria === '__sin__') { sql += ` AND (${CARTA_SUBCATEGORIA}) IS NULL`; }
    else if (subcategoria) { sql += ` AND ${CARTA_SUBCATEGORIA} = ?`; params.push(subcategoria); }
    if (buscar) { sql += ' AND (ci.nombre LIKE ? OR p.nombre LIKE ? OR o.nombre LIKE ?)'; params.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`); }
    if (!incluir_desactivados) { sql += ' AND ci.desactivar = 0'; }

    sql += ` ORDER BY ${CARTA_CATEGORIA}, ${CARTA_SUBCATEGORIA} IS NOT NULL, ${CARTA_SUBCATEGORIA}, ci.orden, ci.nombre`;

    const [rows] = await pool.query(sql, params);
    const resumenLocal = await getResumenLocal();
    const dias = await V.getDiasNuevo(pool);
    const promosMap = await V.getPromosMap(pool, rows.map((r) => r.oferta_id));
    const adicionesMap = await V.getAdicionesMap(pool, V.collectAdicionIds(rows));
    const hoy = new Date();
    let items = rows.map((r) => enriquecer(r, resumenLocal, dias, hoy, promosMap, adicionesMap));

    // Filtro por estado de mapeo (post-calculo)
    if (estado === 'sin_mapear') items = items.filter((i) => i.estado_mapeo === 'sin_mapear');
    else if (estado === 'con_costo') items = items.filter((i) => i.estado_mapeo === 'con_costo');
    else if (estado === 'sin_costo') items = items.filter((i) => i.estado_mapeo === 'sin_costo');
    else if (estado === 'mapeado') items = items.filter((i) => i.mapeado);

    // Filtro "solo nuevos" (item por fecha o algun sabor nuevo)
    if (solo_nuevos === '1' || solo_nuevos === 'true') items = items.filter((i) => i.es_nuevo_total);

    success(res, items);
  })
);

// =============================================================================
// GET /resumen - estadisticas de la carta
// =============================================================================
router.get(
  '/resumen',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT ci.*,
              p.nombre AS producto_nombre,
              p.costo_total,
              p.precio_publico AS producto_precio_publico,
              ${CAT_NOMBRE} AS producto_categoria,
              ${SUBCAT_NOMBRE} AS producto_subcategoria
       FROM carta_items ci
       LEFT JOIN productos p ON p.id = ci.producto_id AND p.activo = 1
       ${JOIN_CATEGORIAS('p')}
       WHERE ci.activo = 1 AND ci.desactivar = 0`
    );
    const resumenLocal = await getResumenLocal();
    const dias = await V.getDiasNuevo(pool);
    const promosMap = await V.getPromosMap(pool, rows.map((r) => r.oferta_id));
    const adicionesMap = await V.getAdicionesMap(pool, V.collectAdicionIds(rows));
    const hoy = new Date();
    const items = rows.map((r) => enriquecer(r, resumenLocal, dias, hoy, promosMap, adicionesMap));

    const conCosto = items.filter((i) => i.estado_mapeo === 'con_costo');
    const sinMapear = items.filter((i) => i.estado_mapeo === 'sin_mapear');
    const sinCosto = items.filter((i) => i.estado_mapeo === 'sin_costo');

    // Margen promedio (MC neto tarjeta) de los items con costo
    const margenProm = conCosto.length > 0
      ? conCosto.reduce((acc, i) => acc + (i.rentabilidad?.tarjeta?.mc_neto || 0), 0) / conCosto.length
      : 0;

    // Por categoria (efectiva: heredada del producto si esta mapeado)
    const porCategoria = {};
    for (const i of items) {
      const cat = i.categoria_efectiva || 'Sin categoria';
      if (!porCategoria[cat]) porCategoria[cat] = { categoria: cat, total: 0, con_costo: 0, sin_mapear: 0 };
      porCategoria[cat].total++;
      if (i.estado_mapeo === 'con_costo') porCategoria[cat].con_costo++;
      if (i.estado_mapeo === 'sin_mapear') porCategoria[cat].sin_mapear++;
    }

    success(res, {
      total: items.length,
      con_costo: conCosto.length,
      sin_mapear: sinMapear.length,
      sin_costo: sinCosto.length,
      nuevos: items.filter((i) => i.es_nuevo_total).length,
      margen_promedio_tarjeta: Math.round(margenProm * 10) / 10,
      por_categoria: Object.values(porCategoria).sort((a, b) => b.total - a.total),
    });
  })
);

// =============================================================================
// GET /categorias - categorias distintas de la carta (para el filtro)
// =============================================================================
router.get(
  '/categorias',
  asyncHandler(async (req, res) => {
    // Categorias EFECTIVAS: producto -> su categoria raiz; promo -> categoria_carta;
    // si no, la propia del item. Se agrupa por (categoria, subcategoria) en UNA
    // sola query y se arma el arbol en memoria: `cantidad` de la raiz es el
    // TOTAL incluyendo sus subcategorias.
    // Categoria/subcategoria se calculan en una subconsulta y el GROUP BY de
    // afuera opera sobre esas columnas ya resueltas (planas). Agruparlas
    // directamente por el COALESCE/CASE completo dispara "Expression ... is
    // not in GROUP BY clause" bajo sql_mode=ONLY_FULL_GROUP_BY (default en
    // MySQL 8) aunque no haya ambiguedad real.
    const [rows] = await pool.query(
      `SELECT categoria, subcategoria, COUNT(*) AS cantidad
       FROM (
         SELECT ${CARTA_CATEGORIA} AS categoria,
                ${CARTA_SUBCATEGORIA} AS subcategoria
         FROM carta_items ci
         LEFT JOIN productos p ON p.id = ci.producto_id AND p.activo = 1
         ${JOIN_CATEGORIAS('p')}
         LEFT JOIN ofertas o ON o.id = ci.oferta_id AND o.activo = 1
         WHERE ci.activo = 1
       ) t
       WHERE categoria IS NOT NULL AND categoria != ''
       GROUP BY categoria, subcategoria
       ORDER BY categoria, subcategoria`
    );

    const porCat = new Map();
    for (const r of rows) {
      if (!porCat.has(r.categoria)) porCat.set(r.categoria, { categoria: r.categoria, cantidad: 0, subcategorias: [] });
      const cat = porCat.get(r.categoria);
      cat.cantidad += Number(r.cantidad);
      if (r.subcategoria) cat.subcategorias.push({ subcategoria: r.subcategoria, cantidad: Number(r.cantidad) });
    }
    success(res, [...porCat.values()]);
  })
);

// =============================================================================
// GET /mapeo-productos - REVERSE LOOKUP para la pagina Productos.
// Devuelve, por cada producto, cuantos items de carta lo referencian y cuales.
// Tolerante a fallos: si la tabla carta_items no existe todavia, devuelve
// { disponible: false } SIN romper (la pagina Productos seguira funcionando).
// =============================================================================
router.get(
  '/mapeo-productos',
  asyncHandler(async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT ci.producto_id, ci.id AS carta_id, ci.nombre AS carta_nombre
         FROM carta_items ci
         WHERE ci.activo = 1 AND ci.producto_id IS NOT NULL`
      );
      const productos = {};
      for (const r of rows) {
        const key = r.producto_id;
        if (!productos[key]) productos[key] = { carta_count: 0, items: [] };
        productos[key].carta_count++;
        productos[key].items.push({ id: r.carta_id, nombre: r.carta_nombre });
      }
      success(res, { disponible: true, productos });
    } catch (e) {
      // Tabla inexistente u otro problema: degradar sin romper la app.
      success(res, { disponible: false, productos: {} });
    }
  })
);

// =============================================================================
// GET /adiciones-disponibles - productos de la categoria "Adiciones"
// (para el selector del editor de items de carta). Tolerante: si no existe
// la categoria devuelve lista vacia.
// =============================================================================
router.get(
  '/adiciones-disponibles',
  asyncHandler(async (req, res) => {
    try {
      const [rows] = await pool.query(
        // Sirve tanto si "Adiciones" es la categoria raiz del producto como si
        // el producto cuelga de una subcategoria de "Adiciones".
        `SELECT p.id, p.nombre, p.precio_publico, p.costo_total
         FROM productos p
         ${JOIN_CATEGORIAS('p')}
         WHERE p.activo = 1 AND p.es_borrador = 0
           AND LOWER(${CAT_NOMBRE}) LIKE 'adicion%'
         ORDER BY p.nombre`
      );
      success(res, rows.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        precio: parseFloat(r.precio_publico) || 0,
        costo: parseFloat(r.costo_total) || 0,
      })));
    } catch (e) {
      success(res, []);
    }
  })
);

// =============================================================================
// GET /mapeo-ofertas - REVERSE LOOKUP para la pagina Promos/Boxs.
// Por cada promo mapeada: que item de carta la referencia.
// Tolerante a fallos (columna oferta_id inexistente -> disponible:false).
// =============================================================================
router.get(
  '/mapeo-ofertas',
  asyncHandler(async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT ci.oferta_id, ci.id AS carta_id, ci.nombre AS carta_nombre
         FROM carta_items ci
         WHERE ci.activo = 1 AND ci.oferta_id IS NOT NULL`
      );
      const ofertas = {};
      for (const r of rows) {
        ofertas[r.oferta_id] = { carta_id: r.carta_id, carta_nombre: r.carta_nombre };
      }
      success(res, { disponible: true, ofertas });
    } catch (e) {
      success(res, { disponible: false, ofertas: {} });
    }
  })
);

// =============================================================================
// GET /:id/sugerencias - auto-sugiere productos para mapear (por nombre)
// =============================================================================
router.get(
  '/:id/sugerencias',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [cartaRows] = await pool.query('SELECT * FROM carta_items WHERE id = ?', [id]);
    if (cartaRows.length === 0) return error(res, 'Item de carta no encontrado', 404);

    const [productos] = await pool.query(
      `SELECT p.id, p.nombre, p.costo_total, p.precio_publico,
              ${CAT_NOMBRE} AS categoria_nombre,
              ${SUBCAT_NOMBRE} AS subcategoria_nombre
       FROM productos p
       ${JOIN_CATEGORIAS('p')}
       WHERE p.activo = 1`
    );

    const top = rankearProductos(cartaRows[0].nombre, productos).slice(0, 6);
    success(res, top);
  })
);

// =============================================================================
// POST /auto-mapear - mapea automaticamente los items que coinciden por nombre
// body: { umbral?: number (default 88), solo_sin_mapear?: bool (default true),
//         dry_run?: bool (default false) }
// Si dry_run=true, NO guarda: devuelve la lista de matches propuestos.
// =============================================================================
router.post(
  '/auto-mapear',
  asyncHandler(async (req, res) => {
    const umbral = req.body.umbral != null ? Number(req.body.umbral) : 88;
    const soloSinMapear = req.body.solo_sin_mapear !== false; // default true
    const dryRun = req.body.dry_run === true;

    let cartaSql = 'SELECT id, nombre, categoria, producto_id FROM carta_items WHERE activo = 1';
    if (soloSinMapear) cartaSql += ' AND producto_id IS NULL';
    cartaSql += ' ORDER BY orden';
    const [cartaItems] = await pool.query(cartaSql);

    const [productos] = await pool.query(
      `SELECT p.id, p.nombre, p.costo_total, p.precio_publico,
              ${CAT_NOMBRE} AS categoria_nombre,
              ${SUBCAT_NOMBRE} AS subcategoria_nombre
       FROM productos p
       ${JOIN_CATEGORIAS('p')}
       WHERE p.activo = 1`
    );

    const propuestas = [];
    for (const ci of cartaItems) {
      const ranked = rankearProductos(ci.nombre, productos);
      const best = ranked[0];
      if (best && best.score >= umbral) {
        propuestas.push({
          carta_id: ci.id,
          carta_nombre: ci.nombre,
          carta_categoria: ci.categoria,
          producto_id: best.id,
          producto_nombre: best.nombre,
          costo_total: best.costo_total,
          score: best.score,
        });
      }
    }

    if (dryRun) {
      return success(res, { dry_run: true, total_candidatos: cartaItems.length, propuestas });
    }

    // Aplicar (en una transaccion)
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const p of propuestas) {
        await conn.query('UPDATE carta_items SET producto_id = ? WHERE id = ?', [p.producto_id, p.carta_id]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    success(res, { dry_run: false, mapeados: propuestas.length, propuestas });
  })
);

// =============================================================================
// POST /normalizar-variantes - migracion una-vez (idempotente):
//  - pasa sabores/toppings legacy (texto con comas) a JSON estructurado
//  - pliega tamano_mas_grande dentro de la lista `tamanos`
//  - siembra fecha_lanzamiento desde fecha_creacion_origen (dd/mm/yyyy) si falta
// Seguro de re-ejecutar: si ya esta en JSON, lo deja igual.
// =============================================================================
router.post(
  '/normalizar-variantes',
  asyncHandler(async (req, res) => {
    // Resiliente: las columnas legacy pueden ya estar borradas (cleanup).
    // Solo las incluimos en el SELECT si todavia existen.
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carta_items'`
    );
    const colSet = new Set(cols.map((c) => c.COLUMN_NAME));
    const selCols = ['id', 'sabores', 'toppings', 'tamanos', 'fecha_lanzamiento'];
    if (colSet.has('tamano_mas_grande')) selCols.push('tamano_mas_grande');
    if (colSet.has('fecha_creacion_origen')) selCols.push('fecha_creacion_origen');

    const [rows] = await pool.query(
      `SELECT ${selCols.join(', ')} FROM carta_items WHERE activo = 1`
    );

    const conn = await pool.getConnection();
    let migrados = 0;
    try {
      await conn.beginTransaction();
      for (const row of rows) {
        // Tamaños: usa los existentes; si no hay, pliega tamano_mas_grande
        let tamanos = V.parseTamanos(row.tamanos);
        if (tamanos.length === 0 && row.tamano_mas_grande && String(row.tamano_mas_grande).trim()) {
          tamanos = [{ nombre: String(row.tamano_mas_grande).trim(), precio: null }];
        }
        const sabores = V.parseSabores(row.sabores);
        const toppings = V.parseToppings(row.toppings);

        // Fecha de lanzamiento: respeta la existente; si no, toma la del CSV
        let fecha = V.toDateStr(row.fecha_lanzamiento);
        if (!fecha) fecha = V.parseFechaDMY(row.fecha_creacion_origen);

        await conn.query(
          `UPDATE carta_items
           SET sabores = ?, toppings = ?, tamanos = ?, fecha_lanzamiento = ?
           WHERE id = ?`,
          [JSON.stringify(sabores), JSON.stringify(toppings), JSON.stringify(tamanos), fecha, row.id]
        );
        migrados++;
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    success(res, { migrados, message: `${migrados} items normalizados` });
  })
);

// =============================================================================
// PUT /:id/mapear - asigna o quita el producto mapeado
// body: { producto_id: number | null }
// =============================================================================
router.put(
  '/:id/mapear',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { producto_id } = req.body;

    if (producto_id != null) {
      const [prod] = await pool.query('SELECT id FROM productos WHERE id = ? AND activo = 1', [producto_id]);
      if (prod.length === 0) return error(res, 'Producto no encontrado', 404);
    }

    // Mapear a producto limpia la promo (son excluyentes).
    const [result] = await pool.query(
      'UPDATE carta_items SET producto_id = ?, oferta_id = NULL WHERE id = ? AND activo = 1',
      [producto_id != null ? producto_id : null, id]
    );
    if (result.affectedRows === 0) return error(res, 'Item de carta no encontrado', 404);

    success(res, { id: Number(id), producto_id: producto_id != null ? producto_id : null });
  })
);

// =============================================================================
// PUT /:id/mapear-oferta - mapea (o quita) una PROMO/oferta al item de carta
// body: { oferta_id: number | null }. Excluyente con producto_id.
// =============================================================================
router.put(
  '/:id/mapear-oferta',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { oferta_id } = req.body;

    if (oferta_id != null) {
      const [of] = await pool.query('SELECT id FROM ofertas WHERE id = ? AND activo = 1', [oferta_id]);
      if (of.length === 0) return error(res, 'Promo no encontrada', 404);
    }

    // Mapear a promo limpia el producto (son excluyentes).
    const [result] = await pool.query(
      'UPDATE carta_items SET oferta_id = ?, producto_id = NULL WHERE id = ? AND activo = 1',
      [oferta_id != null ? oferta_id : null, id]
    );
    if (result.affectedRows === 0) return error(res, 'Item de carta no encontrado', 404);

    success(res, { id: Number(id), oferta_id: oferta_id != null ? oferta_id : null });
  })
);

// =============================================================================
// POST /from-producto/:productoId - crea (o devuelve) el item de carta de un
// producto. Mapeo inverso: desde la pagina Productos "Agregar a carta".
// Idempotente: si el producto ya tiene un item de carta, lo devuelve.
// =============================================================================
router.post(
  '/from-producto/:productoId',
  asyncHandler(async (req, res) => {
    const { productoId } = req.params;

    const [prodRows] = await pool.query(
      `SELECT p.id, p.nombre, p.precio_publico,
              ${CAT_NOMBRE} AS categoria_nombre,
              ${SUBCAT_NOMBRE} AS subcategoria_nombre
       FROM productos p
       ${JOIN_CATEGORIAS('p')}
       WHERE p.id = ? AND p.activo = 1`,
      [productoId]
    );
    if (prodRows.length === 0) return error(res, 'Producto no encontrado', 404);
    const prod = prodRows[0];

    // Ya existe un item de carta mapeado a este producto?
    const [existe] = await pool.query(
      'SELECT id FROM carta_items WHERE producto_id = ? AND activo = 1 LIMIT 1',
      [productoId]
    );
    if (existe.length > 0) {
      return success(res, { id: existe[0].id, ya_existia: true });
    }

    const [[{ maxOrden }]] = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) AS maxOrden FROM carta_items'
    );

    // precio_manual=0 -> hereda el precio del producto. nombre/categoria snapshot
    // (el display igual se deriva del producto en vivo).
    const [result] = await pool.query(
      `INSERT INTO carta_items
         (nombre, precio_venta, precio_manual, categoria, subcategoria, producto_id, orden, activo)
       VALUES (?, ?, 0, ?, ?, ?, ?, 1)`,
      [
        prod.nombre, parseFloat(prod.precio_publico) || 0,
        prod.categoria_nombre || null, prod.subcategoria_nombre || null,
        prod.id, maxOrden + 1,
      ]
    );

    success(res, { id: result.insertId, ya_existia: false }, 201);
  })
);

// =============================================================================
// PUT /:id - editar campos del item de carta
// =============================================================================
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      nombre, precio_venta, precio_manual, categoria, subcategoria, etiqueta, descripcion, imagen,
      frio_caliente, sabores, toppings, tamanos, adiciones, destacado,
      desactivar, fecha_lanzamiento,
    } = req.body;

    if (!nombre || !String(nombre).trim()) return error(res, 'Nombre es requerido');

    const precioNuevo = parseFloat(precio_venta) || 0;

    const [result] = await pool.query(
      `UPDATE carta_items SET
         nombre = ?, precio_venta = ?, precio_manual = ?, categoria = ?, subcategoria = ?, etiqueta = ?, descripcion = ?,
         imagen = ?, frio_caliente = ?, sabores = ?, toppings = ?, tamanos = ?, adiciones = ?,
         destacado = ?, desactivar = ?, fecha_lanzamiento = ?
       WHERE id = ? AND activo = 1`,
      [
        String(nombre).trim(), precioNuevo, precio_manual ? 1 : 0, categoria || null, subcategoria || null, etiqueta || null,
        descripcion || null, imagen || null, frio_caliente ? 1 : 0,
        V.serializeSabores(sabores), V.serializeToppings(toppings), V.serializeTamanos(tamanos),
        V.serializeAdiciones(adiciones),
        destacado ? 1 : 0, desactivar ? 1 : 0, V.toDateStr(fecha_lanzamiento),
        id,
      ]
    );
    if (result.affectedRows === 0) return error(res, 'Item de carta no encontrado', 404);

    // WRITE-THROUGH DE PRECIO: si el item esta mapeado a un PRODUCTO y sin
    // override manual, el precio editado en la carta se guarda en el producto
    // (unica fuente de verdad), con historial de cambio de precio, igual que
    // si lo editaras desde la seccion Productos. Asi ambas quedan en sync.
    let productoActualizado = false;
    if (!precio_manual && precioNuevo > 0) {
      const [[row]] = await pool.query(
        'SELECT producto_id FROM carta_items WHERE id = ?', [id]
      );
      if (row && row.producto_id != null) {
        const [[prod]] = await pool.query(
          'SELECT precio_publico FROM productos WHERE id = ? AND activo = 1', [row.producto_id]
        );
        if (prod && parseFloat(prod.precio_publico) !== precioNuevo) {
          await pool.query(
            `UPDATE productos
             SET precio_anterior_local = precio_publico, precio_publico = ?, fecha_cambio_precio = NOW()
             WHERE id = ? AND activo = 1`,
            [precioNuevo, row.producto_id]
          );
          productoActualizado = true;
        }
      }
    }

    success(res, { message: 'Item actualizado', producto_actualizado: productoActualizado });
  })
);

// =============================================================================
// POST / - crear item de carta manual
// =============================================================================
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      nombre, precio_venta, precio_manual, categoria, subcategoria, etiqueta, descripcion, imagen,
      frio_caliente, sabores, toppings, tamanos, adiciones, destacado,
      fecha_lanzamiento, producto_id, oferta_id,
    } = req.body;

    if (!nombre || !String(nombre).trim()) return error(res, 'Nombre es requerido');

    // Guardias de mapeo: excluyentes + anti-duplicado
    if (producto_id != null && oferta_id != null) {
      return error(res, 'Un item no puede mapearse a un producto y a una promo a la vez');
    }
    if (oferta_id != null) {
      const [of] = await pool.query('SELECT id FROM ofertas WHERE id = ? AND activo = 1', [oferta_id]);
      if (of.length === 0) return error(res, 'Promo no encontrada', 404);
      const [dup] = await pool.query(
        'SELECT id, nombre FROM carta_items WHERE oferta_id = ? AND activo = 1', [oferta_id]
      );
      if (dup.length > 0) {
        return error(res, `Esta promo ya esta en la carta como "${dup[0].nombre}"`);
      }
    }
    if (producto_id != null) {
      const [dup] = await pool.query(
        'SELECT id, nombre FROM carta_items WHERE producto_id = ? AND activo = 1', [producto_id]
      );
      if (dup.length > 0) {
        return error(res, `Este producto ya esta en la carta como "${dup[0].nombre}"`);
      }
    }

    const [[{ maxOrden }]] = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) AS maxOrden FROM carta_items'
    );

    const [result] = await pool.query(
      `INSERT INTO carta_items
         (nombre, precio_venta, precio_manual, categoria, subcategoria, etiqueta, descripcion, imagen, frio_caliente,
          sabores, toppings, tamanos, adiciones, destacado, fecha_lanzamiento, producto_id, oferta_id, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(nombre).trim(), parseFloat(precio_venta) || 0, precio_manual ? 1 : 0, categoria || null, subcategoria || null, etiqueta || null,
        descripcion || null, imagen || null, frio_caliente ? 1 : 0,
        V.serializeSabores(sabores), V.serializeToppings(toppings), V.serializeTamanos(tamanos),
        V.serializeAdiciones(adiciones),
        destacado ? 1 : 0, V.toDateStr(fecha_lanzamiento), producto_id || null, oferta_id || null, maxOrden + 1,
      ]
    );

    success(res, { id: result.insertId }, 201);
  })
);

// =============================================================================
// DELETE /:id - soft delete
// =============================================================================
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE carta_items SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );
    if (result.affectedRows === 0) return error(res, 'Item de carta no encontrado', 404);
    success(res, { message: 'Item eliminado' });
  })
);

module.exports = router;
