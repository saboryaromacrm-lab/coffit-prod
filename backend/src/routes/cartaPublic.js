const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const V = require('../utils/cartaVariantes');
const {
  JOIN_CATEGORIAS, CAT_NOMBRE, SUBCAT_NOMBRE, CARTA_CATEGORIA, CARTA_SUBCATEGORIA,
} = require('../utils/categoriaSql');

// ============================================================================
// API PUBLICA DE LA CARTA DIGITAL (read-only)
// La consume la app del menu digital (reemplaza al Google Sheets).
// Expone SOLO campos de menu. Nunca costo, rentabilidad ni datos internos.
// Oculta los items con desactivar=1.
//
// UNIFICACION: si el item esta mapeado a un producto, hereda de el nombre,
// categoria y precio (salvo override precio_manual). Asi el menu y el costo
// quedan siempre en sync con un solo lugar de edicion.
//
// Variantes ya RESUELTAS para el menu:
//   tamanos  -> [{ nombre, precio, precio_texto }]            (precio final)
//   sabores  -> [{ nombre, precio, precio_texto, es_nuevo }]  (precio final)
//   toppings -> [{ nombre, precio_extra, precio_extra_texto }](aditivo)
//   es_nuevo (item) = lanzado hace <= N dias  O  tiene algun sabor nuevo
// ============================================================================

const { precioAR } = require('../utils/formato');

function splitList(s) {
  if (!s) return [];
  return String(s).split(',').map((x) => x.trim()).filter(Boolean);
}

// Valores efectivos (heredados del producto o de la promo si esta mapeado).
// `categoria` es SIEMPRE la categoria RAIZ; la hoja va aparte en `subcategoria`
// (null si no tiene). Asi la app del menu que ya existe no ve ningun cambio.
function efectivos(r, promosMap) {
  const promo = (r.oferta_id != null && promosMap) ? promosMap[r.oferta_id] : null;
  const mapeadoOferta = !!promo;
  const mapeadoProducto = !mapeadoOferta && r.producto_id != null && r.producto_nombre != null;
  const precioManual = !!r.precio_manual;
  const precioProd = r.producto_precio_publico != null ? parseFloat(r.producto_precio_publico) : null;

  let inherido = null;
  let nombre = r.nombre;
  let categoria = r.categoria || '';
  let subcategoria = r.subcategoria || null;
  if (mapeadoOferta) {
    inherido = promo.precio_combo;
    nombre = promo.nombre;
    categoria = promo.categoria_carta || r.categoria || ''; // Promo | Combo | Boxs
    subcategoria = promo.subcategoria_carta || null;
  } else if (mapeadoProducto) {
    inherido = precioProd;
    nombre = r.producto_nombre;
    categoria = r.producto_categoria || r.categoria || '';
    // null legitimo: el producto manda, no se cae al snapshot viejo del item.
    subcategoria = r.producto_subcategoria || null;
  }
  const base = (!precioManual && inherido != null) ? inherido : (Number(r.precio_venta) || 0);
  return { base, nombre, categoria, subcategoria };
}

// Un item vinculado a promo solo es visible si la promo esta ACTIVA.
// (Promo vencida/pausada/borrada -> el box desaparece del menu automaticamente.)
function visibleEnMenu(r, promosMap) {
  if (r.oferta_id == null) return true;
  const promo = promosMap ? promosMap[r.oferta_id] : null;
  return !!promo && promo.estado === 'activa';
}

// Mapea una fila a la forma publica (menu-safe), con variantes resueltas.
function toMenuItem(r, dias, hoy, promosMap, adicionesMap) {
  const { base, nombre, categoria, subcategoria } = efectivos(r, promosMap);
  const { tamanos, sabores, toppings } = V.resolverParaMenu(r, base, dias, hoy);
  const fecha_lanzamiento = V.toDateStr(r.fecha_lanzamiento);
  const es_nuevo = V.esNuevo(fecha_lanzamiento, dias, hoy) || sabores.some((s) => s.es_nuevo);
  const promo = (r.oferta_id != null && promosMap) ? promosMap[r.oferta_id] : null;
  const adiciones = V.resolverAdiciones(r.adiciones, adicionesMap);

  return {
    id: r.id,
    nombre,
    precio: base,
    precio_texto: precioAR(base),
    categoria,
    subcategoria, // null si el item no tiene subcategoria
    etiquetas: splitList(r.etiqueta),
    descripcion: r.descripcion || '',
    imagen: r.imagen || '',
    frio_caliente: !!r.frio_caliente,
    tamanos: tamanos.map((t) => ({ nombre: t.nombre, precio: t.precio, precio_texto: precioAR(t.precio) })),
    sabores: sabores.map((s) => ({ nombre: s.nombre, precio: s.precio, precio_texto: precioAR(s.precio), es_nuevo: s.es_nuevo })),
    toppings: toppings.map((t) => ({ nombre: t.nombre, precio_extra: t.precio_extra, precio_extra_texto: precioAR(t.precio_extra) })),
    // Adiciones: productos reales de la categoria "Adiciones" (precio en vivo)
    adiciones: adiciones.map((a) => ({ nombre: a.nombre, precio_extra: a.precio_extra, precio_extra_texto: precioAR(a.precio_extra) })),
    // Composicion del box/combo (solo items vinculados a una promo). Siempre
    // en vivo: si cambia el armado del box en Promos, el menu lo refleja.
    es_combo: !!promo,
    incluye: promo ? promo.productos.map((p) => ({ nombre: p.nombre, cantidad: p.cantidad, es_regalo: !!p.es_regalo })) : [],
    destacado: !!r.destacado,
    es_nuevo,
    fecha_lanzamiento,
  };
}

