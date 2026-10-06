const crypto = require('crypto');
const pool = require('../../config/db');
const { combinaciones } = require('./motor');

// ============================================================================
// CATALOGO EN MEMORIA
// La estructura (productos, pasos, opciones, recetas) se arma con 5 queries y
// queda en memoria hasta que el panel edita algo (invalidarCatalogo). Los
// COSTOS no se guardan aca: dependen de los precios de los ingredientes, que
// cambian por fuera del modulo, asi que se leen al cotizar (getCostos).
// ============================================================================

let cache = null;
let cargando = null;

const num = (v) => (v == null || v === '' ? null : Number(v));
const porOrden = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });

function linea(r) {
  return {
    ingrediente_id: num(r.ingrediente_id),
    subreceta_id: num(r.subreceta_id),
    cc_producto_id: num(r.cc_producto_id),
    costo_manual: num(r.costo_manual),
    cantidad: Number(r.cantidad) || 0,
    por_kg: !!r.por_kg,
  };
}

// Opcion con la forma que usa el motor. `id` es el de la base o, en un
// borrador del editor, la clave de texto de la opcion nueva.
function opcion(r, id, receta, extra = {}) {
  return {
    id,
    nombre: r.nombre,
    descripcion: r.descripcion || null,
    precio: Number(r.precio) || 0,
    precio_modo: r.precio_modo === 'por_kg' ? 'por_kg' : 'fijo',
    peso_kg: num(r.peso_kg),
    depende_de: null,
    etiquetas: r.etiquetas || [],
    imagen: r.imagen || null,
    orden: r.orden ?? 0,
    receta,
    ...extra,
  };
}

// Opciones de un paso: las propias + las de su grupo, con el ajuste del paso
// (otro precio u oculta).
function opcionesDePaso(propias, grupo, ajustes) {
  const lista = [...propias];
  for (const o of grupo || []) {
    const aj = ajustes.get(o.id);
    if (aj?.oculto) continue;
    lista.push(aj?.precio != null ? { ...o, precio: Number(aj.precio) } : o);
  }
  return lista.sort(porOrden);
}

function producto(p, pasos, receta) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion || null,
    categoria: p.categoria || null,
    imagen: p.imagen || null,
    emoji: p.emoji || null,
    precio_base: Number(p.precio_base) || 0,
    etiquetas: p.etiquetas || [],
    es_congelado: !!p.es_congelado,
    activo: !!p.activo,
    orden: p.orden ?? 0,
    receta,
    pasos: pasos.sort(porOrden),
  };
}

const SIN_COSTOS = { ingredientes: new Map(), subrecetas: new Map(), productos: new Map() };

// Precio de la combinacion valida mas barata ("desde $X").
function precioDesde(prod) {
  const precios = combinaciones(prod, SIN_COSTOS).combinaciones.map((c) => c.precio_unitario);
  return precios.length ? Math.min(...precios) : null;
}

async function construir() {
  const [[productos], [pasos], [opciones], [ajustes], [lineas]] = await Promise.all([
    pool.query('SELECT * FROM pp_productos'),
    pool.query('SELECT * FROM pp_pasos'),
    pool.query(
      `SELECT o.* FROM pp_opciones o
       LEFT JOIN pp_grupos g ON g.id = o.grupo_id
       WHERE o.activo = 1 AND (o.grupo_id IS NULL OR g.activo = 1)`
    ),
    pool.query('SELECT * FROM pp_paso_ajustes'),
    pool.query('SELECT * FROM pp_receta_lineas ORDER BY id'),
  ]);

  const agrupar = (filas, clave) => {
    const m = new Map();
    for (const f of filas) {
      const k = clave(f);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    }
    return m;
  };

  const recetaOpcion = agrupar(lineas.filter((l) => l.opcion_id != null), (l) => l.opcion_id);
  const recetaProducto = agrupar(lineas.filter((l) => l.producto_id != null), (l) => l.producto_id);
  const recetaDe = (mapa, id) => (mapa.get(id) || []).map(linea);

  const armar = (o) => opcion(o, o.id, recetaDe(recetaOpcion, o.id), { depende_de: num(o.depende_de_opcion_id) });
  const grupos = new Map();
  for (const [gid, filas] of agrupar(opciones.filter((o) => o.grupo_id != null), (o) => o.grupo_id)) {
    grupos.set(gid, filas.map(armar));
  }
  const propias = agrupar(opciones.filter((o) => o.paso_id != null), (o) => o.paso_id);
  const ajustesPorPaso = agrupar(ajustes, (a) => a.paso_id);

  const pasosPorProducto = agrupar(pasos, (p) => p.producto_id);
  const mapa = new Map();
  for (const p of productos) {
    const susPasos = (pasosPorProducto.get(p.id) || []).map((s) => ({
      id: s.id,
      nombre: s.nombre,
      orden: s.orden,
      min_sel: s.min_sel,
      max_sel: s.max_sel,
      opciones: opcionesDePaso(
        (propias.get(s.id) || []).map(armar),
        grupos.get(s.grupo_id),
        new Map((ajustesPorPaso.get(s.id) || []).map((a) => [a.opcion_id, a]))
      ),
    }));
    mapa.set(p.id, producto(p, susPasos, recetaDe(recetaProducto, p.id)));
  }

  const publico = publicar(mapa);
  const version = crypto.createHash('sha1').update(JSON.stringify(publico)).digest('hex').slice(0, 12);
  return { productos: mapa, grupos, publico, version };
}

