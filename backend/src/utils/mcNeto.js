/**
 * Calcula la rentabilidad por canal para un producto
 */
function calcularRentabilidadCanal(precio, costo, conceptos) {
  let totalDeducciones = 0;
  let descuentoMonto = 0;
  const detalles = [];

  for (const concepto of conceptos) {
    const monto = precio * (concepto.valor / 100);

    if (concepto.tipo === 'descuento') {
      descuentoMonto = monto;
    }

    totalDeducciones += monto;
    detalles.push({
      nombre: concepto.nombre,
      tipo: concepto.tipo,
      porcentaje: concepto.valor,
      monto,
    });
  }

  const precioNeto = precio - descuentoMonto;
  const ganancia = precio - costo - totalDeducciones;
  const mcNeto = precioNeto > 0 ? (ganancia / precioNeto) * 100 : 0;
  const markup = costo > 0 ? ((precio - costo) / costo) * 100 : 0;

  return {
    precio,
    costo,
    deducciones: totalDeducciones,
    ganancia,
    mc_neto: Math.round(mcNeto * 10) / 10,
    markup: Math.round(markup * 10) / 10,
    detalles,
  };
}

/**
 * Calcula rentabilidades para los 3 canales
 */
function calcularRentabilidades(producto, resumenCanales) {
  const costo = producto.costo_total || 0;

  return {
    local_tarjeta: calcularRentabilidadCanal(
      producto.precio_publico || 0,
      costo,
      resumenCanales.tarjeta?.conceptos || []
    ),
    local_efectivo: calcularRentabilidadCanal(
      producto.precio_publico || 0,
      costo,
      resumenCanales.efectivo?.conceptos || []
    ),
  };
}

/**
 * Canales LOCALES (tarjeta + efectivo) con sus conceptos de costo
 * (porcentaje del canal si tiene override). Forma: { tarjeta, efectivo }
 * con { nombre, conceptos: [{ id, nombre, tipo, valor }] }.
 */
async function getResumenLocal(pool) {
  const out = {};
  for (const key of ['tarjeta', 'efectivo']) {
    const [chRows] = await pool.query(
      'SELECT * FROM canales_venta WHERE codigo = ? AND activo = 1',
      [key]
    );
    if (chRows.length === 0) { out[key] = { nombre: key, conceptos: [] }; continue; }
    const channel = chRows[0];
    const [linked] = await pool.query(
      `SELECT cc.porcentaje_override, c.*
       FROM conceptos_canales cc
       JOIN conceptos_costo c ON c.id = cc.concepto_id
       WHERE cc.canal_id = ? AND c.activo = 1`,
      [channel.id]
    );
    out[key] = {
      nombre: channel.nombre,
      conceptos: linked.map((lc) => ({
        id: lc.id,
        nombre: lc.nombre,
        tipo: lc.tipo,
        valor: lc.porcentaje_override !== null ? parseFloat(lc.porcentaje_override) : parseFloat(lc.porcentaje),
      })),
    };
  }
  return out;
}

module.exports = { calcularRentabilidadCanal, calcularRentabilidades, getResumenLocal };