const FROM_JOIN = `
  FROM carta_items ci
  LEFT JOIN productos p ON p.id = ci.producto_id AND p.activo = 1
  ${JOIN_CATEGORIAS('p')}
  LEFT JOIN ofertas o ON o.id = ci.oferta_id AND o.activo = 1
`;
const SELECT_COLS = `
  ci.id, ci.nombre, ci.precio_venta, ci.precio_manual, ci.categoria, ci.subcategoria, ci.etiqueta,
  ci.descripcion, ci.imagen, ci.frio_caliente, ci.sabores, ci.toppings, ci.tamanos,
  ci.adiciones, ci.destacado, ci.fecha_lanzamiento, ci.producto_id, ci.oferta_id,
  p.nombre AS producto_nombre, p.precio_publico AS producto_precio_publico,
  ${CAT_NOMBRE} AS producto_categoria,
  ${SUBCAT_NOMBRE} AS producto_subcategoria
`;

// WHERE + params (filtros sobre valores EFECTIVOS)
function buildFilters(q) {
  let sql = `WHERE ci.activo = 1 AND (ci.desactivar = 0 OR ci.desactivar IS NULL)`;
  const params = [];
  // ?categoria= filtra por la RAIZ: incluye a todas sus subcategorias.
  if (q.categoria) { sql += ` AND ${CARTA_CATEGORIA} = ?`; params.push(q.categoria); }
  // ?subcategoria= se usa junto con ?categoria= (los nombres de subcategoria
  // pueden repetirse entre categorias distintas).
  if (q.subcategoria) { sql += ` AND ${CARTA_SUBCATEGORIA} = ?`; params.push(q.subcategoria); }
  if (String(q.destacados) === '1' || String(q.destacados) === 'true') sql += ' AND ci.destacado = 1';
  if (q.buscar) { sql += ' AND (ci.nombre LIKE ? OR p.nombre LIKE ? OR o.nombre LIKE ?)'; params.push(`%${q.buscar}%`, `%${q.buscar}%`, `%${q.buscar}%`); }
  return { sql, params };
}

const esNuevoTruthy = (q) => String(q.nuevos) === '1' || String(q.nuevos) === 'true';
const ORDER = ' ORDER BY ci.orden ASC, ci.nombre ASC';

// =============================================================================
// GET / - lista plana + categorias ordenadas
// Filtros opcionales: ?categoria= ?destacados=1 ?nuevos=1 ?buscar=
// =============================================================================
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { sql, params } = buildFilters(req.query);
    const [rows] = await pool.query(`SELECT ${SELECT_COLS} ${FROM_JOIN} ${sql} ${ORDER}`, params);

    const dias = await V.getDiasNuevo(pool);
    const promosMap = await V.getPromosMap(pool, rows.map((r) => r.oferta_id));
    const adicionesMap = await V.getAdicionesMap(pool, V.collectAdicionIds(rows));
    const hoy = new Date();
    let items = rows.filter((r) => visibleEnMenu(r, promosMap)).map((r) => toMenuItem(r, dias, hoy, promosMap, adicionesMap));
    if (esNuevoTruthy(req.query)) items = items.filter((i) => i.es_nuevo);

    const categorias = [];
    const vistas = new Set();
    for (const it of items) {
      if (it.categoria && !vistas.has(it.categoria)) { vistas.add(it.categoria); categorias.push(it.categoria); }
    }

    res.json({ actualizado: hoy.toISOString(), total: items.length, categorias, items });
  })
);

