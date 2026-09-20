// ============================================================================
// VARIANTES DE CARTA (tamaños, sabores, toppings, temperaturas) + "nuevo"
//
// Estabilidad: las columnas se guardan como JSON dentro de TEXT. Estos helpers
// entienden TANTO el formato nuevo (JSON) COMO el viejo (texto separado por
// comas), asi la app funciona durante y despues de la migracion sin romperse.
//
// Modelos:
//   tamaño      = { nombre, precio }            precio null = hereda el precio base
//   sabor       = { nombre, precio, fecha_nuevo } precio null = hereda base; fecha_nuevo = cuando se marco nuevo (caduca a N dias)
//   topping     = { nombre, precio }            precio = EXTRA aditivo (default 0)
//   temperatura = { nombre, precio }            precio null = hereda el precio base
// ============================================================================

// --- precios --------------------------------------------------------------
function precioOpcional(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseFloat(v);
  return Number.isNaN(n) || n < 0 ? null : n;
}
function precioExtra(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = parseFloat(v);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

// Extrae "+$1.000" / "+1000" de un texto de topping legacy -> { nombre, extra }
function extraerExtraLegacy(token) {
  const m = String(token).match(/\+\s*\$?\s*([\d.,]+)/);
  if (!m) return { nombre: String(token).trim(), extra: 0 };
  const num = parseInt(m[1].replace(/[.,]/g, ''), 10) || 0;
  const nombre = String(token).replace(/\+\s*\$?\s*[\d.,]+/, '').trim();
  return { nombre, extra: num };
}

// --- fechas ---------------------------------------------------------------
// mysql2 puede devolver DATE como Date o como string segun config -> normalizamos
function toDateStr(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// "26/11/2025" / "7/5/2026" -> "2025-11-26" (para migrar fecha_creacion_origen)
function parseFechaDMY(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// dias transcurridos desde una fecha 'YYYY-MM-DD' hasta hoy
function diasDesde(fechaStr, hoy) {
  const ds = toDateStr(fechaStr);
  if (!ds) return Infinity;
  const d = new Date(`${ds}T00:00:00`);
  if (isNaN(d.getTime())) return Infinity;
  return Math.floor((hoy.getTime() - d.getTime()) / 86400000);
}

// es "nuevo" si tiene fecha y esta dentro de la ventana (0..dias)
function esNuevo(fechaStr, dias, hoy) {
  if (!fechaStr) return false;
  const dd = diasDesde(fechaStr, hoy);
  return dd >= 0 && dd <= dias;
}

// --- parseo de cada lista (acepta JSON nuevo o texto viejo o array directo) ---
function aLista(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try { const arr = JSON.parse(s); return Array.isArray(arr) ? arr : []; }
    catch { return []; }
  }
  // legacy: "a, b, c" -> ['a','b','c'].
  // Split en comas que NO sean separador de miles (ej: "+$1,000" no se parte).
  return s.split(/,(?!\d)/).map((x) => x.trim()).filter(Boolean);
}

function parseTamanos(raw) {
  return aLista(raw).map((e) => {
    if (typeof e === 'string') return { nombre: e, precio: null };
    return { nombre: String(e.nombre || '').trim(), precio: precioOpcional(e.precio) };
  }).filter((e) => e.nombre);
}

function parseSabores(raw) {
  return aLista(raw).map((e) => {
    if (typeof e === 'string') return { nombre: e, precio: null, fecha_nuevo: null };
    return {
      nombre: String(e.nombre || '').trim(),
      precio: precioOpcional(e.precio),
      fecha_nuevo: toDateStr(e.fecha_nuevo),
    };
  }).filter((e) => e.nombre);
}

function parseToppings(raw) {
  return aLista(raw).map((e) => {
    if (typeof e === 'string') {
      const { nombre, extra } = extraerExtraLegacy(e);
      return { nombre, precio: extra };
    }
    return { nombre: String(e.nombre || '').trim(), precio: precioExtra(e.precio) };
  }).filter((e) => e.nombre);
}

// --- temperaturas (frio / caliente) ---------------------------------------
// Mismo modelo que tamaños: { nombre, precio } con precio null = hereda base.
// Reemplaza al viejo booleano `frio_caliente`, que se mantiene en la DB y en la
// API publica como bandera derivada (1 si el item tiene alguna temperatura).
const TEMPERATURAS_DEFAULT = [
  { nombre: 'Frío', precio: null },
  { nombre: 'Caliente', precio: null },
];

function parseTemperaturas(raw) {
  return aLista(raw).map((e) => {
    if (typeof e === 'string') return { nombre: e, precio: null };
    return { nombre: String(e.nombre || '').trim(), precio: precioOpcional(e.precio) };
  }).filter((e) => e.nombre);
}

// Lectura tolerante: los items viejos solo tienen frio_caliente=1 y ninguna
// lista, asi que se sintetizan las dos opciones al precio base. El resultado es
// identico al comportamiento actual y se persiste solo cuando se guarda el item
// (auto-migracion, sin necesidad de tocar los datos).
function temperaturasEfectivas(row) {
  const lista = parseTemperaturas(row && row.temperaturas);
  if (lista.length > 0) return lista;
  return (row && row.frio_caliente) ? TEMPERATURAS_DEFAULT.map((t) => ({ ...t })) : [];
}

// --- grupos de opciones (genericos) ----------------------------------------
// Para cualquier eleccion tipo "Tipo de huevo: Huevos enteros / Clara de
// huevo" que no encaja en tamaño/sabor/topping/temperatura. Mismo modelo
// { nombre, precio } que temperaturas (precio null = hereda el base), pero
// agrupado bajo un nombre libre y con TANTOS grupos como haga falta por item
// (ej: "Tipo de huevo" + "Tipo de pan" en el mismo producto).
//
// Cada grupo es de seleccion UNICA: el cliente elige una alternativa del
// grupo, no se combinan (como tamaños, a diferencia de toppings/adiciones que
// se pueden sumar). Es solo una eleccion de menu: no cambia el costo/receta
// del producto, por eso no toca productos/ingredientes.
function parseOpcionesDeGrupo(raw) {
  return aLista(raw).map((e) => {
    if (typeof e === 'string') return { nombre: e, precio: null };
    return { nombre: String(e.nombre || '').trim(), precio: precioOpcional(e.precio) };
  }).filter((e) => e.nombre);
}

function parseGruposOpciones(raw) {
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw) {
    try { const p = JSON.parse(String(raw)); arr = Array.isArray(p) ? p : []; }
    catch { arr = []; }
  }
  return arr
    .map((g) => ({
      nombre: String((g && g.nombre) || '').trim(),
      opciones: parseOpcionesDeGrupo(g && g.opciones),
    }))
    .filter((g) => g.nombre && g.opciones.length > 0);
}

// --- serializacion para guardar en DB -------------------------------------
const serializeTamanos = (v) => JSON.stringify(parseTamanos(v));
const serializeSabores = (v) => JSON.stringify(parseSabores(v));
const serializeToppings = (v) => JSON.stringify(parseToppings(v));
const serializeTemperaturas = (v) => JSON.stringify(parseTemperaturas(v));
const serializeGruposOpciones = (v) => JSON.stringify(parseGruposOpciones(v));

// --- adiciones: productos de la categoria "Adiciones" vinculados a un item --
// Formato guardado: [{ producto_id, precio }]  (precio null = usa el precio
// publico del producto adicion, resuelto en vivo).
function parseAdiciones(raw) {
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw) {
    try { const p = JSON.parse(String(raw)); arr = Array.isArray(p) ? p : []; }
    catch { arr = []; }
  }
  return arr
    .map((a) => ({
      producto_id: Number(a && a.producto_id),
      precio: precioOpcional(a && a.precio),
    }))
    .filter((a) => Number.isInteger(a.producto_id) && a.producto_id > 0);
}

