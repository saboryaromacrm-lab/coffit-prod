// ============================================================================
// HISTORIAL DE PRECIOS DE PRODUCTOS
// Unico punto que escribe en producto_precios_historial. Lo llaman los dos
// lugares que cambian el precio local (Productos y la Carta) y el alta.
// ============================================================================

// Registra un cambio de precio. No hace nada si el precio no cambio de verdad
// (comparacion al centavo: los DECIMAL llegan como string desde MySQL).
// `db` puede ser el pool o una conexion con transaccion abierta.
async function registrarCambioPrecio(db, productoId, precioAnterior, precioNuevo, origen) {
  const nuevo = Number(precioNuevo) || 0;
  const anterior = precioAnterior == null ? null : Number(precioAnterior) || 0;

  if (anterior === null && nuevo <= 0) return; // alta sin precio: no hay nada que registrar
  if (anterior !== null && Math.round(anterior * 100) === Math.round(nuevo * 100)) return;

  await db.query(
    `INSERT INTO producto_precios_historial (producto_id, precio_anterior, precio_nuevo, origen)
     VALUES (?, ?, ?, ?)`,
    [productoId, anterior, nuevo, origen]
  );
}

module.exports = { registrarCambioPrecio };
