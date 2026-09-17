const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');
const { cascadeFromIngredient } = require('../utils/recalculate');
const { rankearPorNombre } = require('../utils/similitud');

// ============================================================================
// SABOR Y AROMA: envios de mercaderia del CRM de la distribuidora.
//
// Entrada: el JSON del `GET /cafeteria/sync` del CRM, PEGADO a mano (fase 1).
// El importador es el mismo si algun dia el fetch se automatiza.
//
// Reglas del contrato (api-coffitsya.md):
//  - Identidad por (productoId, presentacionId). NUNCA por nombre.
//  - presentacionId null -> se guarda 0 (NULL rompe la clave unica de MySQL).
//  - Idempotencia por (crm_id, version): reprocesar no duplica.
//  - Version nueva -> se reemplaza el detalle completo. Anulado -> se deshace.
//  - El costo NO se revierte al deshacer: solo se recalcula con lo vigente.
//  - `totalKg` se contrasta con la interpretacion propia: si no cierra, el
//    renglon queda "inconsistente" y NO se aplica.
//
// Destinos del mapeo (pueden convivir en el mismo articulo):
//  - MATERIA PRIMA: -> ingrediente, con factor de conversion de unidades
//    (ej: CRM kg -> ingrediente en g = x1000). Actualiza el costo del
//    ingrediente (slot proveedor1 = "Sabor y Aroma") y cascadea a subrecetas
//    y productos, marcando sya_fecha/sya_codigo.
//  - PARA VENTA: se vende tal cual. Vive en este apartado (no en Productos);
//    coffit le pone el precio a mano y el POS lo lee por la API publica.
// ============================================================================

const PROVEEDOR_SYA = 'Sabor y Aroma';
const TOLERANCIA_KG = 0.01; // margen para el contraste de totalKg