const serializeAdiciones = (v) => JSON.stringify(parseAdiciones(v));

// Junta todos los producto_id de adiciones referenciados en un set de filas.
function collectAdicionIds(rows) {
  const ids = new Set();
  for (const r of rows || []) {
    for (const a of parseAdiciones(r.adiciones)) ids.add(a.producto_id);
  }
  return [...ids];
}

// Info en vivo de los productos adicion: { [id]: { nombre, precio, costo } }
async function getAdicionesMap(pool, productoIds) {
  const ids = [...new Set((productoIds || []).filter((x) => x != null).map(Number))];
  if (ids.length === 0) return {};
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre, precio_publico, costo_total
       FROM productos WHERE id IN (${placeholders}) AND activo = 1`,
      ids
    );
    const map = {};
    for (const r of rows) {
      map[r.id] = {
        nombre: r.nombre,
        precio: parseFloat(r.precio_publico) || 0,
        costo: parseFloat(r.costo_total) || 0,
      };
    }
    return map;
  } catch {
    return {};
  }
}

// Resuelve las adiciones de una fila contra el mapa (descarta las borradas).
// -> [{ producto_id, nombre, precio_extra, precio_producto, costo }]
function resolverAdiciones(raw, adicionesMap) {
  return parseAdiciones(raw)
    .filter((a) => adicionesMap && adicionesMap[a.producto_id])
    .map((a) => {
      const p = adicionesMap[a.producto_id];
      return {
        producto_id: a.producto_id,
        nombre: p.nombre,
        precio_extra: a.precio != null ? a.precio : p.precio, // override o precio del producto
        precio_override: a.precio,                            // null = hereda
        precio_producto: p.precio,
        costo: p.costo,
      };
    });
}

// --- promos (ofertas) mapeadas: costo y precio de combo ---------------------
// Devuelve { [ofertaId]: { nombre, costo_combo, precio_combo } }.
// costo_combo = suma(costo_total * cantidad) de los productos del combo.
// precio_combo = valor (si tipo precio_especial) o suma de precios publicos.
async function getPromosMap(pool, ofertaIds) {
  const ids = [...new Set((ofertaIds || []).filter((x) => x != null).map(Number))];
  if (ids.length === 0) return {};
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT o.id, o.nombre, o.tipo, o.valor, o.estado, o.categoria_carta, o.subcategoria_carta,
            COALESCE(SUM(p.costo_total * op.cantidad), 0) AS costo_combo,
            COALESCE(SUM(p.precio_publico * op.cantidad), 0) AS precio_suma
     FROM ofertas o
     LEFT JOIN oferta_productos op ON op.oferta_id = o.id
     LEFT JOIN productos p ON p.id = op.producto_id AND p.activo = 1
     WHERE o.id IN (${placeholders}) AND o.activo = 1
     GROUP BY o.id, o.nombre, o.tipo, o.valor, o.estado, o.categoria_carta, o.subcategoria_carta`,
    ids
  );

  // Composicion del combo (que productos incluye, con cantidades y rol).
  // COALESCE hace que funcione aunque la migracion de rol no este corrida.
  const [items] = await pool.query(
    `SELECT op.oferta_id, p.nombre, op.cantidad, p.precio_publico,
            COALESCE(op.rol, 'pago') AS rol,
            COALESCE(op.descuento_pct, 100) AS descuento_pct
     FROM oferta_productos op
     JOIN productos p ON p.id = op.producto_id AND p.activo = 1
     WHERE op.oferta_id IN (${placeholders})
     ORDER BY p.nombre`,
    ids
  );
  const productosByOferta = {};
  const precioRegaloByOferta = {}; // precio automatico tipo compra_regalo
  for (const it of items) {
    const cant = parseFloat(it.cantidad) || 1;
    const precio = parseFloat(it.precio_publico) || 0;
    const desc = parseFloat(it.descuento_pct) || 0;
    const esRegalo = it.rol === 'regalo';
    if (!productosByOferta[it.oferta_id]) { productosByOferta[it.oferta_id] = []; precioRegaloByOferta[it.oferta_id] = 0; }
    productosByOferta[it.oferta_id].push({
      nombre: it.nombre,
      cantidad: cant,
      es_regalo: esRegalo,
      descuento_pct: esRegalo ? desc : 0,
    });
    // Aporte al precio: pagados a precio lista; regalos con su descuento aplicado
    precioRegaloByOferta[it.oferta_id] += esRegalo
      ? precio * cant * (1 - Math.min(100, desc) / 100)
      : precio * cant;
  }

  const map = {};
  for (const r of rows) {
    let precio_combo;
    if (r.tipo === 'precio_especial') {
      precio_combo = parseFloat(r.valor) || 0;
    } else if (r.tipo === 'compra_regalo') {
      // valor > 0 = precio especial escrito a mano; 0 = automatico
      const override = parseFloat(r.valor) || 0;
      precio_combo = override > 0 ? override : (precioRegaloByOferta[r.id] || 0);
    } else {
      precio_combo = parseFloat(r.precio_suma) || 0;
    }
    map[r.id] = {
      nombre: r.nombre,
      tipo: r.tipo,
      estado: r.estado || 'activa',
      categoria_carta: r.categoria_carta || 'Promo', // 'Promo' | 'Combo' | 'Boxs'
      subcategoria_carta: r.subcategoria_carta || null, // opcional (ej: 'Para regalar')
      costo_combo: parseFloat(r.costo_combo) || 0, // SIEMPRE incluye el costo de los regalos
      precio_combo,
      productos: productosByOferta[r.id] || [],
    };
  }
  return map;
}

