const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const requiereClaveDe = require('../../middleware/apiKey');
const { success, error } = require('../../utils/response');
const { getCatalogo } = require('./catalogo');
const pedidos = require('./pedidos');

// ============================================================================
// API PUBLICA — /api/public/pp  (CORS abierto)
// La consume el POS y, mas adelante, la tienda online. NUNCA devuelve costos.
//
//   GET   /catalogo                    publico, con ETag (304 si no cambio)
//   POST  /cotizar                     publico (solo calcula, no guarda)
//   POST  /pedidos                     clave X-API-Key
//   GET   /pedidos/:numero             clave X-API-Key
//   PATCH /pedidos/:numero/estado      clave X-API-Key
// ============================================================================

const router = express.Router();
// Se monta antes del express.json global de la app.
router.use(express.json({ limit: '100kb' }));

// Clave del POS: variable de entorno PP_API_KEY, header X-API-Key.
const requiereClave = requiereClaveDe('PP_API_KEY');

// Saca los costos de una cotizacion antes de mandarla afuera.
function sinCostos(cot) {
  return {
    ok: cot.ok,
    total: cot.total,
    version: cot.version,
    errores: cot.errores,
    items: cot.items.map(({ costo_unitario, costo_incompleto, opciones, ...it }) => ({
      ...it,
      opciones: (opciones || []).map(({ costo, ...o }) => o),
    })),
  };
}

const manejar = (fn) => asyncHandler(async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (!(err instanceof pedidos.ErrorPedido)) throw err;
    res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.cotizacion && { cotizacion: sinCostos(err.cotizacion) }),
    });
  }
});

router.get('/catalogo', manejar(async (req, res) => {
  const catalogo = await getCatalogo();
  const etag = `"${catalogo.version}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'no-cache'); // siempre revalida, pero sin bajar todo si no cambio
  if (req.get('if-none-match') === etag) return res.status(304).end();
  success(res, { version: catalogo.version, productos: catalogo.publico });
}));

router.post('/cotizar', manejar(async (req, res) => {
  success(res, sinCostos(await pedidos.cotizarPedido(req.body?.items)));
}));

router.post('/pedidos', requiereClave, manejar(async (req, res) => {
  const b = req.body || {};
  const origen = b.origen === 'web' ? 'web' : 'pos';
  const ref = b.ref_externa == null ? '' : String(b.ref_externa).trim();
  // Sin id de venta no hay forma de evitar duplicados si el POS reintenta.
  if (!ref) return error(res, 'Falta ref_externa (id de la venta)');

  const r = await pedidos.crearPedido({ ...b, origen, ref_externa: ref });
  const detalle = await pedidos.getPedido({ id: r.pedido.id });
  success(res, { ...publicoDePedido(detalle), duplicado: r.duplicado }, r.duplicado ? 200 : 201);
}));

router.get('/pedidos/:numero', requiereClave, manejar(async (req, res) => {
  const p = await pedidos.getPedido({ numero: req.params.numero });
  if (!p) return error(res, 'Pedido no encontrado', 404);
  success(res, publicoDePedido(p));
}));

router.patch('/pedidos/:numero/estado', requiereClave, manejar(async (req, res) => {
  const p = await pedidos.cambiarEstado({ numero: req.params.numero }, req.body?.estado);
  success(res, { numero: p.numero, estado: p.estado });
}));

// Pedido sin costos para afuera.
function publicoDePedido(p) {
  return {
    numero: p.numero,
    origen: p.origen,
    ref_externa: p.ref_externa,
    estado: p.estado,
    cliente_nombre: p.cliente_nombre,
    cliente_telefono: p.cliente_telefono,
    fecha_entrega: p.fecha_entrega,
    notas: p.notas,
    total: p.total,
    creado: p.created_at,
    items: p.items.map((i) => ({
      producto_id: i.producto_id,
      nombre: i.nombre,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      peso_kg: i.peso_kg,
      notas: i.notas,
      opciones: i.opciones.map((o) => ({ opcion_id: o.opcion_id, paso: o.paso_nombre, nombre: o.opcion_nombre, precio: o.precio })),
    })),
  };
}

module.exports = router;
