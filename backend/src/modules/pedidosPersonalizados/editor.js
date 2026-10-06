const pool = require('../../config/db');
const { invalidarCatalogo } = require('./catalogo');
const { ErrorPedido } = require('./pedidos');

// ============================================================================
// EDITOR DEL PANEL: lee y guarda un producto armable completo (pasos,
// opciones, ajustes de grupo y recetas) o un grupo de la biblioteca.
//
// Se guarda el arbol entero en una transaccion, pero con UPSERT: las opciones
// que ya existen conservan su id (el POS y la tienda las referencian en
// carritos y cotizaciones). Lo que no viene en el arbol se borra.
// En el arbol, una opcion nueva trae `key` (texto) en vez de `id`, y
// `depende_de` puede apuntar a un id o a la key de otra opcion del producto.
// ============================================================================

const MODOS = ['fijo', 'por_kg'];

const texto = (v, max) => {
  const s = v == null ? '' : String(v).trim();
  return s ? s.slice(0, max) : null;
};
const monto = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};
const etiquetas = (v) => JSON.stringify(
  (Array.isArray(v) ? v : []).map((e) => texto(e, 40)).filter(Boolean).slice(0, 20)
);
const idONull = (v) => (v == null || v === '' ? null : Number(v));
const ref = (o) => String(o.id ?? o.key);

// ---------------------------------------------------------------------------
// RECETAS
// ---------------------------------------------------------------------------

// Lineas con nombre, unidad y costo unitario vigente, para mostrar en el
// editor el costo de cada opcion mientras se arma.
const SELECT_LINEAS = `
  SELECT l.*,
         COALESCE(i.nombre, s.nombre, p.nombre, l.nombre_manual) AS nombre,
         CASE WHEN l.ingrediente_id IS NOT NULL THEN COALESCE(u.abreviatura, 'g')
              WHEN l.subreceta_id IS NOT NULL THEN IF(s.tipo_rendimiento = 'porciones', 'porc', 'g')
              WHEN l.cc_producto_id IS NOT NULL THEN 'porc'
              ELSE 'u' END AS unidad,
         CASE WHEN l.ingrediente_id IS NOT NULL THEN i.costo_con_desperdicio
              WHEN l.subreceta_id IS NOT NULL THEN
                IF(s.tipo_rendimiento = 'porciones', s.costo_total / NULLIF(s.rendimiento_gramos, 0), s.costo_por_100g / 100)
              WHEN l.cc_producto_id IS NOT NULL THEN p.costo_total
              ELSE l.costo_manual END AS costo_unitario
  FROM pp_receta_lineas l
  LEFT JOIN ingredientes i ON i.id = l.ingrediente_id
  LEFT JOIN unidades u ON u.id = i.unidad_id
  LEFT JOIN subrecetas s ON s.id = l.subreceta_id
  LEFT JOIN productos p ON p.id = l.cc_producto_id`;

function lineaParaEditor(l) {
  return {
    ingrediente_id: l.ingrediente_id,
    subreceta_id: l.subreceta_id,
    cc_producto_id: l.cc_producto_id,
    nombre_manual: l.nombre_manual,
    costo_manual: l.costo_manual == null ? null : Number(l.costo_manual),
    cantidad: Number(l.cantidad),
    por_kg: !!l.por_kg,
    nombre: l.nombre,
    unidad: l.unidad,
    costo_unitario: l.costo_unitario == null ? null : Number(l.costo_unitario), // null = la fuente ya no existe
  };
}

async function lineasPorDueno(columna, ids) {
  const m = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return m;
  const [rows] = await pool.query(`${SELECT_LINEAS} WHERE l.${columna} IN (?) ORDER BY l.id`, [ids]);
  for (const r of rows) m.get(r[columna]).push(lineaParaEditor(r));
  return m;
}