// =============================================================================
// GET /agrupado - menu agrupado por categoria
// =============================================================================
router.get(
  '/agrupado',
  asyncHandler(async (req, res) => {
    const { sql, params } = buildFilters(req.query);
    const [rows] = await pool.query(`SELECT ${SELECT_COLS} ${FROM_JOIN} ${sql} ${ORDER}`, params);

    const dias = await V.getDiasNuevo(pool);
    const promosMap = await V.getPromosMap(pool, rows.map((r) => r.oferta_id));
    const adicionesMap = await V.getAdicionesMap(pool, V.collectAdicionIds(rows));
    const hoy = new Date();
    let items = rows.filter((r) => visibleEnMenu(r, promosMap)).map((r) => toMenuItem(r, dias, hoy, promosMap, adicionesMap));
    if (esNuevoTruthy(req.query)) items = items.filter((i) => i.es_nuevo);

    // Agrupado en 2 niveles, RETROCOMPATIBLE:
    //   `items`            -> TODOS los items de la categoria (incluidos los que
    //                         estan en subcategorias). Es lo que ya existia:
    //                         una app vieja lo renderiza plano y funciona igual.
    //   `subcategorias`    -> [] si la categoria no usa subcategorias.
    //   `sin_subcategoria` -> los que cuelgan directo de la raiz.
    const grupos = [];
    const indexByCat = new Map();
    for (const item of items) {
      const cat = item.categoria || 'Sin categoria';
      if (!indexByCat.has(cat)) {
        indexByCat.set(cat, grupos.length);
        grupos.push({ categoria: cat, items: [], subcategorias: [], sin_subcategoria: [] });
      }
      const g = grupos[indexByCat.get(cat)];
      g.items.push(item);
      if (!item.subcategoria) {
        g.sin_subcategoria.push(item);
      } else {
        let sub = g.subcategorias.find((s) => s.subcategoria === item.subcategoria);
        if (!sub) { sub = { subcategoria: item.subcategoria, items: [] }; g.subcategorias.push(sub); }
        sub.items.push(item);
      }
    }

    res.json({ actualizado: hoy.toISOString(), total: items.length, categorias: grupos });
  })
);

// =============================================================================
// GET /nuevos - solo los items "nuevos" (seccion "Ver lo nuevo")
// =============================================================================
router.get(
  '/nuevos',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT ${SELECT_COLS} ${FROM_JOIN}
       WHERE ci.activo = 1 AND (ci.desactivar = 0 OR ci.desactivar IS NULL) ${ORDER}`
    );
    const dias = await V.getDiasNuevo(pool);
    const promosMap = await V.getPromosMap(pool, rows.map((r) => r.oferta_id));
    const adicionesMap = await V.getAdicionesMap(pool, V.collectAdicionIds(rows));
    const hoy = new Date();
    const items = rows.filter((r) => visibleEnMenu(r, promosMap)).map((r) => toMenuItem(r, dias, hoy, promosMap, adicionesMap)).filter((i) => i.es_nuevo);
    res.json({ actualizado: hoy.toISOString(), total: items.length, items });
  })
);

// =============================================================================
// GET /categorias - categorias efectivas activas (para tabs)
// =============================================================================
router.get(
  '/categorias',
  asyncHandler(async (req, res) => {
    // Ver nota en carta.js GET /categorias: agrupar directo por el
    // COALESCE/CASE completo dispara error bajo sql_mode=ONLY_FULL_GROUP_BY
    // (default en MySQL 8). Se resuelve categoria/subcategoria/orden en una
    // subconsulta y se agrupa afuera sobre columnas ya planas.
    const [rows] = await pool.query(
      `SELECT categoria, subcategoria, COUNT(*) AS cantidad, MIN(orden) AS orden
       FROM (
         SELECT ${CARTA_CATEGORIA} AS categoria,
                ${CARTA_SUBCATEGORIA} AS subcategoria,
                ci.orden AS orden
         ${FROM_JOIN}
         WHERE ci.activo = 1 AND (ci.desactivar = 0 OR ci.desactivar IS NULL)
           AND (ci.oferta_id IS NULL OR o.estado = 'activa')
       ) t
       WHERE categoria IS NOT NULL AND categoria != ''
       GROUP BY categoria, subcategoria
       ORDER BY orden ASC, categoria ASC, subcategoria ASC`
    );

    // `cantidad` de la categoria = TOTAL incluyendo sus subcategorias (si no,
    // no cerrarian los contadores de los tabs). `subcategorias` es [] cuando
    // la categoria no usa subcategorias -> la app vieja simplemente lo ignora.
    const porCat = new Map();
    for (const r of rows) {
      if (!porCat.has(r.categoria)) porCat.set(r.categoria, { categoria: r.categoria, cantidad: 0, subcategorias: [] });
      const cat = porCat.get(r.categoria);
      cat.cantidad += Number(r.cantidad);
      if (r.subcategoria) cat.subcategorias.push({ subcategoria: r.subcategoria, cantidad: Number(r.cantidad) });
    }
    res.json([...porCat.values()]);
  })
);

module.exports = router;
