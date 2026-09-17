const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// =============================================================================
// PLAN SEMANAL DE PRODUCCION
// =============================================================================
// Modelo:
//   - dia_semana: 0=Domingo, 1=Lunes, ..., 6=Sabado
//   - fecha = NULL  -> plantilla recurrente (se aplica todas las semanas)
//   - fecha = 'YYYY-MM-DD' -> item puntual para una semana especifica
// =============================================================================

// Helper: calcula el dia_semana JS (0-6) de una fecha 'YYYY-MM-DD' sin tema de zonas horarias.
function diaSemanaDeFecha(fechaISO) {
  if (!fechaISO) return null;
  const [y, m, d] = String(fechaISO).substring(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  // Construye la fecha en UTC para evitar surprise por TZ
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCDay();
}

// Helper: rango de la semana (lunes a domingo) que contiene la fecha dada.
// Devuelve { lunes: 'YYYY-MM-DD', domingo: 'YYYY-MM-DD' }.
function rangoSemana(fechaISO) {
  const [y, m, d] = String(fechaISO).substring(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  // Lunes como inicio de semana (estandar AR)
  const diff = day === 0 ? -6 : 1 - day;
  const lunes = new Date(date);
  lunes.setUTCDate(date.getUTCDate() + diff);
  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);
  const fmt = (d) => d.toISOString().substring(0, 10);
  return { lunes: fmt(lunes), domingo: fmt(domingo) };
}

// Normaliza una fila de la DB al shape de respuesta
function normalizar(row) {
  return {
    id: row.id,
    dia_semana: Number(row.dia_semana),
    item_tipo: row.item_tipo,
    item_id: row.item_id,
    item_nombre: row.item_nombre,
    cantidad: Number(row.cantidad),
    observacion: row.observacion,
    orden: Number(row.orden),
    fecha: row.fecha
      ? (row.fecha instanceof Date ? row.fecha.toISOString().substring(0, 10) : String(row.fecha).substring(0, 10))
      : null,
    es_plantilla: row.fecha == null,
  };
}

// =============================================================================
// GET / - Lista items.
// Query params:
//   - modo: 'plantilla' (default) | 'semana'
//   - desde: solo si modo=semana. Cualquier fecha dentro de la semana.
// =============================================================================
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { modo = 'plantilla', desde } = req.query;

    if (modo === 'plantilla') {
      const [rows] = await pool.query(
        `SELECT * FROM produccion_plan_semanal
         WHERE activo = 1 AND fecha IS NULL
         ORDER BY dia_semana ASC, orden ASC, id ASC`
      );
      const items = rows.map(normalizar);
      // Agrupar por dia_semana (0-6)
      const porDia = Array.from({ length: 7 }, () => []);
      for (const it of items) porDia[it.dia_semana].push(it);
      return success(res, { modo: 'plantilla', porDia });
    }

    if (modo === 'semana') {
      if (!desde) return error(res, 'Param "desde" es requerido en modo=semana');

      const { lunes, domingo } = rangoSemana(desde);
      // Items recurrentes (plantilla base, todos los dias)
      const [base] = await pool.query(
        `SELECT * FROM produccion_plan_semanal
         WHERE activo = 1 AND fecha IS NULL
         ORDER BY dia_semana ASC, orden ASC, id ASC`
      );
      // Items puntuales de esa semana
      const [puntuales] = await pool.query(
        `SELECT * FROM produccion_plan_semanal
         WHERE activo = 1 AND fecha BETWEEN ? AND ?
         ORDER BY fecha ASC, orden ASC, id ASC`,
        [lunes, domingo]
      );

      const porDia = Array.from({ length: 7 }, () => []);
      for (const r of base) porDia[Number(r.dia_semana)].push(normalizar(r));
      for (const r of puntuales) {
        const d = diaSemanaDeFecha(r.fecha);
        if (d != null) porDia[d].push(normalizar(r));
      }

      return success(res, {
        modo: 'semana',
        lunes,
        domingo,
        porDia,
      });
    }

    return error(res, 'modo invalido. Usar "plantilla" o "semana"');
  })
);