// Valida y normaliza las lineas de receta que manda el editor. Cada linea
// tiene UNA fuente; las que apuntan a algo que no existe se rechazan.
async function validarLineas(lineas, donde) {
  const salida = [];
  for (const l of Array.isArray(lineas) ? lineas : []) {
    const fuente = {
      ingrediente_id: idONull(l.ingrediente_id),
      subreceta_id: idONull(l.subreceta_id),
      cc_producto_id: idONull(l.cc_producto_id),
      nombre_manual: null,
      costo_manual: null,
    };
    const conFuente = [fuente.ingrediente_id, fuente.subreceta_id, fuente.cc_producto_id].filter((v) => v != null).length;
    if (conFuente > 1) throw new ErrorPedido(`${donde}: una linea de receta tiene mas de un origen`);
    if (conFuente === 0) {
      fuente.nombre_manual = texto(l.nombre_manual, 120);
      if (!fuente.nombre_manual) continue; // fila vacia del editor: se descarta
      fuente.costo_manual = monto(l.costo_manual);
    }
    const cantidad = Number(l.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) throw new ErrorPedido(`${donde}: cantidad invalida en la receta`);
    salida.push({ ...fuente, cantidad: Math.round(cantidad * 1000) / 1000, por_kg: l.por_kg ? 1 : 0 });
  }
  return salida;
}

async function verificarFuentes(lineas) {
  const tablas = [['ingrediente_id', 'ingredientes'], ['subreceta_id', 'subrecetas'], ['cc_producto_id', 'productos']];
  for (const [col, tabla] of tablas) {
    const ids = [...new Set(lineas.map((l) => l[col]).filter((v) => v != null))];
    if (!ids.length) continue;
    const [rows] = await pool.query(`SELECT id FROM ${tabla} WHERE id IN (?)`, [ids]);
    if (rows.length !== ids.length) throw new ErrorPedido(`La receta usa ${tabla} que ya no existen`);
  }
}

async function insertarLineas(conn, dueno, lineas) {
  if (!lineas.length) return;
  await conn.query(
    `INSERT INTO pp_receta_lineas
       (producto_id, opcion_id, ingrediente_id, subreceta_id, cc_producto_id, nombre_manual, costo_manual, cantidad, por_kg)
     VALUES ?`,
    [lineas.map((l) => [dueno.producto_id ?? null, dueno.opcion_id ?? null, l.ingrediente_id, l.subreceta_id,
      l.cc_producto_id, l.nombre_manual, l.costo_manual, l.cantidad, l.por_kg])]
  );
}

// ---------------------------------------------------------------------------
// PRODUCTOS
// ---------------------------------------------------------------------------

async function listarProductos() {
  const [rows] = await pool.query(
    `SELECT p.id, p.nombre, p.categoria, p.imagen, p.emoji, p.precio_base, p.activo, p.orden, p.con_anticipacion,
            (SELECT COUNT(*) FROM pp_pasos s WHERE s.producto_id = p.id) AS pasos
     FROM pp_productos p
     ORDER BY p.activo DESC, p.orden, p.nombre`
  );
  return rows.map((r) => ({ ...r, precio_base: Number(r.precio_base), activo: !!r.activo, con_anticipacion: !!r.con_anticipacion }));
}

async function leerProducto(id) {
  const [[p]] = await pool.query('SELECT * FROM pp_productos WHERE id = ?', [id]);
  if (!p) return null;
  const [pasos] = await pool.query('SELECT * FROM pp_pasos WHERE producto_id = ? ORDER BY orden, id', [id]);
  const pasoIds = pasos.map((s) => s.id);
  const [opciones] = pasoIds.length
    ? await pool.query('SELECT * FROM pp_opciones WHERE paso_id IN (?) ORDER BY orden, id', [pasoIds])
    : [[]];
  const [ajustes] = pasoIds.length
    ? await pool.query('SELECT * FROM pp_paso_ajustes WHERE paso_id IN (?)', [pasoIds])
    : [[]];
  const recetaOpcion = await lineasPorDueno('opcion_id', opciones.map((o) => o.id));
  const recetaBase = (await lineasPorDueno('producto_id', [p.id])).get(p.id);

  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    categoria: p.categoria,
    imagen: p.imagen,
    emoji: p.emoji,
    precio_base: Number(p.precio_base),
    etiquetas: p.etiquetas || [],
    es_congelado: !!p.es_congelado,
    con_anticipacion: !!p.con_anticipacion,
    activo: !!p.activo,
    orden: p.orden,
    receta: recetaBase,
    pasos: pasos.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      orden: s.orden,
      min_sel: s.min_sel,
      max_sel: s.max_sel,
      grupo_id: s.grupo_id,
      ajustes: ajustes
        .filter((a) => a.paso_id === s.id)
        .map((a) => ({ opcion_id: a.opcion_id, precio: a.precio == null ? null : Number(a.precio), oculto: !!a.oculto })),
      opciones: opciones.filter((o) => o.paso_id === s.id).map((o) => ({
        id: o.id,
        nombre: o.nombre,
        descripcion: o.descripcion,
        precio: Number(o.precio),
        precio_modo: o.precio_modo,
        peso_kg: o.peso_kg == null ? null : Number(o.peso_kg),
        depende_de: o.depende_de_opcion_id,
        etiquetas: o.etiquetas || [],
        imagen: o.imagen,
        activo: !!o.activo,
        orden: o.orden,
        receta: recetaOpcion.get(o.id),
      })),
    })),
  };
}