const presId = (v) => (v == null ? 0 : Number(v));
const num = (v) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};
// ISO datetime -> 'YYYY-MM-DD HH:MM:SS' (MySQL DATETIME); null si invalida
function toMysqlDT(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
const toDateOnly = (iso) => (toMysqlDT(iso) ? toMysqlDT(iso).slice(0, 10) : null);

// --- config helpers ---------------------------------------------------------
async function getConfig(clave) {
  const [rows] = await pool.query('SELECT valor FROM configuracion WHERE clave = ?', [clave]);
  return rows.length > 0 ? rows[0].valor : null;
}
async function setConfig(clave, valor) {
  await pool.query(
    'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
    [clave, valor]
  );
}

// ============================================================================
// APLICACION DE UN RENGLON
// Devuelve { estado, nota, cant_mp, cant_venta, cantidad_ingrediente,
//            ingrediente_id, costo_aplicado, costoUpdate }
// costoUpdate = { ingredienteId, costoUnitario, fecha, codigo } o null.
// NO toca la base: el caller inserta el item y aplica el costo (para poder
// ordenar cronologicamente y cascadear una sola vez por ingrediente).
// ============================================================================
function resolverItem(item, articulo, reparto) {
  const cantidad = num(item.cantidad) || 0;

  // Sin mapeo o sin destino -> pendiente
  if (!articulo || (!articulo.usa_mp && !articulo.usa_venta)) {
    return { estado: 'pendiente_mapeo', nota: null };
  }

  // Contraste de totalKg (el CRM lo manda precalculado justamente para esto)
  if (item.modo === 'granel' || item.modo === 'paquete') {
    const esperado = item.modo === 'granel' ? cantidad : cantidad * (num(item.tamKg) || 0);
    const totalKg = num(item.totalKg);
    if (totalKg != null && Math.abs(totalKg - esperado) > TOLERANCIA_KG) {
      return {
        estado: 'inconsistente',
        nota: `totalKg no cierra: CRM dice ${totalKg} kg, la interpretacion da ${esperado} kg. No se aplico.`,
      };
    }
  }

  // Reparto entre destinos (en unidad CRM). Default: todo a materia prima
  // (es "lo que venimos haciendo"); editable por renglon cuando hay 2 destinos.
  let cant_mp = 0;
  let cant_venta = 0;
  if (articulo.usa_mp && articulo.usa_venta) {
    if (reparto) {
      cant_mp = reparto.cant_mp;
      cant_venta = reparto.cant_venta;
    } else {
      cant_mp = cantidad;
    }
  } else if (articulo.usa_mp) {
    cant_mp = cantidad;
  } else {
    cant_venta = cantidad;
  }

  // Materia prima: el factor tiene que existir y estar calibrado para este modo
  let cantidad_ingrediente = null;
  let costoUpdate = null;
  if (articulo.usa_mp && cant_mp > 0) {
    const factor = num(articulo.factor_mp);
    if (!factor || factor <= 0) {
      return { estado: 'pendiente_mapeo', nota: 'Falta el factor de conversion de unidades.' };
    }
    if (articulo.factor_modo && articulo.factor_modo !== item.modo) {
      return {
        estado: 'inconsistente',
        nota: `El modo cambio: el factor esta definido para "${articulo.factor_modo}" y este renglon vino "${item.modo}". Revisa el mapeo.`,
      };
    }
    cantidad_ingrediente = Math.round(cant_mp * factor * 1000) / 1000;
    if (articulo.actualizar_costo) {
      costoUpdate = { ingredienteId: articulo.ingrediente_id, costoUnitario: (num(item.costoUnitario) || 0) / factor };
    }
  }

  // Para venta: el costo por unidad solo tiene sentido en modo "unidad"
  if (articulo.usa_venta && cant_venta > 0 && item.modo !== 'unidad') {
    return {
      estado: 'inconsistente',
      nota: `Destino venta pero el renglon vino en modo "${item.modo}" (venta espera unidades). Ajusta el reparto o el mapeo.`,
    };
  }

  return {
    estado: 'aplicado',
    nota: null,
    cant_mp: articulo.usa_mp ? cant_mp : null,
    cant_venta: articulo.usa_venta ? cant_venta : null,
    cantidad_ingrediente,
    ingrediente_id: articulo.usa_mp && cant_mp > 0 ? articulo.ingrediente_id : null,
    costo_aplicado: costoUpdate ? 1 : 0,
    costoUpdate,
    ventaCosto: articulo.usa_venta && cant_venta > 0 ? (num(item.costoUnitario) || 0) : null,
  };
}

// Actualiza el costo del ingrediente con el costo del CRM (ya convertido a la
// unidad del ingrediente) y deja la marca "actualizado por Sabor y Aroma".
// Slot 1 = SyA (fuente real de reposicion); si estaba ocupado por otro
// proveedor, ese pasa al slot 2 (una sola vez, no en cada envio).
//
// ANTI-RETROCESO: solo aplica si el envio es igual o mas nuevo que el ultimo
// que toco este ingrediente (sya_fecha). Asi, pegar un JSON viejo o una
// correccion de un envio antiguo NUNCA pisa un costo mas reciente.
async function aplicarCostoIngrediente(conn, ingredienteId, costoUnitario, fecha, codigo) {
  const [rows] = await conn.query(
    'SELECT contenido_envase, desperdicio, proveedor1, precio1 FROM ingredientes WHERE id = ? AND activo = 1',
    [ingredienteId]
  );
  if (rows.length === 0) return false;
  const ing = rows[0];

  const contenido = Number(ing.contenido_envase) || 1;
  const desperdicio = Number(ing.desperdicio) || 0;
  const costoConDesperdicio = desperdicio > 0 && desperdicio < 100
    ? costoUnitario / (1 - desperdicio / 100)
    : costoUnitario;
  const precioEnvase = costoUnitario * contenido;

  const esOtroProveedor = ing.proveedor1 && ing.proveedor1 !== PROVEEDOR_SYA;
  const [result] = await conn.query(
    `UPDATE ingredientes SET
       ${esOtroProveedor ? 'proveedor2 = proveedor1, precio2 = precio1,' : ''}
       proveedor1 = ?, precio1 = ?, fecha_precio = ?,
       costo_unitario = ?, costo_con_desperdicio = ?,
       sya_fecha = ?, sya_codigo = ?
     WHERE id = ? AND (sya_fecha IS NULL OR sya_fecha <= ?)`,
    [PROVEEDOR_SYA, precioEnvase, fecha, costoUnitario, costoConDesperdicio, fecha, codigo, ingredienteId, fecha]
  );
  return result.affectedRows > 0;
}

// Inserta el renglon con su resultado y aplica efectos (costo MP / costo venta).
// El costo se aplica ANTES del insert para grabar en costo_aplicado lo que
// realmente paso (la guarda anti-retroceso puede rechazarlo).
// Devuelve el ingredienteId a cascadear (o null).
async function insertarItem(conn, envioDbId, envio, item, articulo, reparto) {
  const r = resolverItem(item, articulo, reparto);

  let cascadeId = null;
  let costoAplicado = 0;
  if (r.costoUpdate) {
    const ok = await aplicarCostoIngrediente(
      conn, r.costoUpdate.ingredienteId, r.costoUpdate.costoUnitario,
      toDateOnly(envio.fecha) || toDateOnly(new Date().toISOString()), envio.codigo || null
    );
    if (ok) { cascadeId = r.costoUpdate.ingredienteId; costoAplicado = 1; }
  }
  if (r.ventaCosto != null && articulo) {
    // Anti-retroceso: solo si este envio es el mas nuevo visto para el articulo
    // (ultima_fecha ya quedo en el maximo gracias al upsert del catalogo).
    await conn.query(
      'UPDATE sya_articulos SET venta_costo_unitario = ? WHERE id = ? AND (ultima_fecha IS NULL OR ultima_fecha <= ?)',
      [r.ventaCosto, articulo.id, toMysqlDT(envio.fecha) || '9999-12-31 23:59:59']
    );
  }

  await conn.query(
    `INSERT INTO sya_envio_items
       (envio_id, crm_item_id, crm_producto_id, crm_presentacion_id, nombre_crm,
        modo, cantidad, tam_kg, total_kg, costo_unitario,
        estado, nota, cant_mp, cant_venta, cantidad_ingrediente, ingrediente_id, costo_aplicado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      envioDbId, item.id, item.productoId, presId(item.presentacionId), item.nombre || null,
      item.modo, num(item.cantidad) || 0, num(item.tamKg), num(item.totalKg), num(item.costoUnitario) || 0,
      r.estado, r.nota || null, r.cant_mp ?? null, r.cant_venta ?? null,
      r.cantidad_ingrediente ?? null, r.ingrediente_id ?? null, costoAplicado,
    ]
  );

  return cascadeId;
}

// Upsert del catalogo de articulos con la ayuda visual del ultimo renglon.
// Los campos ultimo_* solo avanzan: un envio VIEJO (pegar un JSON antiguo
// despues de uno nuevo) no retrocede la info que usa el modal de mapeo.
// El IF compara contra ultima_fecha VIEJA porque la asignacion de ultima_fecha
// va ULTIMA (MySQL evalua las asignaciones de izquierda a derecha).
// Devuelve la fila (con el mapeo actual) para resolver el renglon.
async function upsertArticulo(conn, item, fechaEnvio) {
  const esMasNuevo = '(ultima_fecha IS NULL OR (VALUES(ultima_fecha) IS NOT NULL AND VALUES(ultima_fecha) >= ultima_fecha))';
  await conn.query(
    `INSERT INTO sya_articulos
       (crm_producto_id, crm_presentacion_id, nombre_crm, codigo_propio, codigo_barras,
        ultimo_modo, ultima_cantidad, ultimo_costo_unitario, ultima_fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       nombre_crm = VALUES(nombre_crm),
       codigo_propio = VALUES(codigo_propio),
       codigo_barras = VALUES(codigo_barras),
       ultimo_modo = IF(${esMasNuevo}, VALUES(ultimo_modo), ultimo_modo),
       ultima_cantidad = IF(${esMasNuevo}, VALUES(ultima_cantidad), ultima_cantidad),
       ultimo_costo_unitario = IF(${esMasNuevo}, VALUES(ultimo_costo_unitario), ultimo_costo_unitario),
       ultima_fecha = IF(${esMasNuevo}, VALUES(ultima_fecha), ultima_fecha)`,
    [
      item.productoId, presId(item.presentacionId), item.nombre || '(sin nombre)',
      item.codigoPropio || null, item.codigoBarras || null,
      item.modo || null, num(item.cantidad), num(item.costoUnitario), toMysqlDT(fechaEnvio),
    ]
  );
  const [rows] = await conn.query(
    'SELECT * FROM sya_articulos WHERE crm_producto_id = ? AND crm_presentacion_id = ?',
    [item.productoId, presId(item.presentacionId)]
  );
  return rows[0];
}

// ============================================================================
// POST /importar - procesa el JSON pegado del sync del CRM
// body: { payload } donde payload es la respuesta completa del sync
//        ({ ahora, envios: [...] }) o directamente el array de envios.
// Cada envio se procesa en SU PROPIA transaccion: uno corrupto no bloquea
// el resto (el resumen lista los errores).
// ============================================================================
router.post(
  '/importar',
  asyncHandler(async (req, res) => {
    const payload = req.body.payload;
    const envios = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.envios) ? payload.envios : null);
    if (!envios) {
      return error(res, 'El JSON no tiene la forma esperada: se espera { ahora, envios: [...] } o un array de envios.');
    }

    const sucursalFiltro = parseInt(await getConfig('sya_sucursal_id'), 10) || null;

    // Dedupe por crm_id (si el payload trae el mismo envio 2 veces, gana la
    // version mas alta) y orden cronologico: el costo final = el mas reciente.
    const porId = new Map();
    for (const e of envios) {
      if (!e || e.id == null) continue;
      const prev = porId.get(e.id);
      if (!prev || (Number(e.version) || 0) > (Number(prev.version) || 0)) porId.set(e.id, e);
    }
    // Orden por FECHA DEL ENVIO (no por fecha de edicion): el costo congelado
    // de cada envio se aplica en orden cronologico real, asi una correccion de
    // un envio viejo no pisa el costo de uno mas nuevo. Desempate: actualizadoEn.
    const lista = [...porId.values()].sort((a, b) =>
      String(a.fecha || '').localeCompare(String(b.fecha || ''))
      || String(a.actualizadoEn || '').localeCompare(String(b.actualizadoEn || ''))
    );

    const resumen = {
      procesados: 0, nuevos: 0, actualizados: 0, anulados: 0, ignorados: 0,
      sin_cambios: 0, errores: [],
      items_aplicados: 0, items_pendientes: 0, items_inconsistentes: 0,
      ingredientes_actualizados: 0,
    };
    const cascadeGlobal = new Set();

    for (const envio of lista) {
      const version = Number(envio.version) || 1;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [conocidos] = await conn.query('SELECT * FROM sya_envios WHERE crm_id = ?', [envio.id]);
        const conocido = conocidos[0] || null;

        // Idempotencia: version ya procesada -> no hacer NADA, sin importar el
        // estado del JSON entrante. El contrato garantiza que todo cambio sube
        // la version, asi que un JSON viejo (version <=) jamas puede resucitar
        // un envio anulado ni re-aplicar sus costos.
        if (conocido && conocido.version >= version) {
          await conn.commit();
          resumen.sin_cambios++;
          continue;
        }

        // Filtro de sucursal (config). Se registra igual para la idempotencia.
        const esOtraSucursal = sucursalFiltro != null && Number(envio.sucursalId) !== sucursalFiltro;
        const estadoFinal = esOtraSucursal ? 'ignorado' : (envio.estado === 'anulado' ? 'anulado' : 'enviado');

        if (conocido) {
          await conn.query(
            `UPDATE sya_envios SET codigo = ?, fecha = ?, sucursal_id = ?, estado = ?, version = ?,
               total_costo = ?, observaciones = ?, motivo_anulacion = ?, actualizado_en_crm = ?
             WHERE id = ?`,
            [
              envio.codigo || null, toMysqlDT(envio.fecha), envio.sucursalId ?? null, estadoFinal, version,
              num(envio.totalCosto), envio.observaciones || null, envio.motivoAnulacion || null,
              toMysqlDT(envio.actualizadoEn), conocido.id,
            ]
          );
          // Version nueva o cambio de estado: el detalle se reemplaza completo.
          await conn.query('DELETE FROM sya_envio_items WHERE envio_id = ?', [conocido.id]);
        } else {
          await conn.query(
            `INSERT INTO sya_envios
               (crm_id, codigo, fecha, sucursal_id, estado, version, total_costo,
                observaciones, motivo_anulacion, actualizado_en_crm)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              envio.id, envio.codigo || null, toMysqlDT(envio.fecha), envio.sucursalId ?? null,
              estadoFinal, version, num(envio.totalCosto),
              envio.observaciones || null, envio.motivoAnulacion || null, toMysqlDT(envio.actualizadoEn),
            ]
          );
        }

        // Anulado o ignorado: no se ingresan renglones (deshacer = borrarlos,
        // ya hecho arriba). El costo NO se revierte (regla acordada).
        if (estadoFinal !== 'enviado') {
          await conn.commit();
          if (estadoFinal === 'anulado') resumen.anulados++;
          else resumen.ignorados++;
          resumen.procesados++;
          continue;
        }

        const [[{ id: envioDbId }]] = await conn.query(
          'SELECT id FROM sya_envios WHERE crm_id = ?', [envio.id]
        );

        const items = Array.isArray(envio.items) ? envio.items : [];
        for (const item of items) {
          if (!item || item.id == null || item.productoId == null) continue;
          const articulo = await upsertArticulo(conn, item, envio.fecha);
          const cascadeId = await insertarItem(conn, envioDbId, envio, item, articulo, null);
          if (cascadeId) {
            cascadeGlobal.add(cascadeId);
            resumen.ingredientes_actualizados++;
          }
        }

        await conn.commit();
        resumen.procesados++;
        if (conocido) resumen.actualizados++;
        else resumen.nuevos++;
      } catch (err) {
        await conn.rollback();
        resumen.errores.push({ crm_id: envio.id, codigo: envio.codigo || null, error: err.message });
      } finally {
        conn.release();
      }
    }

    // Cascada UNA vez por ingrediente tocado (subrecetas + productos).
    // Con reintento y error VISIBLE: si fallara, los costos derivados quedarian
    // desactualizados en silencio (y reimportar es no-op por idempotencia).
    for (const ingId of cascadeGlobal) {
      let ok = false;
      for (let intento = 0; intento < 2 && !ok; intento++) {
        const conn = await pool.getConnection();
        try {
          await cascadeFromIngredient(conn, ingId);
          ok = true;
        } catch (err) {
          if (intento === 1) {
            resumen.errores.push({
              crm_id: null, codigo: null,
              error: `No se pudo recalcular recetas/productos del ingrediente #${ingId} (${err.message}). Guarda ese ingrediente de nuevo para forzar el recalculo.`,
            });
          }
        } finally {
          conn.release();
        }
      }
    }

    // Contadores de items del lote (post-proceso, una sola query)
    const ids = lista.map((e) => e.id);
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',');
      const [cnt] = await pool.query(
        `SELECT i.estado, COUNT(*) AS n
         FROM sya_envio_items i JOIN sya_envios e ON e.id = i.envio_id
         WHERE e.crm_id IN (${ph}) GROUP BY i.estado`,
        ids
      );
      for (const c of cnt) {
        if (c.estado === 'aplicado') resumen.items_aplicados = c.n;
        if (c.estado === 'pendiente_mapeo') resumen.items_pendientes = c.n;
        if (c.estado === 'inconsistente') resumen.items_inconsistentes = c.n;
      }
    }

    // Cursor: solo avanza (nunca retrocede si pegaste un JSON viejo despues).
    let cursor = await getConfig('sya_cursor');
    const ahora = payload && payload.ahora ? String(payload.ahora) : null;
    if (ahora && (!cursor || ahora > cursor)) {
      await setConfig('sya_cursor', ahora);
      cursor = ahora;
    }
    resumen.cursor = cursor || null;

    success(res, resumen);
  })
);

