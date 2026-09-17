const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// GET / - Returns concepts with their channel IDs AND resumen_canales
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // --- Fetch all active concepts ---
    const [conceptos] = await pool.query(
      'SELECT * FROM conceptos_costo WHERE activo = 1'
    );

    // Attach canal_ids to each concept
    for (const concepto of conceptos) {
      const [canales] = await pool.query(
        'SELECT canal_id FROM conceptos_canales WHERE concepto_id = ?',
        [concepto.id]
      );
      concepto.canal_ids = canales.map((c) => c.canal_id);
    }

    // --- Build resumen_canales ---
    const channelKeys = ['tarjeta', 'efectivo', 'pedidosya'];
    const resumen_canales = {};

    for (const key of channelKeys) {
      // Get the channel row by codigo
      const [channelRows] = await pool.query(
        'SELECT * FROM canales_venta WHERE codigo = ? AND activo = 1',
        [key]
      );

      if (channelRows.length === 0) {
        resumen_canales[key] = {
          nombre: key,
          icono: null,
          impuestos: 0,
          comisiones: 0,
          descuentos: 0,
          total: 0,
          conceptos: [],
        };
        continue;
      }

      const channel = channelRows[0];

      // Get all active concepts linked to this channel
      const [linkedConcepts] = await pool.query(
        `SELECT cc.porcentaje_override, c.*
         FROM conceptos_canales cc
         JOIN conceptos_costo c ON c.id = cc.concepto_id
         WHERE cc.canal_id = ? AND c.activo = 1`,
        [channel.id]
      );

      let impuestos = 0;
      let comisiones = 0;
      let descuentos = 0;
      const conceptosList = [];

      for (const lc of linkedConcepts) {
        const valor =
          lc.porcentaje_override !== null && lc.porcentaje_override !== undefined
            ? parseFloat(lc.porcentaje_override)
            : parseFloat(lc.porcentaje);

        conceptosList.push({
          id: lc.id,
          nombre: lc.nombre,
          tipo: lc.tipo,
          valor,
        });

        if (lc.tipo === 'impuesto') {
          impuestos += valor;
        } else if (lc.tipo === 'comision') {
          comisiones += valor;
        } else if (lc.tipo === 'descuento') {
          descuentos += valor;
        }
      }

      resumen_canales[key] = {
        nombre: channel.nombre,
        icono: channel.icono || null,
        impuestos: Math.round(impuestos * 100) / 100,
        comisiones: Math.round(comisiones * 100) / 100,
        descuentos: Math.round(descuentos * 100) / 100,
        total:
          Math.round((impuestos + comisiones + descuentos) * 100) / 100,
        conceptos: conceptosList,
      };
    }

    success(res, { conceptos, resumen_canales });
  })
);

// POST / - Create concept with channel assignments
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nombre, tipo, porcentaje, descripcion, es_resta, canales_ids } =
      req.body;

    if (!nombre || !tipo || porcentaje === undefined) {
      return error(res, 'nombre, tipo y porcentaje son requeridos');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO conceptos_costo (nombre, tipo, porcentaje, descripcion, es_resta)
         VALUES (?, ?, ?, ?, ?)`,
        [nombre, tipo, porcentaje, descripcion || null, es_resta || 0]
      );

      const conceptoId = result.insertId;

      // Bulk insert channel assignments
      if (canales_ids && canales_ids.length > 0) {
        const values = canales_ids.map((canalId) => [conceptoId, canalId]);
        await connection.query(
          'INSERT INTO conceptos_canales (concepto_id, canal_id) VALUES ?',
          [values]
        );
      }

      await connection.commit();

      const [newRow] = await pool.query(
        'SELECT * FROM conceptos_costo WHERE id = ?',
        [conceptoId]
      );

      const [canales] = await pool.query(
        'SELECT canal_id FROM conceptos_canales WHERE concepto_id = ?',
        [conceptoId]
      );

      const concepto = newRow[0];
      concepto.canal_ids = canales.map((c) => c.canal_id);

      success(res, concepto, 201);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  })
);

// PUT /:id - Update concept and reassign channels
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { nombre, tipo, porcentaje, descripcion, es_resta, canales_ids } =
      req.body;

    if (!nombre || !tipo || porcentaje === undefined) {
      return error(res, 'nombre, tipo y porcentaje son requeridos');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `UPDATE conceptos_costo
         SET nombre = ?, tipo = ?, porcentaje = ?, descripcion = ?, es_resta = ?
         WHERE id = ? AND activo = 1`,
        [nombre, tipo, porcentaje, descripcion || null, es_resta || 0, id]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return error(res, 'Concepto no encontrado', 404);
      }

      // Delete old channel assignments and insert new ones
      await connection.query(
        'DELETE FROM conceptos_canales WHERE concepto_id = ?',
        [id]
      );

      if (canales_ids && canales_ids.length > 0) {
        const values = canales_ids.map((canalId) => [id, canalId]);
        await connection.query(
          'INSERT INTO conceptos_canales (concepto_id, canal_id) VALUES ?',
          [values]
        );
      }

      await connection.commit();

      const [updated] = await pool.query(
        'SELECT * FROM conceptos_costo WHERE id = ?',
        [id]
      );

      const [canales] = await pool.query(
        'SELECT canal_id FROM conceptos_canales WHERE concepto_id = ?',
        [id]
      );

      const concepto = updated[0];
      concepto.canal_ids = canales.map((c) => c.canal_id);

      success(res, concepto);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  })
);

// DELETE /:id - Soft delete concept
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [result] = await pool.query(
      'UPDATE conceptos_costo SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Concepto no encontrado', 404);
    }

    success(res, { message: 'Concepto eliminado' });
  })
);

module.exports = router;