// Valida el arbol completo ANTES de escribir nada.
async function validarArbol(arbol) {
  const nombre = texto(arbol.nombre, 150);
  if (!nombre) throw new ErrorPedido('El producto necesita un nombre');

  const pasos = Array.isArray(arbol.pasos) ? arbol.pasos : [];
  const gruposUsados = new Set();
  const pasoDeOpcion = new Map(); // ref -> indice del paso
  const salidaPasos = [];
  const todasLasLineas = [];

  const recetaBase = await validarLineas(arbol.receta, 'Receta base');
  todasLasLineas.push(...recetaBase);

  for (const [i, s] of pasos.entries()) {
    const nombrePaso = texto(s.nombre, 100);
    if (!nombrePaso) throw new ErrorPedido(`El paso ${i + 1} necesita un nombre`);
    const min = Number(s.min_sel);
    const max = Number(s.max_sel);
    if (!Number.isInteger(min) || min < 0) throw new ErrorPedido(`${nombrePaso}: minimo invalido`);
    if (!Number.isInteger(max) || max < Math.max(1, min)) throw new ErrorPedido(`${nombrePaso}: el maximo tiene que ser al menos ${Math.max(1, min)}`);

    const grupoId = idONull(s.grupo_id);
    if (grupoId != null) {
      // Un mismo grupo en dos pasos haria ambigua la opcion elegida.
      if (gruposUsados.has(grupoId)) throw new ErrorPedido(`${nombrePaso}: ese grupo ya se usa en otro paso`);
      gruposUsados.add(grupoId);
    }

    const opciones = [];
    for (const o of Array.isArray(s.opciones) ? s.opciones : []) {
      if (o.id == null && !o.key) throw new ErrorPedido(`${nombrePaso}: opcion sin identificador`);
      const nombreOp = texto(o.nombre, 150);
      if (!nombreOp) throw new ErrorPedido(`${nombrePaso}: hay una opcion sin nombre`);
      if (pasoDeOpcion.has(ref(o))) throw new ErrorPedido(`${nombrePaso}: opcion repetida`);
      pasoDeOpcion.set(ref(o), i);
      const peso = o.peso_kg == null || o.peso_kg === '' ? null : Number(o.peso_kg);
      if (peso != null && (!Number.isFinite(peso) || peso < 0)) throw new ErrorPedido(`${nombreOp}: peso invalido`);
      const receta = await validarLineas(o.receta, nombreOp);
      todasLasLineas.push(...receta);
      opciones.push({
        id: o.id == null ? null : Number(o.id),
        ref: ref(o),
        nombre: nombreOp,
        descripcion: texto(o.descripcion, 300),
        precio: monto(o.precio),
        precio_modo: MODOS.includes(o.precio_modo) ? o.precio_modo : 'fijo',
        peso_kg: peso,
        depende_de: o.depende_de == null || o.depende_de === '' ? null : String(o.depende_de),
        etiquetas: etiquetas(o.etiquetas),
        imagen: texto(o.imagen, 255),
        activo: o.activo === false ? 0 : 1,
        orden: Number.isInteger(o.orden) ? o.orden : opciones.length,
        receta,
      });
    }

    salidaPasos.push({
      id: s.id == null ? null : Number(s.id),
      nombre: nombrePaso,
      orden: i,
      min_sel: min,
      max_sel: max,
      grupo_id: grupoId,
      ajustes: (Array.isArray(s.ajustes) ? s.ajustes : [])
        .filter((a) => a.oculto || (a.precio != null && a.precio !== ''))
        .map((a) => ({ opcion_id: Number(a.opcion_id), precio: a.precio == null || a.precio === '' ? null : monto(a.precio), oculto: a.oculto ? 1 : 0 })),
      opciones,
    });
  }

  // Una opcion solo puede depender de una opcion de un paso ANTERIOR (si no,
  // nunca se podria elegir: los pasos se recorren en orden).
  for (const [i, s] of salidaPasos.entries()) {
    for (const o of s.opciones) {
      if (o.depende_de == null) continue;
      const pasoPadre = pasoDeOpcion.get(o.depende_de);
      if (pasoPadre == null) throw new ErrorPedido(`${o.nombre}: depende de una opcion que no existe`);
      if (pasoPadre >= i) throw new ErrorPedido(`${o.nombre}: solo puede depender de una opcion de un paso anterior`);
    }
  }

  await verificarFuentes(todasLasLineas);

  return {
    nombre,
    descripcion: texto(arbol.descripcion, 500),
    categoria: texto(arbol.categoria, 80),
    imagen: texto(arbol.imagen, 255),
    emoji: texto(arbol.emoji, 16),
    precio_base: monto(arbol.precio_base),
    etiquetas: etiquetas(arbol.etiquetas),
    es_congelado: arbol.es_congelado ? 1 : 0,
    con_anticipacion: arbol.con_anticipacion ? 1 : 0,
    activo: arbol.activo === false ? 0 : 1,
    orden: Number.isInteger(arbol.orden) ? arbol.orden : 0,
    receta: recetaBase,
    pasos: salidaPasos,
  };
}

