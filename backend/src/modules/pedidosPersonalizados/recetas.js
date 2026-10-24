const pool = require('../../config/db');
const { invalidarCatalogo } = require('./catalogo');
const { lineasPorDueno, validarLineas, verificarFuentes, insertarLineas } = require('./editor');
const { ErrorPedido } = require('./pedidos');

// ============================================================================
// PESTANA RECETAS: lista de trabajo para costear lo publicado.
// Arma sola, a partir de los productos ACTIVOS, todo lo que necesita receta:
//   - cada producto unico (sin pasos): su receta base
//   - cada opcion que suma precio o va por kg (harina, version de torta,
//     relleno, topping, proteina...); los tamanos (solo peso) no llevan
//   - cada opcion de los grupos de la biblioteca que usan esos productos
// Las recetas son subrecetas de CoffitCost (se recostean solas); aca solo se
// vinculan con la cantidad justa.
// ============================================================================

const r2 = (n) => Math.round(n * 100) / 100;

// Costo de una lista de lineas: fijo + por kg (las "x kg" se multiplican por
// el peso del item). Mismo calculo que el editor.
function costoDe(lineas) {
  let fijo = 0;
  let porKg = 0;
  let incompleto = false;
  for (const l of lineas) {
    if (l.costo_unitario == null) incompleto = true;
    const c = l.cantidad * (l.costo_unitario ?? 0);
    if (l.por_kg) porKg += c; else fijo += c;
  }
  return { fijo: r2(fijo), por_kg: r2(porKg), incompleto };
}

// Estado y food cost de una fila. `peso` = kg del item si se conoce.
// El costo se compara en la misma unidad que el precio: por kg contra el
// precio por kg (version de torta), fijo contra el precio fijo.
function evaluar(lineas, precio, precioModo, peso) {
  const costo = costoDe(lineas);
  if (!lineas.length) return { estado: 'falta', costo, food_cost: null, aviso: null };

  let aviso = null;
  let comparable;
  if (precioModo === 'por_kg') {
    comparable = costo.por_kg + (peso ? costo.fijo / peso : 0);
  } else {
    // Una linea "x kg" sin peso multiplica por 0: es un error de carga
    if (costo.por_kg > 0 && !peso) aviso = 'Tiene líneas "x kg" pero no tiene peso: ese costo da $0';
    comparable = costo.fijo + costo.por_kg * (peso || 0);
  }
  if (costo.incompleto) aviso = aviso || 'Usa un ingrediente o receta que ya no existe';

  const estado = aviso || comparable <= 0 ? 'incompleta' : 'ok';
  const foodCost = estado === 'ok' && precio > 0 ? Math.round((comparable / precio) * 1000) / 10 : null;
  return { estado, costo, food_cost: foodCost, aviso };
}