// ============================================================================
// GET /resumen - tarjetas de la seccion
// ============================================================================
router.get(
  '/resumen',
  asyncHandler(async (req, res) => {
    const [[env]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(estado = 'anulado') AS anulados,
              MAX(CASE WHEN estado = 'enviado' THEN fecha END) AS ultimo
       FROM sya_envios`
    );
    const [[art]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(usa_mp = 0 AND usa_venta = 0) AS sin_mapear,
              SUM(usa_venta = 1) AS en_venta
       FROM sya_articulos`
    );
    const [[items]] = await pool.query(
      `SELECT SUM(i.estado = 'pendiente_mapeo') AS pendientes,
              SUM(i.estado = 'inconsistente') AS inconsistentes
       FROM sya_envio_items i JOIN sya_envios e ON e.id = i.envio_id
       WHERE e.estado = 'enviado'`
    );
    success(res, {
      envios: Number(env.total) || 0,
      envios_anulados: Number(env.anulados) || 0,
      ultimo_envio: env.ultimo,
      articulos: Number(art.total) || 0,
      articulos_sin_mapear: Number(art.sin_mapear) || 0,
      articulos_en_venta: Number(art.en_venta) || 0,
      items_pendientes: Number(items.pendientes) || 0,
      items_inconsistentes: Number(items.inconsistentes) || 0,
    });
  })
);