async function guardarProducto(idExistente, arbol, { origenRef = null } = {}) {
  const datos = await validarArbol(arbol);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const cols = [datos.nombre, datos.descripcion, datos.categoria, datos.imagen, datos.emoji,
      datos.precio_base, datos.etiquetas, datos.es_congelado, datos.con_anticipacion, datos.activo, datos.orden];
    let productoId = idExistente;
    if (productoId) {
      const [r] = await conn.query(
        `UPDATE pp_productos SET nombre = ?, descripcion = ?, categoria = ?, imagen = ?, emoji = ?,
           precio_base = ?, etiquetas = ?, es_congelado = ?, con_anticipacion = ?, activo = ?, orden = ? WHERE id = ?`,
        [...cols, productoId]
      );
      if (!r.affectedRows) throw new ErrorPedido('Producto no encontrado', 404);
    } else {
      const [r] = await conn.query(
        `INSERT INTO pp_productos
           (nombre, descripcion, categoria, imagen, emoji, precio_base, etiquetas, es_congelado, con_anticipacion, activo, orden, origen_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...cols, origenRef]
      );
      productoId = r.insertId;
    }

    // Ids que hoy pertenecen al producto: solo esos se pueden actualizar
    // (un id ajeno en el arbol no puede "robar" la opcion de otro producto).
    const [pasosActuales] = await conn.query('SELECT id FROM pp_pasos WHERE producto_id = ?', [productoId]);
    const pasosPropios = new Set(pasosActuales.map((r) => r.id));
    const [opcActuales] = pasosPropios.size
      ? await conn.query('SELECT id FROM pp_opciones WHERE paso_id IN (?)', [[...pasosPropios]])
      : [[]];
    const opcPropias = new Set(opcActuales.map((r) => r.id));

    const pasosQueQuedan = [];
    const opcQueQuedan = [];
    const idPorRef = new Map();

    for (const s of datos.pasos) {
      let pasoId = s.id;
      if (pasoId != null && pasosPropios.has(pasoId)) {
        await conn.query(
          'UPDATE pp_pasos SET nombre = ?, orden = ?, min_sel = ?, max_sel = ?, grupo_id = ? WHERE id = ?',
          [s.nombre, s.orden, s.min_sel, s.max_sel, s.grupo_id, pasoId]
        );
      } else {
        const [r] = await conn.query(
          'INSERT INTO pp_pasos (producto_id, nombre, orden, min_sel, max_sel, grupo_id) VALUES (?, ?, ?, ?, ?, ?)',
          [productoId, s.nombre, s.orden, s.min_sel, s.max_sel, s.grupo_id]
        );
        pasoId = r.insertId;
      }
      s.dbId = pasoId;
      pasosQueQuedan.push(pasoId);

      for (const o of s.opciones) {
        const valores = [pasoId, o.nombre, o.descripcion, o.precio, o.precio_modo, o.peso_kg, o.etiquetas, o.imagen, o.activo, o.orden];
        let opcionId = o.id;
        if (opcionId != null && opcPropias.has(opcionId)) {
          await conn.query(
            `UPDATE pp_opciones SET paso_id = ?, nombre = ?, descripcion = ?, precio = ?, precio_modo = ?,
               peso_kg = ?, etiquetas = ?, imagen = ?, activo = ?, orden = ?, depende_de_opcion_id = NULL
             WHERE id = ?`,
            [...valores, opcionId]
          );
        } else {
          const [r] = await conn.query(
            `INSERT INTO pp_opciones
               (paso_id, nombre, descripcion, precio, precio_modo, peso_kg, etiquetas, imagen, activo, orden)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            valores
          );
          opcionId = r.insertId;
        }
        o.dbId = opcionId;
        idPorRef.set(o.ref, opcionId);
        opcQueQuedan.push(opcionId);
      }
    }

    // Borrar lo que ya no esta (cascada: opciones, ajustes y recetas)
    const sobranOpc = [...opcPropias].filter((id) => !opcQueQuedan.includes(id));
    if (sobranOpc.length) await conn.query('DELETE FROM pp_opciones WHERE id IN (?)', [sobranOpc]);
    const sobranPasos = [...pasosPropios].filter((id) => !pasosQueQuedan.includes(id));
    if (sobranPasos.length) await conn.query('DELETE FROM pp_pasos WHERE id IN (?)', [sobranPasos]);

    // Segunda pasada: dependencias (ya con todos los ids reales)
    for (const s of datos.pasos) {
      for (const o of s.opciones) {
        if (o.depende_de == null) continue;
        await conn.query('UPDATE pp_opciones SET depende_de_opcion_id = ? WHERE id = ?', [idPorRef.get(o.depende_de), o.dbId]);
      }
    }

    // Ajustes y recetas: se reescriben enteros
    if (pasosQueQuedan.length) await conn.query('DELETE FROM pp_paso_ajustes WHERE paso_id IN (?)', [pasosQueQuedan]);
    const ajustes = datos.pasos.flatMap((s) => (s.grupo_id == null ? [] : s.ajustes.map((a) => [s.dbId, a.opcion_id, a.precio, a.oculto])));
    if (ajustes.length) {
      // Solo opciones que pertenecen al grupo del paso
      const [validas] = await conn.query(
        'SELECT id, grupo_id FROM pp_opciones WHERE id IN (?) AND grupo_id IS NOT NULL', [ajustes.map((a) => a[1])]
      );
      const grupoDe = new Map(validas.map((v) => [v.id, v.grupo_id]));
      const grupoPaso = new Map(datos.pasos.map((s) => [s.dbId, s.grupo_id]));
      const filas = ajustes.filter(([pasoId, opcionId]) => grupoDe.get(opcionId) === grupoPaso.get(pasoId));
      if (filas.length) await conn.query('INSERT INTO pp_paso_ajustes (paso_id, opcion_id, precio, oculto) VALUES ?', [filas]);
    }

    await conn.query(
      `DELETE FROM pp_receta_lineas WHERE producto_id = ? ${opcQueQuedan.length ? 'OR opcion_id IN (?)' : ''}`,
      opcQueQuedan.length ? [productoId, opcQueQuedan] : [productoId]
    );
    await insertarLineas(conn, { producto_id: productoId }, datos.receta);
    for (const s of datos.pasos) {
      for (const o of s.opciones) await insertarLineas(conn, { opcion_id: o.dbId }, o.receta);
    }

    await conn.commit();
    invalidarCatalogo();
    return productoId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function borrarProducto(id) {
  const [r] = await pool.query('DELETE FROM pp_productos WHERE id = ?', [id]);
  invalidarCatalogo();
  return r.affectedRows > 0;
}

