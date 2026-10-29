const { JOIN_CATEGORIAS, COLS_CATEGORIA } = require('../../utils/categoriaSql');
const { ErrorPedido } = require('./pedidos');

// ============================================================================
// VENTA POR KG DESDE PRODUCTOS
// En la ficha de un producto con peso se carga el precio por kg y los kg que
// se venden; aca se crea o actualiza el producto unico de pedidos
// personalizados vinculado (pp_productos.cc_producto_id).
//
// Son de la ficha: nombre, precio, peso, estado y la linea de receta que
// apunta al producto. El costo NO se copia: esa linea (porciones por kg, "x kg")
// toma en vivo el costo por porcion, asi sigue a los precios de los ingredientes.
// ============================================================================

const r2 = (n) => Math.round(n * 100) / 100;
const kgTexto = (kg) => kg.toLocaleString('es-AR', { maximumFractionDigits: 3 });

// Lo que impide venderlo (null = nada).
function faltante(p, pesoKg) {
  if (!p || !p.activo) return 'El producto no existe';
  if (p.es_borrador) return 'Un borrador no se puede vender por kg';
  if (!(Number(p.peso_total_g) > 0)) return 'Para vender por kg cargá el peso total de la receta';
  if (!(Number(p.precio_venta_kg) > 0)) return 'Para vender por kg cargá el precio de venta por kg';
  if (!(pesoKg > 0)) return 'Indicá cuántos kg se venden';
  return null;
}

// `pedido` = { activa, peso_kg } desde la ficha. Sin pedido solo refresca el
// vinculo que ya exista (si el producto dejo de ser vendible, lo pausa).
// Devuelve true si toco pedidos personalizados (hay que invalidar el catalogo).
async function sincronizarVentaPorKg(conn, productoId, pedido) {
  const [[vinculo]] = await conn.query(
    'SELECT id, peso_kg, activo FROM pp_productos WHERE cc_producto_id = ?', [productoId]
  );
  const activa = pedido ? !!pedido.activa : !!vinculo?.activo;
  if (!vinculo && !activa) return false;

  const [[p]] = await conn.query(
    `SELECT p.nombre, p.porciones, p.peso_total_g, p.precio_venta_kg, p.activo, p.es_borrador, ${COLS_CATEGORIA}
     FROM productos p ${JOIN_CATEGORIAS('p')} WHERE p.id = ?`,
    [productoId]
  );
  const pesoKg = Math.round(Number(pedido ? pedido.peso_kg : vinculo.peso_kg) * 1000) / 1000;
  const falta = faltante(p, pesoKg);
  if (falta) {
    if (pedido && activa) throw new ErrorPedido(falta);
    if (vinculo) await conn.query('UPDATE pp_productos SET activo = 0 WHERE id = ?', [vinculo.id]);
    return !!vinculo;
  }

  const nombre = `${p.nombre} ${kgTexto(pesoKg)} kg`.slice(0, 150);
  const precio = r2(Number(p.precio_venta_kg) * pesoKg);
  const porcionesPorKg = Math.round(((Number(p.porciones) || 1) / (Number(p.peso_total_g) / 1000)) * 1e6) / 1e6;

  let ppId = vinculo?.id;
  if (ppId) {
    await conn.query(
      'UPDATE pp_productos SET nombre = ?, precio_base = ?, peso_kg = ?, activo = ? WHERE id = ?',
      [nombre, precio, pesoKg, activa ? 1 : 0, ppId]
    );
  } else {
    // La categoria solo al crearlo: despues se acomoda en pedidos personalizados.
    const [r] = await conn.query(
      `INSERT INTO pp_productos (nombre, categoria, precio_base, peso_kg, activo, cc_producto_id)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [nombre, p.subcategoria_nombre || p.categoria_nombre, precio, pesoKg, productoId]
    );
    ppId = r.insertId;
  }
  await conn.query('DELETE FROM pp_receta_lineas WHERE producto_id = ? AND cc_producto_id = ?', [ppId, productoId]);
  await conn.query(
    'INSERT INTO pp_receta_lineas (producto_id, cc_producto_id, cantidad, por_kg) VALUES (?, ?, ?, 1)',
    [ppId, productoId, porcionesPorKg]
  );
  return true;
}

module.exports = { sincronizarVentaPorKg };
