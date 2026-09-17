const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// ============================================================================
// SINCRONIZACION CONFIG → CONCEPTOS DE COSTO
// Algunas claves de "Configuracion General" duplican porcentajes que viven en
// conceptos_costo (que es lo que realmente alimenta las rentabilidades).
// Cuando se actualiza una de estas claves, propagamos el nuevo % a la fila
// matching de conceptos_costo para mantener todo en sync.
// ============================================================================
const CONFIG_TO_CONCEPTO = {
  iva: { tipo: 'impuesto', namePrefix: 'IVA' },
  iibb: { tipo: 'impuesto', namePrefix: 'IIBB' },
  comision_tarjeta: { tipo: 'comision', namePrefix: 'Comision Tarjeta' },
  comision_pedidosya: { tipo: 'comision', namePrefix: 'Comision PedidosYa' },
  descuento_efectivo: { tipo: 'descuento', namePrefix: 'Descuento Efectivo' },
};

async function syncConceptoFromConfig(clave, valor) {
  const map = CONFIG_TO_CONCEPTO[clave];
  if (!map) return { synced: 0 };
  const numericValue = parseFloat(valor);
  if (Number.isNaN(numericValue)) return { synced: 0 };
  const [result] = await pool.query(
    `UPDATE conceptos_costo
     SET porcentaje = ?
     WHERE activo = 1
       AND tipo = ?
       AND LOWER(nombre) LIKE LOWER(?)`,
    [numericValue, map.tipo, `${map.namePrefix}%`]
  );
  return { synced: result.affectedRows || 0 };
}

// GET / - Return all config as array
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM configuracion');
    success(res, rows);
  })
);

// PUT / - Update a config value
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const { clave, valor } = req.body;

    if (!clave) {
      return error(res, 'La clave es requerida');
    }

    const [result] = await pool.query(
      'UPDATE configuracion SET valor = ? WHERE clave = ?',
      [valor, clave]
    );

    if (result.affectedRows === 0) {
      return error(res, 'Clave de configuracion no encontrada', 404);
    }

    // Si la clave es uno de los %-config conocidos, propagar el cambio a
    // conceptos_costo para que las rentabilidades reflejen el nuevo valor.
    const sync = await syncConceptoFromConfig(clave, valor);

    success(res, { clave, valor, conceptos_sincronizados: sync.synced });
  })
);

module.exports = router;
