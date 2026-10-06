// ============================================================================
// COSTO DE INGREDIENTE QUE VIENE DE SABOR Y AROMA
// Una sola implementacion para las dos vias de entrada:
//   - import de envios (routes/sya.js)
//   - lista de costos que empuja el ERP (routes/syaCostosPublic.js)
// ============================================================================

const PROVEEDOR_SYA = 'Sabor y Aroma';

// Aplica un costo unitario (en la unidad del ingrediente) y deja la marca
// "actualizado por Sabor y Aroma". Slot 1 = SyA (fuente real de reposicion);
// si estaba ocupado por otro proveedor, ese pasa al slot 2 (una sola vez).
//
// ANTI-RETROCESO: solo aplica si `fecha` es igual o mas nueva que la ultima
// que toco este ingrediente (sya_fecha). Un dato viejo NUNCA pisa uno mas
// reciente. Devuelve true si actualizo.
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

// --- Lista de costos por nombre (la que empuja el ERP) -----------------------

// Nombre comparable: sin mayusculas, tildes ni espacios de mas. Es una
// coincidencia EXACTA de lo demas (no la similitud de utils/similitud.js, que
// borra tamanos y confundiria "Franui pote x150G" con "Franui pote x300G").
function normalizarNombre(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Unidades conocidas: familia + cuantas unidades base trae.
const UNIDADES = {
  g: ['masa', 1], kg: ['masa', 1000],
  ml: ['volumen', 1], l: ['volumen', 1000],
  u: ['unidad', 1], doc: ['unidad', 12],
};
const esUnidad = (u) => Object.hasOwn(UNIDADES, String(u || '').toLowerCase());

// Pasa un costo "por unidadEnviada" a "por unidadIngrediente".
// Ej: $12000 por kg -> $12 por g. null si no son de la misma familia
// (kg contra unidades) o alguna no se conoce.
function convertirCosto(costo, unidadEnviada, unidadIngrediente) {
  const de = UNIDADES[String(unidadEnviada || '').toLowerCase()];
  const a = UNIDADES[String(unidadIngrediente || '').toLowerCase()];
  if (!de || !a || de[0] !== a[0]) return null;
  return (costo * a[1]) / de[1];
}

module.exports = { PROVEEDOR_SYA, aplicarCostoIngrediente, normalizarNombre, convertirCosto, esUnidad };