// =============================================================================
// GET /hoy - Atajo: items planificados para HOY (server-side date).
// Combina plantilla base del dia_semana de hoy + puntuales de la fecha.
// Pensado para la vista cocina.
// =============================================================================
router.get(
  '/hoy',
  asyncHandler(async (req, res) => {
    const hoy = new Date();
    const fechaHoy = hoy.toISOString().substring(0, 10);
    const diaSemanaHoy = hoy.getDay();

    const [base] = await pool.query(
      `SELECT * FROM produccion_plan_semanal
       WHERE activo = 1 AND fecha IS NULL AND dia_semana = ?
       ORDER BY orden ASC, id ASC`,
      [diaSemanaHoy]
    );
    const [puntuales] = await pool.query(
      `SELECT * FROM produccion_plan_semanal
       WHERE activo = 1 AND fecha = ?
       ORDER BY orden ASC, id ASC`,
      [fechaHoy]
    );

    const items = [...base, ...puntuales].map(normalizar);

    return success(res, {
      fecha: fechaHoy,
      dia_semana: diaSemanaHoy,
      items,
    });
  })
);

// =============================================================================
// POST / - Crear item
// Body: dia_semana (req), item_tipo (req), item_id, item_nombre (req),
//       cantidad, observacion, fecha (opcional, NULL = plantilla)
// =============================================================================
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { dia_semana, item_tipo, item_id, item_nombre, cantidad, observacion, fecha } = req.body;

    const dia = Number(dia_semana);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
      return error(res, 'dia_semana debe ser 0..6');
    }
    if (item_tipo !== 'producto' && item_tipo !== 'subreceta') {
      return error(res, 'item_tipo debe ser "producto" o "subreceta"');
    }
    if (!item_nombre || !String(item_nombre).trim()) {
      return error(res, 'item_nombre es requerido');
    }
    const cant = parseFloat(cantidad);
    if (isNaN(cant) || cant <= 0) {
      return error(res, 'cantidad debe ser mayor a 0');
    }

    let fechaSegura = null;
    if (fecha) {
      const dF = diaSemanaDeFecha(fecha);
      if (dF == null) return error(res, 'fecha invalida');
      // Si llega fecha, el dia_semana DEBE coincidir
      if (dF !== dia) {
        return error(res, `La fecha ${fecha} cae en otro dia de semana (${dF}). Verifica dia_semana.`);
      }
      fechaSegura = String(fecha).substring(0, 10);
    }

    // Calcular siguiente orden dentro del dia (max + 1)
    const [maxRows] = await pool.query(
      `SELECT COALESCE(MAX(orden), -1) AS max_orden
       FROM produccion_plan_semanal
       WHERE dia_semana = ? AND ${fechaSegura ? 'fecha = ?' : 'fecha IS NULL'} AND activo = 1`,
      fechaSegura ? [dia, fechaSegura] : [dia]
    );
    const nextOrden = Number(maxRows[0].max_orden) + 1;

    const [result] = await pool.query(
      `INSERT INTO produccion_plan_semanal
        (dia_semana, item_tipo, item_id, item_nombre, cantidad, observacion, orden, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dia,
        item_tipo,
        item_id || null,
        String(item_nombre).trim(),
        cant,
        observacion ? String(observacion) : null,
        nextOrden,
        fechaSegura,
      ]
    );

    const [newRow] = await pool.query(
      'SELECT * FROM produccion_plan_semanal WHERE id = ?',
      [result.insertId]
    );

    success(res, normalizar(newRow[0]), 201);
  })
);

// =============================================================================
// PUT /:id - Actualizar item
// =============================================================================
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { dia_semana, item_tipo, item_id, item_nombre, cantidad, observacion, fecha } = req.body;

    const dia = Number(dia_semana);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
      return error(res, 'dia_semana debe ser 0..6');
    }
    if (item_tipo !== 'producto' && item_tipo !== 'subreceta') {
      return error(res, 'item_tipo invalido');
    }
    if (!item_nombre || !String(item_nombre).trim()) {
      return error(res, 'item_nombre es requerido');
    }
    const cant = parseFloat(cantidad);
    if (isNaN(cant) || cant <= 0) {
      return error(res, 'cantidad debe ser mayor a 0');
    }

    let fechaSegura = null;
    if (fecha) {
      const dF = diaSemanaDeFecha(fecha);
      if (dF == null) return error(res, 'fecha invalida');
      if (dF !== dia) {
        return error(res, `La fecha ${fecha} cae en otro dia de semana.`);
      }
      fechaSegura = String(fecha).substring(0, 10);
    }

    const [result] = await pool.query(
      `UPDATE produccion_plan_semanal SET
        dia_semana = ?, item_tipo = ?, item_id = ?, item_nombre = ?,
        cantidad = ?, observacion = ?, fecha = ?
       WHERE id = ? AND activo = 1`,
      [
        dia,
        item_tipo,
        item_id || null,
        String(item_nombre).trim(),
        cant,
        observacion ? String(observacion) : null,
        fechaSegura,
        id,
      ]
    );

    if (result.affectedRows === 0) return error(res, 'Item no encontrado', 404);

    const [updated] = await pool.query(
      'SELECT * FROM produccion_plan_semanal WHERE id = ?',
      [id]
    );
    success(res, normalizar(updated[0]));
  })
);

// =============================================================================
// DELETE /:id - Soft delete
// =============================================================================
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE produccion_plan_semanal SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );
    if (result.affectedRows === 0) return error(res, 'Item no encontrado', 404);
    success(res, { message: 'Item eliminado' });
  })
);

// =============================================================================
// POST /copy-day - Copia los items de un dia a otro (dentro de plantilla o de semana)
// Body: from_dia (0-6), to_dia (0-6), fecha_destino (opcional, para puntuales)
// =============================================================================
router.post(
  '/copy-day',
  asyncHandler(async (req, res) => {
    const { from_dia, to_dia, fecha_origen, fecha_destino } = req.body;

    const dF = Number(from_dia);
    const dT = Number(to_dia);
    if (!Number.isInteger(dF) || dF < 0 || dF > 6) return error(res, 'from_dia invalido');
    if (!Number.isInteger(dT) || dT < 0 || dT > 6) return error(res, 'to_dia invalido');

    let fechaOrigenSafe = null;
    let fechaDestinoSafe = null;

    if (fecha_origen) {
      if (diaSemanaDeFecha(fecha_origen) !== dF) {
        return error(res, `fecha_origen no corresponde al dia_semana ${dF}`);
      }
      fechaOrigenSafe = String(fecha_origen).substring(0, 10);
    }
    if (fecha_destino) {
      if (diaSemanaDeFecha(fecha_destino) !== dT) {
        return error(res, `fecha_destino no corresponde al dia_semana ${dT}`);
      }
      fechaDestinoSafe = String(fecha_destino).substring(0, 10);
    }

    // Leer items origen
    const [origenRows] = await pool.query(
      `SELECT item_tipo, item_id, item_nombre, cantidad, observacion, orden
       FROM produccion_plan_semanal
       WHERE activo = 1 AND dia_semana = ? AND ${fechaOrigenSafe ? 'fecha = ?' : 'fecha IS NULL'}
       ORDER BY orden ASC, id ASC`,
      fechaOrigenSafe ? [dF, fechaOrigenSafe] : [dF]
    );

    if (origenRows.length === 0) {
      return error(res, 'El dia origen no tiene items para copiar');
    }

    // Calcular orden inicial en destino
    const [maxRows] = await pool.query(
      `SELECT COALESCE(MAX(orden), -1) AS max_orden
       FROM produccion_plan_semanal
       WHERE dia_semana = ? AND ${fechaDestinoSafe ? 'fecha = ?' : 'fecha IS NULL'} AND activo = 1`,
      fechaDestinoSafe ? [dT, fechaDestinoSafe] : [dT]
    );
    let nextOrden = Number(maxRows[0].max_orden) + 1;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const insertedIds = [];
      for (const it of origenRows) {
        const [r] = await conn.query(
          `INSERT INTO produccion_plan_semanal
            (dia_semana, item_tipo, item_id, item_nombre, cantidad, observacion, orden, fecha)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [dT, it.item_tipo, it.item_id, it.item_nombre, it.cantidad, it.observacion, nextOrden, fechaDestinoSafe]
        );
        insertedIds.push(r.insertId);
        nextOrden += 1;
      }

      await conn.commit();
      success(res, { copiados: insertedIds.length, ids: insertedIds }, 201);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

module.exports = router;
