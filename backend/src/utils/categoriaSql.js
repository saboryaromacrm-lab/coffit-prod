// ============================================================================
// JERARQUIA DE CATEGORIAS DE PRODUCTO (2 niveles: raiz -> subcategoria)
//
// categorias_productos.parent_id:  NULL = categoria raiz | NOT NULL = subcategoria
// productos.categoria_id apunta SIEMPRE a UNA sola fila (raiz o subcategoria).
//
// REGLA DE ORO: "categoria" significa SIEMPRE la RAIZ en toda la app.
// La hoja se expone aparte como "subcategoria" (null si el producto cuelga
// directo de la raiz). Gracias a esto, crear subcategorias NO cambia ningun
// agrupamiento ni total historico de reportes.
//
// Este archivo es la UNICA definicion de esa resolucion: todos los routes la
// importan de aca para que no se desincronicen.
//
// Alias usados: cp = categoria del producto (la fila apuntada)
//               cpp = padre de cp (NULL si cp ya es raiz)
// ============================================================================

// JOINs. `alias` = alias de la tabla productos en la query.
// Reemplaza al viejo "LEFT JOIN categorias_productos cp ON cp.id = p.categoria_id".
const JOIN_CATEGORIAS = (alias = 'p') =>
  `LEFT JOIN categorias_productos cp ON cp.id = ${alias}.categoria_id
   LEFT JOIN categorias_productos cpp ON cpp.id = cp.parent_id`;

// Expresiones sueltas (para GROUP BY / WHERE / ORDER BY)
const CAT_ID = 'COALESCE(cpp.id, cp.id)';
const CAT_NOMBRE = 'COALESCE(cpp.nombre, cp.nombre)';
const CAT_ICONO = 'COALESCE(cpp.icono, cp.icono)';
const SUBCAT_ID = 'CASE WHEN cpp.id IS NULL THEN NULL ELSE cp.id END';
const SUBCAT_NOMBRE = 'CASE WHEN cpp.id IS NULL THEN NULL ELSE cp.nombre END';

// Columnas listas para el SELECT de productos.
// OJO: categoria_id / categoria_nombre / categoria_icono conservan su
// significado historico (= la RAIZ), por eso nada de lo que ya existia cambia.
const COLS_CATEGORIA = `
  ${CAT_ID} AS categoria_raiz_id,
  ${CAT_NOMBRE} AS categoria_nombre,
  ${CAT_ICONO} AS categoria_icono,
  ${SUBCAT_ID} AS subcategoria_id,
  ${SUBCAT_NOMBRE} AS subcategoria_nombre`;

// Filtro por categoria. Un id de RAIZ incluye a todas sus subcategorias;
// un id de SUBCATEGORIA filtra solo esa. Un unico filtro sirve para ambos.
// Se usa con los params [id, id].
const FILTRO_CATEGORIA = (alias = 'p') =>
  `(${alias}.categoria_id = ? OR cp.parent_id = ?)`;

// --- CARTA: valores EFECTIVOS -----------------------------------------------
// Prioridad: producto mapeado > promo mapeada > lo propio del item.
// Requiere que la query tenga los alias ci (carta_items), cp/cpp y o (ofertas).
const CARTA_CATEGORIA = `COALESCE(${CAT_NOMBRE}, o.categoria_carta, ci.categoria)`;

// Para la subcategoria NO sirve un COALESCE: NULL es un valor legitimo
// ("este producto no tiene subcategoria") y un COALESCE se caeria al snapshot
// viejo de ci.subcategoria, mostrando una subcategoria fantasma. Por eso CASE
// explicito sobre QUIEN manda, no sobre si el valor es null.
//
// OJO: se discrimina por `p.id` (hay producto mapeado y activo), NO por `cp.id`
// (el producto tiene categoria). Si fuera por cp.id, un producto mapeado pero
// SIN categoria caeria al ELSE y devolveria el snapshot viejo del item.
// Esto replica exactamente lo que hace enriquecer() en JS.
const CARTA_SUBCATEGORIA = `
  CASE
    WHEN p.id IS NOT NULL THEN ${SUBCAT_NOMBRE}
    WHEN o.id IS NOT NULL THEN o.subcategoria_carta
    ELSE ci.subcategoria
  END`;

module.exports = {
  JOIN_CATEGORIAS,
  CAT_ID,
  CAT_NOMBRE,
  CAT_ICONO,
  SUBCAT_ID,
  SUBCAT_NOMBRE,
  COLS_CATEGORIA,
  FILTRO_CATEGORIA,
  CARTA_CATEGORIA,
  CARTA_SUBCATEGORIA,
};
