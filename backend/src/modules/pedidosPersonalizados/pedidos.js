const pool = require('../../config/db');
const { cotizar } = require('./motor');
const { getCatalogo, getCostos, lineasDe } = require('./catalogo');

// ============================================================================
// PEDIDOS: se crean SIEMPRE recalculando con el motor (el precio que manda el
// POS no cuenta) y se guardan como foto inmutable de nombres, precios y
// costos del momento. Cobros y senas quedan en el POS.
// ============================================================================

// Transiciones permitidas. Fijas aca para que un pedido entregado o
// cancelado no pueda "volver" por error.
const TRANSICIONES = {
  pendiente: ['en_produccion', 'cancelado'],
  en_produccion: ['pendiente', 'listo', 'cancelado'],
  listo: ['en_produccion', 'entregado', 'cancelado'],
  entregado: [],
  cancelado: ['pendiente'],
};
const ESTADOS = Object.keys(TRANSICIONES);
const ORIGENES = ['pos', 'web', 'panel'];

class ErrorPedido extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const texto = (v, max) => {
  const s = v == null ? '' : String(v).trim();
  return s ? s.slice(0, max) : null;
};

// Normaliza lo que llega por HTTP: ids a numero, cantidad por defecto 1.
function normalizarItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => ({
    producto_id: Number(it?.producto_id),
    cantidad: it?.cantidad == null ? 1 : Number(it.cantidad),
    opciones: Array.isArray(it?.opciones) ? it.opciones.map(Number) : [],
    notas: texto(it?.notas, 300),
  }));
}

// Cotiza contra el catalogo vigente con los costos del momento.
async function cotizarPedido(itemsCrudos) {
  const catalogo = await getCatalogo();
  const items = normalizarItems(itemsCrudos);
  const productos = [...new Set(items.map((i) => i.producto_id))]
    .map((id) => catalogo.productos.get(id))
    .filter(Boolean);
  const costos = await getCostos(productos.flatMap(lineasDe));
  return { ...cotizar(catalogo, costos, items), version: catalogo.version };
}

// Numero correlativo del dia en hora de Argentina: PP-20261005-0001
function prefijoDelDia() {
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return `PP-${hoy.replace(/-/g, '')}-`;
}

async function buscarPorRef(conn, origen, ref) {
  const [[fila]] = await conn.query(
    'SELECT id, numero, estado, total FROM pp_pedidos WHERE origen = ? AND ref_externa = ?',
    [origen, ref]
  );
  return fila || null;
}