// ============================================================================
// GET /envios - lista con contadores de renglones
// Filtros: estado (enviado|anulado|ignorado), buscar (codigo/observaciones)
// ============================================================================
router.get(
  '/envios',
  asyncHandler(async (req, res) => {
    const { estado, buscar } = req.query;
    let sql = `
      SELECT e.*,
             COUNT(i.id) AS items_total,
             SUM(i.estado = 'aplicado') AS items_aplicados,
             SUM(i.estado = 'pendiente_mapeo') AS items_pendientes,
             SUM(i.estado = 'inconsistente') AS items_inconsistentes
      FROM sya_envios e
      LEFT JOIN sya_envio_items i ON i.envio_id = e.id
      WHERE 1 = 1
    `;
    const params = [];
    if (estado) { sql += ' AND e.estado = ?'; params.push(estado); }
    if (buscar) { sql += ' AND (e.codigo LIKE ? OR e.observaciones LIKE ?)'; params.push(`%${buscar}%`, `%${buscar}%`); }
    sql += ' GROUP BY e.id ORDER BY e.fecha DESC, e.id DESC';
    const [rows] = await pool.query(sql, params);
    success(res, rows);
  })
);

// ============================================================================
// GET /envios/:id - detalle con renglones enriquecidos con su mapeo actual
// ============================================================================
router.get(
  '/envios/:id',
  asyncHandler(async (req, res) => {
    const [envs] = await pool.query('SELECT * FROM sya_envios WHERE id = ?', [req.params.id]);
    if (envs.length === 0) return error(res, 'Envio no encontrado', 404);

    const [items] = await pool.query(
      `SELECT i.*,
              a.id AS articulo_id, a.usa_mp, a.usa_venta, a.factor_mp, a.factor_modo,
              a.actualizar_costo, a.venta_nombre, a.venta_precio,
              ing.nombre AS ingrediente_nombre,
              u.abreviatura AS ingrediente_unidad
       FROM sya_envio_items i
       LEFT JOIN sya_articulos a
         ON a.crm_producto_id = i.crm_producto_id AND a.crm_presentacion_id = i.crm_presentacion_id
       LEFT JOIN ingredientes ing ON ing.id = a.ingrediente_id
       LEFT JOIN unidades u ON u.id = ing.unidad_id
       WHERE i.envio_id = ?
       ORDER BY i.id`,
      [req.params.id]
    );
    success(res, { ...envs[0], items });
  })
);