// ---------------------------------------------------------------------------
// GRUPOS (biblioteca de opciones reutilizables)
// ---------------------------------------------------------------------------

async function listarGrupos() {
  const [grupos] = await pool.query('SELECT * FROM pp_grupos ORDER BY nombre');
  const [opciones] = await pool.query('SELECT * FROM pp_opciones WHERE grupo_id IS NOT NULL ORDER BY orden, id');
  const recetas = await lineasPorDueno('opcion_id', opciones.map((o) => o.id));
  const [uso] = await pool.query(
    `SELECT s.grupo_id, COUNT(*) AS n FROM pp_pasos s WHERE s.grupo_id IS NOT NULL GROUP BY s.grupo_id`
  );
  const usos = new Map(uso.map((u) => [u.grupo_id, u.n]));
  return grupos.map((g) => ({
    id: g.id,
    nombre: g.nombre,
    activo: !!g.activo,
    usado_en: usos.get(g.id) || 0,
    opciones: opciones.filter((o) => o.grupo_id === g.id).map((o) => ({
      id: o.id,
      nombre: o.nombre,
      descripcion: o.descripcion,
      precio: Number(o.precio),
      etiquetas: o.etiquetas || [],
      imagen: o.imagen,
      activo: !!o.activo,
      orden: o.orden,
      receta: recetas.get(o.id),
    })),
  }));
}

