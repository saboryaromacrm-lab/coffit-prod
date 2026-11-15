const pool = require('../../config/db');
const { JOIN_CATEGORIAS, CAT_NOMBRE, SUBCAT_NOMBRE } = require('../../utils/categoriaSql');
const { calcularRentabilidadCanal, getResumenLocal } = require('../../utils/mcNeto');
const { parsePasos } = require('../../utils/cartaVariantes');

const r1 = (n) => Math.round(n * 10) / 10;

// Todo lo que la IA necesita para armar combos con la carta real:
//  - carta: productos en carta y disponibles, con precio, costo y rentabilidad
//    por canal (los mismos numeros que ve la persona en Carta/Promos),
//  - comisiones: conceptos de cada canal (% sobre el precio),
//  - promos_existentes: para no repetirlas.
async function contextoCombos() {
  const resumen = await getResumenLocal(pool);
  const [prods] = await pool.query(
    `SELECT DISTINCT p.id, p.nombre, ${CAT_NOMBRE} AS categoria, ${SUBCAT_NOMBRE} AS subcategoria,
            p.precio_publico, p.costo_total
     FROM carta_items ci
     JOIN productos p ON p.id = ci.producto_id AND p.activo = 1
     ${JOIN_CATEGORIAS('p')}
     WHERE ci.activo = 1 AND ci.desactivar = 0 AND ci.oferta_id IS NULL
     ORDER BY categoria, p.nombre`
  );
  const carta = prods
    .map((p) => ({ ...p, precio: Number(p.precio_publico) || 0, costo: Number(p.costo_total) || 0 }))
    .filter((p) => p.precio > 0)
    .map((p) => {
      const tarjeta = calcularRentabilidadCanal(p.precio, p.costo, resumen.tarjeta.conceptos);
      return {
        producto_id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        ...(p.subcategoria && { subcategoria: p.subcategoria }),
        precio: p.precio,
        ...(p.costo > 0
          ? { costo: r1(p.costo), food_cost_pct: r1((p.costo / p.precio) * 100), ganancia_tarjeta: Math.round(tarjeta.ganancia) }
          : { sin_costo: true }),
      };
    });

  const [promos] = await pool.query(
    `SELECT o.id, o.nombre, o.categoria_carta, o.tipo, o.valor, o.estado, o.pasos,
            GROUP_CONCAT(CONCAT(TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM op.cantidad)), '× ', p.nombre) ORDER BY p.nombre SEPARATOR ', ') AS incluye
     FROM ofertas o
     LEFT JOIN oferta_productos op ON op.oferta_id = o.id
     LEFT JOIN productos p ON p.id = op.producto_id
     WHERE o.activo = 1
     GROUP BY o.id, o.nombre, o.categoria_carta, o.tipo, o.valor, o.estado, o.pasos`
  );

  return {
    carta,
    comisiones: Object.fromEntries(Object.entries(resumen).map(([canal, c]) => [
      canal, c.conceptos.map((k) => ({ nombre: k.nombre, porcentaje: k.valor })),
    ])),
    promos_existentes: promos.map((o) => ({
      nombre: o.nombre,
      categoria: o.categoria_carta,
      tipo: o.tipo,
      valor: Number(o.valor),
      estado: o.estado,
      incluye: o.incluye || '',
      pasos: parsePasos(o.pasos).map((p) => p.nombre),
    })),
  };
}

module.exports = { contextoCombos };