async function crearPedido(datos) {
  const origen = ORIGENES.includes(datos.origen) ? datos.origen : null;
  if (!origen) throw new ErrorPedido('Origen invalido');
  const ref = texto(datos.ref_externa, 80);

  // Reintento del POS con el mismo id de venta: se devuelve el que ya existe.
  if (ref) {
    const previo = await buscarPorRef(pool, origen, ref);
    if (previo) return { pedido: previo, duplicado: true };
  }

  const cot = await cotizarPedido(datos.items);
  if (!cot.ok) throw new ErrorPedido('El pedido tiene errores', 422, { cotizacion: cot });

  let fechaEntrega = null;
  if (datos.fecha_entrega) {
    const f = new Date(datos.fecha_entrega);
    if (Number.isNaN(f.getTime())) throw new ErrorPedido('Fecha de entrega invalida');
    fechaEntrega = f;
  }

  const prefijo = prefijoDelDia();
  // Dos pedidos al mismo tiempo pueden calcular el mismo numero: la UNIQUE lo
  // frena y se reintenta con el siguiente.
  for (let intento = 0; intento < 5; intento++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[{ ultimo }]] = await conn.query(
        'SELECT MAX(numero) AS ultimo FROM pp_pedidos WHERE numero LIKE ?', [`${prefijo}%`]
      );
      const correlativo = (ultimo ? Number(ultimo.slice(prefijo.length)) : 0) + 1;
      const numero = `${prefijo}${String(correlativo).padStart(4, '0')}`;

      const [res] = await conn.query(
        `INSERT INTO pp_pedidos
           (numero, origen, ref_externa, cliente_nombre, cliente_telefono, notas, fecha_entrega, total, costo_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [numero, origen, ref, texto(datos.cliente_nombre, 150), texto(datos.cliente_telefono, 40),
          texto(datos.notas, 1000), fechaEntrega, cot.total, cot.costo_total]
      );
      const pedidoId = res.insertId;

      for (const it of cot.items) {
        const [ri] = await conn.query(
          `INSERT INTO pp_pedido_items
             (pedido_id, producto_id, nombre, cantidad, precio_unitario, costo_unitario, peso_kg, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [pedidoId, it.producto_id, it.nombre, it.cantidad, it.precio_unitario, it.costo_unitario, it.peso_kg, it.notas]
        );
        if (it.opciones.length) {
          await conn.query(
            `INSERT INTO pp_pedido_item_opciones (item_id, opcion_id, paso_nombre, opcion_nombre, precio, costo)
             VALUES ?`,
            [it.opciones.map((o) => [ri.insertId, o.opcion_id, o.paso_nombre, o.nombre, o.precio, o.costo])]
          );
        }
      }

      await conn.commit();
      return { pedido: { id: pedidoId, numero, estado: 'pendiente', total: cot.total }, duplicado: false };
    } catch (err) {
      await conn.rollback();
      if (err.code !== 'ER_DUP_ENTRY') throw err;
      // Choco el id de venta (otro request del mismo POS gano): es el mismo pedido.
      if (ref && /uq_pp_pedidos_ref/.test(err.message)) {
        return { pedido: await buscarPorRef(pool, origen, ref), duplicado: true };
      }
    } finally {
      conn.release();
    }
  }
  throw new ErrorPedido('No se pudo numerar el pedido, reintenta', 503);
}

// clave = { id } o { numero }
function columna(clave) {
  return clave.id != null ? ['id', Number(clave.id)] : ['numero', String(clave.numero)];
}

async function cambiarEstado(clave, estadoNuevo) {
  const [col, valor] = columna(clave);
  if (!ESTADOS.includes(estadoNuevo)) throw new ErrorPedido('Estado invalido');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[pedido]] = await conn.query(`SELECT id, numero, estado FROM pp_pedidos WHERE ${col} = ? FOR UPDATE`, [valor]);
    if (!pedido) throw new ErrorPedido('Pedido no encontrado', 404);
    if (pedido.estado !== estadoNuevo) {
      if (!TRANSICIONES[pedido.estado].includes(estadoNuevo)) {
        throw new ErrorPedido(`No se puede pasar de "${pedido.estado}" a "${estadoNuevo}"`, 409);
      }
      await conn.query('UPDATE pp_pedidos SET estado = ? WHERE id = ?', [estadoNuevo, pedido.id]);
    }
    await conn.commit();
    return { ...pedido, estado: estadoNuevo };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Pedido con sus items y opciones (2 queries para el detalle).
async function getPedido(clave) {
  const [col, valor] = columna(clave);
  const [[pedido]] = await pool.query(`SELECT * FROM pp_pedidos WHERE ${col} = ?`, [valor]);
  if (!pedido) return null;
  const [items] = await pool.query('SELECT * FROM pp_pedido_items WHERE pedido_id = ? ORDER BY id', [pedido.id]);
  const [opciones] = items.length
    ? await pool.query('SELECT * FROM pp_pedido_item_opciones WHERE item_id IN (?) ORDER BY id', [items.map((i) => i.id)])
    : [[]];
  return {
    ...pedido,
    total: Number(pedido.total),
    costo_total: Number(pedido.costo_total),
    items: items.map((i) => ({
      ...i,
      precio_unitario: Number(i.precio_unitario),
      costo_unitario: Number(i.costo_unitario),
      peso_kg: i.peso_kg == null ? null : Number(i.peso_kg),
      opciones: opciones
        .filter((o) => o.item_id === i.id)
        .map((o) => ({ ...o, precio: Number(o.precio), costo: Number(o.costo) })),
    })),
  };
}

module.exports = {
  cotizarPedido, crearPedido, cambiarEstado, getPedido, normalizarItems,
  ErrorPedido, TRANSICIONES, ESTADOS,
};