async function listar() {
  const [productos] = await pool.query(
    'SELECT id, nombre, categoria, precio_base, orden FROM pp_productos WHERE activo = 1 ORDER BY orden, nombre'
  );
  const ids = productos.map((p) => p.id);
  const [pasos] = ids.length
    ? await pool.query('SELECT id, producto_id, nombre, orden, grupo_id FROM pp_pasos WHERE producto_id IN (?) ORDER BY orden, id', [ids])
    : [[]];
  const pasoIds = pasos.map((s) => s.id);
  const grupoIds = [...new Set(pasos.map((s) => s.grupo_id).filter((g) => g != null))];
  const [opciones] = pasoIds.length || grupoIds.length
    ? await pool.query(
      `SELECT o.*, padre.nombre AS padre_nombre
       FROM pp_opciones o
       LEFT JOIN pp_opciones padre ON padre.id = o.depende_de_opcion_id
       WHERE o.activo = 1 AND (o.paso_id IN (?) OR o.grupo_id IN (?))
       ORDER BY o.orden, o.id`,
      [pasoIds.length ? pasoIds : [0], grupoIds.length ? grupoIds : [0]]
    )
    : [[]];
  const [grupos] = grupoIds.length
    ? await pool.query('SELECT id, nombre FROM pp_grupos WHERE id IN (?) AND activo = 1', [grupoIds])
    : [[]];

  const lineasProducto = await lineasPorDueno('producto_id', ids);
  const lineasOpcion = await lineasPorDueno('opcion_id', opciones.map((o) => o.id));

  const necesidades = [];
  const fila = (base, lineas, precio, precioModo, peso) => ({ ...base, lineas, ...evaluar(lineas, precio, precioModo, peso) });
  const requiere = (o, lineas) => Number(o.precio) > 0 || o.precio_modo === 'por_kg' || lineas.length > 0;

  for (const p of productos) {
    const susPasos = pasos.filter((s) => s.producto_id === p.id);
    const base = lineasProducto.get(p.id) || [];
    if (susPasos.length === 0 || base.length) {
      necesidades.push(fila({
        clave: `p${p.id}`,
        destino: { tipo: 'producto', id: p.id },
        seccion: p.nombre,
        producto_id: p.id,
        paso: susPasos.length ? 'Receta base' : null,
        nombre: susPasos.length ? 'Lo que lleva siempre' : p.nombre,
        detalle: susPasos.length ? null : 'Producto único',
        precio: Number(p.precio_base),
        precio_modo: 'fijo',
        peso_kg: null,
        sugerencia: { gramos: null, porKg: false },
      }, base, Number(p.precio_base), 'fijo', null));
    }
    for (const s of susPasos) {
      for (const o of opciones.filter((x) => x.paso_id === s.id)) {
        const lineas = lineasOpcion.get(o.id) || [];
        if (!requiere(o, lineas)) continue;
        const peso = o.peso_kg == null ? null : Number(o.peso_kg);
        necesidades.push(fila({
          clave: `o${o.id}`,
          destino: { tipo: 'opcion', id: o.id },
          seccion: p.nombre,
          producto_id: p.id,
          paso: s.nombre,
          nombre: o.nombre,
          detalle: o.padre_nombre ? `solo ${o.padre_nombre}` : null,
          precio: Number(o.precio),
          precio_modo: o.precio_modo,
          peso_kg: peso,
          sugerencia: { gramos: peso ? Math.round(peso * 1000) : null, porKg: o.precio_modo === 'por_kg' },
        }, lineas, Number(o.precio), o.precio_modo, peso));
      }
    }
  }

  // Grupos de la biblioteca: cada opcion una sola vez (vale para todos los
  // productos que usan el grupo).
  for (const g of grupos) {
    for (const o of opciones.filter((x) => x.grupo_id === g.id)) {
      const lineas = lineasOpcion.get(o.id) || [];
      if (!requiere(o, lineas)) continue;
      necesidades.push(fila({
        clave: `o${o.id}`,
        destino: { tipo: 'opcion', id: o.id },
        seccion: `Grupo ${g.nombre}`,
        producto_id: null,
        paso: g.nombre,
        nombre: o.nombre,
        detalle: 'vale para todos los productos que usan el grupo',
        precio: Number(o.precio),
        precio_modo: 'fijo',
        peso_kg: null,
        sugerencia: { gramos: null, porKg: false },
      }, lineas, Number(o.precio), 'fijo', null));
    }
  }

  // Recetas (subrecetas de CoffitCost) que ya usa Personalizados
  const usos = new Map();
  for (const n of necesidades) {
    for (const l of n.lineas) {
      if (l.subreceta_id == null) continue;
      if (!usos.has(l.subreceta_id)) usos.set(l.subreceta_id, new Set());
      usos.get(l.subreceta_id).add(n.clave);
    }
  }
  const [subs] = usos.size
    ? await pool.query(
      `SELECT id, nombre, tipo_rendimiento, rendimiento_gramos, costo_total, costo_por_100g
       FROM subrecetas WHERE id IN (?) ORDER BY nombre`, [[...usos.keys()]])
    : [[]];
  const recetas = subs.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    tipo_rendimiento: s.tipo_rendimiento,
    rendimiento: Number(s.rendimiento_gramos),
    costo_total: Number(s.costo_total),
    costo_por_kg: s.tipo_rendimiento === 'porciones' ? null : r2(Number(s.costo_por_100g) * 10),
    usos: usos.get(s.id).size,
  }));

  return { necesidades, recetas };
}

// Reemplaza la receta de un producto unico (base) o de una opcion.
async function asignar(destino, lineasCrudas) {
  const tipo = destino?.tipo;
  const id = Number(destino?.id);
  if (!['producto', 'opcion'].includes(tipo) || !id) throw new ErrorPedido('Destino invalido');
  const tabla = tipo === 'producto' ? 'pp_productos' : 'pp_opciones';
  const [[existe]] = await pool.query(`SELECT id FROM ${tabla} WHERE id = ?`, [id]);
  if (!existe) throw new ErrorPedido(tipo === 'producto' ? 'Producto no encontrado' : 'Opcion no encontrada', 404);

  const lineas = await validarLineas(lineasCrudas, 'Receta');
  await verificarFuentes(lineas);

  const columna = tipo === 'producto' ? 'producto_id' : 'opcion_id';
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM pp_receta_lineas WHERE ${columna} = ?`, [id]);
    await insertarLineas(conn, { [columna]: id }, lineas);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  invalidarCatalogo();
  return (await lineasPorDueno(columna, [id])).get(id);
}

module.exports = { listar, asignar, costoDe, evaluar };