// ============================================================================
// PATCH /envios/:envioId/items/:itemId/reparto - repartir un renglon entre
// materia prima y venta (solo articulos con los DOS destinos).
// body: { cant_mp, cant_venta } — deben sumar la cantidad del renglon.
// Reaplica el renglon con el reparto nuevo.
// ============================================================================
router.patch(
  '/envios/:envioId/items/:itemId/reparto',
  asyncHandler(async (req, res) => {
    const { envioId, itemId } = req.params;
    const cantMp = num(req.body.cant_mp);
    const cantVenta = num(req.body.cant_venta);
    if (cantMp == null || cantVenta == null || cantMp < 0 || cantVenta < 0) {
      return error(res, 'cant_mp y cant_venta son requeridos y no pueden ser negativos');
    }

    const [envs] = await pool.query('SELECT * FROM sya_envios WHERE id = ?', [envioId]);
    if (envs.length === 0) return error(res, 'Envio no encontrado', 404);
    if (envs[0].estado !== 'enviado') return error(res, 'Solo se puede repartir un envio vigente');

    const [items] = await pool.query(
      'SELECT * FROM sya_envio_items WHERE id = ? AND envio_id = ?', [itemId, envioId]
    );
    if (items.length === 0) return error(res, 'Renglon no encontrado', 404);
    const item = items[0];

    if (Math.abs(cantMp + cantVenta - Number(item.cantidad)) > 0.001) {
      return error(res, `El reparto debe sumar ${item.cantidad} (${item.modo})`);
    }

    const [arts] = await pool.query(
      'SELECT * FROM sya_articulos WHERE crm_producto_id = ? AND crm_presentacion_id = ?',
      [item.crm_producto_id, item.crm_presentacion_id]
    );
    if (arts.length === 0 || !arts[0].usa_mp || !arts[0].usa_venta) {
      return error(res, 'El reparto solo aplica a articulos con los dos destinos (materia prima + venta)');
    }

    // Shape CRM del renglon (los DECIMAL de MySQL llegan como string; num() los maneja)
    const itemCrm = {
      id: item.crm_item_id, productoId: item.crm_producto_id,
      presentacionId: item.crm_presentacion_id, nombre: item.nombre_crm,
      modo: item.modo, cantidad: item.cantidad, tamKg: item.tam_kg,
      totalKg: item.total_kg, costoUnitario: item.costo_unitario,
    };
    const reparto = { cant_mp: cantMp, cant_venta: cantVenta };

    // Validar ANTES de tocar la base: si el reparto dejaria el renglon
    // inconsistente (ej: derivar a venta un renglon en kg), se rechaza y el
    // renglon queda como estaba.
    const prueba = resolverItem(itemCrm, arts[0], reparto);
    if (prueba.estado !== 'aplicado') {
      return error(res, prueba.nota || 'Ese reparto no se puede aplicar');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM sya_envio_items WHERE id = ?', [itemId]);
      const cascadeId = await insertarItem(
        conn, Number(envioId), { fecha: envs[0].fecha, codigo: envs[0].codigo },
        itemCrm, arts[0], reparto
      );
      // Cascada DENTRO de la transaccion (mismo patron que compras.js):
      // o queda todo consistente, o no queda nada.
      if (cascadeId) await cascadeFromIngredient(conn, cascadeId);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    success(res, { message: 'Reparto guardado' });
  })
);

// ============================================================================
// GET /articulos - catalogo con estado de mapeo y renglones pendientes
// Filtros: estado (sin_mapear|mp|venta|ambos), buscar
// ============================================================================
router.get(
  '/articulos',
  asyncHandler(async (req, res) => {
    const { estado, buscar } = req.query;
    let sql = `
      SELECT a.*,
             ing.nombre AS ingrediente_nombre,
             u.abreviatura AS ingrediente_unidad,
             ing.costo_unitario AS ingrediente_costo_actual,
             (SELECT COUNT(*) FROM sya_envio_items i
                JOIN sya_envios e ON e.id = i.envio_id AND e.estado = 'enviado'
              WHERE i.crm_producto_id = a.crm_producto_id
                AND i.crm_presentacion_id = a.crm_presentacion_id
                AND i.estado IN ('pendiente_mapeo', 'inconsistente')) AS items_pendientes
      FROM sya_articulos a
      LEFT JOIN ingredientes ing ON ing.id = a.ingrediente_id
      LEFT JOIN unidades u ON u.id = ing.unidad_id
      WHERE 1 = 1
    `;
    const params = [];
    if (estado === 'sin_mapear') sql += ' AND a.usa_mp = 0 AND a.usa_venta = 0';
    else if (estado === 'mp') sql += ' AND a.usa_mp = 1';
    else if (estado === 'venta') sql += ' AND a.usa_venta = 1';
    else if (estado === 'ambos') sql += ' AND a.usa_mp = 1 AND a.usa_venta = 1';
    if (buscar) {
      sql += ' AND (a.nombre_crm LIKE ? OR a.codigo_propio LIKE ? OR a.venta_nombre LIKE ?)';
      params.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`);
    }
    sql += ' ORDER BY (a.usa_mp = 0 AND a.usa_venta = 0) DESC, a.nombre_crm';
    const [rows] = await pool.query(sql, params);
    success(res, rows);
  })
);

// ============================================================================
// GET /articulos/:id/sugerencias - ingredientes candidatos por nombre
// (misma similitud tolerante a tildes/typos que el auto-mapeo de la Carta)
// ============================================================================
router.get(
  '/articulos/:id/sugerencias',
  asyncHandler(async (req, res) => {
    const [arts] = await pool.query('SELECT * FROM sya_articulos WHERE id = ?', [req.params.id]);
    if (arts.length === 0) return error(res, 'Articulo no encontrado', 404);

    const [ings] = await pool.query(
      `SELECT i.id, i.nombre, i.costo_unitario, COALESCE(u.abreviatura, 'g') AS unidad
       FROM ingredientes i
       LEFT JOIN unidades u ON u.id = i.unidad_id
       WHERE i.activo = 1`
    );
    const top = rankearPorNombre(arts[0].nombre_crm, ings, (i) => ({
      id: i.id,
      nombre: i.nombre,
      unidad: i.unidad,
      costo_unitario: parseFloat(i.costo_unitario) || 0,
    })).slice(0, 6);
    success(res, top);
  })
);

// ============================================================================
// PUT /articulos/:id/mapear - definir/editar el mapeo de un articulo.
// body: { usa_mp, ingrediente_id, factor_mp, actualizar_costo,
//         usa_venta, venta_nombre, venta_precio, venta_activo }
// Al guardar, RE-APLICA los renglones pendientes/inconsistentes de envios
// vigentes que refieren a este articulo (por eso el mapeo "destraba" solo).
// ============================================================================
router.put(
  '/articulos/:id/mapear',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      usa_mp, ingrediente_id, factor_mp, actualizar_costo,
      usa_venta, venta_nombre, venta_precio, venta_activo,
    } = req.body;

    const [arts] = await pool.query('SELECT * FROM sya_articulos WHERE id = ?', [id]);
    if (arts.length === 0) return error(res, 'Articulo no encontrado', 404);
    const articulo = arts[0];

    const mp = !!usa_mp;
    const venta = !!usa_venta;
    if (mp) {
      if (!ingrediente_id) return error(res, 'Elegi el ingrediente para materia prima');
      const factor = num(factor_mp);
      if (!factor || factor <= 0) return error(res, 'El factor de conversion debe ser mayor a 0');
      const [ings] = await pool.query('SELECT id FROM ingredientes WHERE id = ? AND activo = 1', [ingrediente_id]);
      if (ings.length === 0) return error(res, 'Ingrediente no encontrado', 404);
    }
    if (venta) {
      const precio = num(venta_precio);
      if (precio != null && precio < 0) return error(res, 'El precio de venta no puede ser negativo');
    }

    await pool.query(
      `UPDATE sya_articulos SET
         usa_mp = ?, ingrediente_id = ?, factor_mp = ?, factor_modo = ?, actualizar_costo = ?,
         usa_venta = ?, venta_nombre = ?, venta_precio = ?, venta_activo = ?
       WHERE id = ?`,
      [
        mp ? 1 : 0,
        mp ? ingrediente_id : null,
        mp ? num(factor_mp) : null,
        mp ? (articulo.ultimo_modo || null) : null, // el factor queda calibrado al modo actual
        mp && actualizar_costo === false ? 0 : 1,
        venta ? 1 : 0,
        // Campos de venta AUSENTES en el body = "no tocar" (editar el lado MP
        // no debe pisar el precio ni REACTIVAR un articulo pausado en el POS).
        venta ? (venta_nombre !== undefined ? (venta_nombre || articulo.nombre_crm) : (articulo.venta_nombre || articulo.nombre_crm)) : null,
        venta ? (venta_precio !== undefined ? num(venta_precio) : articulo.venta_precio) : null,
        venta ? (venta_activo !== undefined ? (venta_activo ? 1 : 0) : articulo.venta_activo) : 1,
        id,
      ]
    );

    // Re-aplicar renglones que estaban trabados por falta de mapeo
    const [actualizado] = await pool.query('SELECT * FROM sya_articulos WHERE id = ?', [id]);
    const art = actualizado[0];
    const [pendientes] = await pool.query(
      `SELECT i.*, e.fecha AS envio_fecha, e.codigo AS envio_codigo, e.id AS envio_db_id
       FROM sya_envio_items i
       JOIN sya_envios e ON e.id = i.envio_id AND e.estado = 'enviado'
       WHERE i.crm_producto_id = ? AND i.crm_presentacion_id = ?
         AND i.estado IN ('pendiente_mapeo', 'inconsistente')
       ORDER BY e.fecha ASC, i.id ASC`,
      [art.crm_producto_id, art.crm_presentacion_id]
    );

    let reaplicados = 0;
    const cascade = new Set();
    if (pendientes.length > 0 && (art.usa_mp || art.usa_venta)) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const it of pendientes) {
          await conn.query('DELETE FROM sya_envio_items WHERE id = ?', [it.id]);
          const cascadeId = await insertarItem(
            conn, it.envio_db_id,
            { fecha: it.envio_fecha, codigo: it.envio_codigo },
            {
              id: it.crm_item_id, productoId: it.crm_producto_id,
              presentacionId: it.crm_presentacion_id, nombre: it.nombre_crm,
              modo: it.modo, cantidad: it.cantidad, tamKg: it.tam_kg,
              totalKg: it.total_kg, costoUnitario: it.costo_unitario,
            },
            art, null
          );
          if (cascadeId) cascade.add(cascadeId);
          reaplicados++;
        }
        // Cascada DENTRO de la transaccion (mismo patron que compras.js).
        for (const ingId of cascade) await cascadeFromIngredient(conn, ingId);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }

    success(res, { message: 'Mapeo guardado', renglones_reaplicados: reaplicados });
  })
);

// ============================================================================
// PUT /articulos/:id/venta - edicion rapida del apartado "Para venta"
// body: { venta_nombre?, venta_precio?, venta_activo? }
// ============================================================================
router.put(
  '/articulos/:id/venta',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [arts] = await pool.query('SELECT * FROM sya_articulos WHERE id = ? AND usa_venta = 1', [id]);
    if (arts.length === 0) return error(res, 'Articulo de venta no encontrado', 404);
    const art = arts[0];

    const { venta_nombre, venta_precio, venta_activo } = req.body;
    // NULL se preserva como NULL: togglear activo no convierte "sin precio" en $0
    const precio = venta_precio !== undefined ? num(venta_precio) : (art.venta_precio == null ? null : Number(art.venta_precio));
    if (precio != null && precio < 0) return error(res, 'El precio no puede ser negativo');

    await pool.query(
      'UPDATE sya_articulos SET venta_nombre = ?, venta_precio = ?, venta_activo = ? WHERE id = ?',
      [
        venta_nombre !== undefined ? (venta_nombre || art.nombre_crm) : art.venta_nombre,
        precio,
        venta_activo !== undefined ? (venta_activo ? 1 : 0) : art.venta_activo,
        id,
      ]
    );
    success(res, { message: 'Actualizado' });
  })
);

module.exports = router;
