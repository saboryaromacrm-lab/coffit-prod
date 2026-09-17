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
    pedidosya: calcularRentabilidadCanal(
      producto.precio_pedidosya || 0,
      costo,
      resumenCanales.pedidosya?.conceptos || []
    ),
  };
}

module.exports = { calcularRentabilidadCanal, calcularRentabilidades };