async function guardarGrupo(idExistente, grupo, { origenRef = null } = {}) {
  const nombre = texto(grupo.nombre, 100);
  if (!nombre) throw new ErrorPedido('El grupo necesita un nombre');
  const opciones = [];
  for (const o of Array.isArray(grupo.opciones) ? grupo.opciones : []) {
    const nombreOp = texto(o.nombre, 150);
    if (!nombreOp) throw new ErrorPedido('Hay una opcion sin nombre');
    opciones.push({
      id: o.id == null ? null : Number(o.id),
      nombre: nombreOp,
      descripcion: texto(o.descripcion, 300),
      precio: monto(o.precio),
      etiquetas: etiquetas(o.etiquetas),
      imagen: texto(o.imagen, 255),
      activo: o.activo === false ? 0 : 1,
      orden: opciones.length,
      receta: await validarLineas(o.receta, nombreOp),
    });
  }
  await verificarFuentes(opciones.flatMap((o) => o.receta));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let grupoId = idExistente;
    if (grupoId) {
      const [r] = await conn.query('UPDATE pp_grupos SET nombre = ?, activo = ? WHERE id = ?', [nombre, grupo.activo === false ? 0 : 1, grupoId]);
      if (!r.affectedRows) throw new ErrorPedido('Grupo no encontrado', 404);
    } else {
      const [r] = await conn.query('INSERT INTO pp_grupos (nombre, activo, origen_ref) VALUES (?, ?, ?)', [nombre, grupo.activo === false ? 0 : 1, origenRef]);
      grupoId = r.insertId;
    }

    const [actuales] = await conn.query('SELECT id FROM pp_opciones WHERE grupo_id = ?', [grupoId]);
    const propias = new Set(actuales.map((r) => r.id));
    const quedan = [];
    for (const o of opciones) {
      const valores = [o.nombre, o.descripcion, o.precio, o.etiquetas, o.imagen, o.activo, o.orden];
      if (o.id != null && propias.has(o.id)) {
        await conn.query(
          'UPDATE pp_opciones SET nombre = ?, descripcion = ?, precio = ?, etiquetas = ?, imagen = ?, activo = ?, orden = ? WHERE id = ?',
          [...valores, o.id]
        );
      } else {
        const [r] = await conn.query(
          `INSERT INTO pp_opciones (grupo_id, nombre, descripcion, precio, etiquetas, imagen, activo, orden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [grupoId, ...valores]
        );
        o.id = r.insertId;
      }
      quedan.push(o.id);
    }
    const sobran = [...propias].filter((id) => !quedan.includes(id));
    if (sobran.length) await conn.query('DELETE FROM pp_opciones WHERE id IN (?)', [sobran]);

    if (quedan.length) await conn.query('DELETE FROM pp_receta_lineas WHERE opcion_id IN (?)', [quedan]);
    for (const o of opciones) await insertarLineas(conn, { opcion_id: o.id }, o.receta);

    await conn.commit();
    invalidarCatalogo();
    return grupoId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function borrarGrupo(id) {
  // Los pasos que lo usaban quedan sin grupo (FK ON DELETE SET NULL)
  const [r] = await pool.query('DELETE FROM pp_grupos WHERE id = ?', [id]);
  invalidarCatalogo();
  return r.affectedRows > 0;
}

module.exports = {
  listarProductos, leerProducto, guardarProducto, borrarProducto,
  listarGrupos, guardarGrupo, borrarGrupo, validarArbol,
};