// Vista publica (POS, tienda): solo activos, sin recetas ni costos.
function publicar(mapa) {
  return [...mapa.values()]
    .filter((p) => p.activo)
    .sort(porOrden)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      categoria: p.categoria,
      imagen: p.imagen,
      emoji: p.emoji,
      etiquetas: p.etiquetas,
      es_congelado: p.es_congelado,
      precio_base: p.precio_base,
      precio_desde: precioDesde(p),
      pasos: p.pasos.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        min_sel: s.min_sel,
        max_sel: s.max_sel,
        opciones: s.opciones.map(({ receta, orden, ...o }) => o),
      })),
    }));
}

async function getCatalogo() {
  if (cache) return cache;
  // Si llegan varios pedidos juntos con el cache vacio, se arma una sola vez.
  if (!cargando) {
    cargando = construir()
      .then((c) => { cache = c; return c; })
      .finally(() => { cargando = null; });
  }
  return cargando;
}

function invalidarCatalogo() {
  cache = null;
}

// Producto del editor SIN guardar, con la forma del motor, para simularlo en
// vivo. Las opciones nuevas usan su clave de texto como id; las guardadas y
// las de grupo, su id en texto, asi todo se compara igual.
function armarBorrador(arbol, catalogo) {
  const pasos = (arbol.pasos || []).map((s, i) => {
    const propias = (s.opciones || [])
      .filter((o) => o.activo !== false)
      .map((o) => opcion(o, String(o.id ?? o.key), (o.receta || []).map(linea), {
        depende_de: o.depende_de == null || o.depende_de === '' ? null : String(o.depende_de),
      }));
    const grupo = (catalogo.grupos.get(num(s.grupo_id)) || []).map((o) => ({ ...o, id: String(o.id) }));
    const ajustes = new Map((s.ajustes || []).map((a) => [String(a.opcion_id), a]));
    return {
      id: String(s.id ?? s.key ?? `paso${i}`),
      nombre: s.nombre || `Paso ${i + 1}`,
      orden: s.orden ?? i,
      min_sel: Number(s.min_sel) || 0,
      max_sel: Number(s.max_sel) || 1,
      opciones: opcionesDePaso(propias, grupo, ajustes),
    };
  });
  return producto({ ...arbol, id: 'borrador', activo: true }, pasos, (arbol.receta || []).map(linea));
}

// Todas las lineas de receta de un producto (base + opciones).
function lineasDe(prod) {
  return [...prod.receta, ...prod.pasos.flatMap((s) => s.opciones.flatMap((o) => o.receta))];
}

// Costos unitarios vigentes de las lineas dadas (misma formula que
// utils/recetas.js). Hasta 3 queries, solo de lo que se usa.
async function getCostos(lineas) {
  const ids = { ingredientes: new Set(), subrecetas: new Set(), productos: new Set() };
  for (const l of lineas) {
    if (l.ingrediente_id != null) ids.ingredientes.add(l.ingrediente_id);
    else if (l.subreceta_id != null) ids.subrecetas.add(l.subreceta_id);
    else if (l.cc_producto_id != null) ids.productos.add(l.cc_producto_id);
  }

  const consultar = async (set, sql) => {
    if (!set.size) return new Map();
    const [rows] = await pool.query(sql, [[...set]]);
    return new Map(rows.map((r) => [r.id, Number(r.costo) || 0]));
  };

  const [ingredientes, subrecetas, productos] = await Promise.all([
    consultar(ids.ingredientes, 'SELECT id, costo_con_desperdicio AS costo FROM ingredientes WHERE id IN (?)'),
    consultar(ids.subrecetas,
      `SELECT id, CASE WHEN tipo_rendimiento = 'porciones' THEN costo_total / NULLIF(rendimiento_gramos, 0)
                       ELSE costo_por_100g / 100 END AS costo
       FROM subrecetas WHERE id IN (?)`),
    consultar(ids.productos, 'SELECT id, costo_total AS costo FROM productos WHERE id IN (?)'),
  ]);
  return { ingredientes, subrecetas, productos };
}

module.exports = { getCatalogo, invalidarCatalogo, armarBorrador, lineasDe, getCostos };