// --- ventana "nuevo" desde configuracion ----------------------------------
async function getDiasNuevo(pool) {
  try {
    const [r] = await pool.query("SELECT valor FROM configuracion WHERE clave = 'dias_nuevo_carta' LIMIT 1");
    const n = r.length ? parseInt(r[0].valor, 10) : NaN;
    return Number.isNaN(n) || n <= 0 ? 45 : n;
  } catch {
    return 45;
  }
}

// --- resolucion para la API publica (precio_final / extra ya calculados) ---
function resolverParaMenu(row, base, dias, hoy) {
  const tamanos = parseTamanos(row.tamanos).map((t) => ({
    nombre: t.nombre,
    precio: t.precio != null ? t.precio : base, // precio final (hereda base si null)
  }));
  const sabores = parseSabores(row.sabores).map((s) => ({
    nombre: s.nombre,
    precio: s.precio != null ? s.precio : base, // precio final (hereda base si null)
    es_nuevo: esNuevo(s.fecha_nuevo, dias, hoy),
  }));
  const toppings = parseToppings(row.toppings).map((t) => ({
    nombre: t.nombre,
    precio_extra: t.precio || 0, // aditivo
  }));
  // Temperaturas: se expone el precio FINAL y tambien la diferencia contra el
  // base, para que el menu pueda mostrar "sin cargo" o "+$500" sin recalcular.
  const temperaturas = temperaturasEfectivas(row).map((t) => {
    const precio = t.precio != null ? t.precio : base;
    return {
      nombre: t.nombre,
      precio,
      precio_extra: precio - base,
      es_base: t.precio == null || precio === base,
    };
  });
  // Grupos de opciones: mismo calculo que temperaturas, por cada opcion de cada grupo.
  const grupos_opciones = parseGruposOpciones(row.grupos_opciones).map((g) => ({
    nombre: g.nombre,
    opciones: g.opciones.map((o) => {
      const precio = o.precio != null ? o.precio : base;
      return {
        nombre: o.nombre,
        precio,
        precio_extra: precio - base,
        es_base: o.precio == null || precio === base,
      };
    }),
  }));
  return { tamanos, sabores, toppings, temperaturas, grupos_opciones };
}

module.exports = {
  precioOpcional, precioExtra,
  toDateStr, parseFechaDMY, diasDesde, esNuevo,
  parseTamanos, parseSabores, parseToppings, parseTemperaturas, parseGruposOpciones,
  serializeTamanos, serializeSabores, serializeToppings, serializeTemperaturas, serializeGruposOpciones,
  temperaturasEfectivas, TEMPERATURAS_DEFAULT,
  getDiasNuevo, resolverParaMenu, getPromosMap,
  parseAdiciones, serializeAdiciones, collectAdicionIds, getAdicionesMap, resolverAdiciones,
};
