const router = require('express').Router();
const pool = require('../../config/db');
const asyncHandler = require('../../middleware/asyncHandler');
const { success, error } = require('../../utils/response');
const { cotizar, combinaciones } = require('./motor');
const { getCatalogo, armarBorrador, lineasDe, getCostos } = require('./catalogo');
const editor = require('./editor');
const pedidos = require('./pedidos');
const { importarDesdeTienda } = require('./importar');

// ============================================================================
// PANEL — /api/pp
// Editor de productos armables y grupos, simulador con costos y pedidos.
// ============================================================================

// Los errores de validacion del modulo traen su status (y a veces la
// cotizacion con el detalle por paso); el resto sigue al errorHandler.
const manejar = (fn) => asyncHandler(async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (!(err instanceof pedidos.ErrorPedido)) throw err;
    res.status(err.status).json({ success: false, message: err.message, ...(err.cotizacion && { cotizacion: err.cotizacion }) });
  }
});

const foodCost = (precio, costo) => (precio > 0 ? Math.round((costo / precio) * 1000) / 10 : null);

// Producto a simular: un borrador del editor (sin guardar) o uno guardado.
async function productoASimular(body) {
  const catalogo = await getCatalogo();
  if (body.borrador) return { prod: armarBorrador(body.borrador, catalogo), aId: String };
  const prod = catalogo.productos.get(Number(body.producto_id));
  if (!prod) throw new pedidos.ErrorPedido('Producto no encontrado', 404);
  return { prod, aId: Number };
}

// ---------------------------------------------------------------- productos
router.get('/productos', manejar(async (req, res) => {
  const [lista, catalogo] = await Promise.all([editor.listarProductos(), getCatalogo()]);
  const desde = new Map(catalogo.publico.map((p) => [p.id, p.precio_desde]));
  success(res, lista.map((p) => ({ ...p, precio_desde: desde.get(p.id) ?? null })));
}));

router.get('/productos/:id', manejar(async (req, res) => {
  const prod = await editor.leerProducto(Number(req.params.id));
  if (!prod) return error(res, 'Producto no encontrado', 404);
  success(res, prod);
}));

router.post('/productos', manejar(async (req, res) => {
  const id = await editor.guardarProducto(null, req.body);
  success(res, await editor.leerProducto(id), 201);
}));

router.put('/productos/:id', manejar(async (req, res) => {
  const id = await editor.guardarProducto(Number(req.params.id), req.body);
  success(res, await editor.leerProducto(id));
}));

router.delete('/productos/:id', manejar(async (req, res) => {
  if (!(await editor.borrarProducto(Number(req.params.id)))) return error(res, 'Producto no encontrado', 404);
  success(res, { borrado: true });
}));

// ------------------------------------------------------------------- grupos
router.get('/grupos', manejar(async (req, res) => {
  success(res, await editor.listarGrupos());
}));

router.post('/grupos', manejar(async (req, res) => {
  const id = await editor.guardarGrupo(null, req.body);
  success(res, (await editor.listarGrupos()).find((g) => g.id === id), 201);
}));

router.put('/grupos/:id', manejar(async (req, res) => {
  const id = await editor.guardarGrupo(Number(req.params.id), req.body);
  success(res, (await editor.listarGrupos()).find((g) => g.id === id));
}));

router.delete('/grupos/:id', manejar(async (req, res) => {
  if (!(await editor.borrarGrupo(Number(req.params.id)))) return error(res, 'Grupo no encontrado', 404);
  success(res, { borrado: true });
}));

// ---------------------------------------------------------------- simulador
// POST /simular { producto_id | borrador, opciones: [], cantidad }
// Precio, costo y food cost de UNA combinacion, con el estado de cada paso.
router.post('/simular', manejar(async (req, res) => {
  const { prod, aId } = await productoASimular(req.body);
  const costos = await getCostos(lineasDe(prod));
  const r = cotizar({ productos: new Map([[prod.id, prod]]) }, costos, [{
    producto_id: prod.id,
    cantidad: req.body.cantidad ?? 1,
    opciones: (req.body.opciones || []).map(aId),
  }]);
  const it = r.items[0];
  success(res, { ...it, food_cost: it.errores.length ? null : foodCost(it.precio_unitario, it.costo_unitario) });
}));

// POST /combinaciones { producto_id | borrador }
// Todas las combinaciones de los pasos obligatorios con su margen: muestra
// de un vistazo que harina x relleno (o version x tamano) deja menos.
router.post('/combinaciones', manejar(async (req, res) => {
  const { prod } = await productoASimular(req.body);
  const costos = await getCostos(lineasDe(prod));
  const { combinaciones: lista, truncado } = combinaciones(prod, costos);
  success(res, {
    truncado,
    combinaciones: lista
      .map((c) => ({
        opciones: c.opciones.map((o) => ({ paso: o.paso_nombre, nombre: o.nombre })),
        precio: c.precio_unitario,
        costo: c.costo_unitario,
        costo_incompleto: c.costo_incompleto,
        margen: Math.round((c.precio_unitario - c.costo_unitario) * 100) / 100,
        food_cost: foodCost(c.precio_unitario, c.costo_unitario),
      }))
      .sort((a, b) => (b.food_cost ?? -1) - (a.food_cost ?? -1)),
  });
}));

// ------------------------------------------------------------------ pedidos
router.get('/pedidos', manejar(async (req, res) => {
  const { estado, desde, hasta } = req.query;
  const filtros = [];
  const params = [];
  if (estado && pedidos.ESTADOS.includes(estado)) { filtros.push('estado = ?'); params.push(estado); }
  if (desde) { filtros.push('created_at >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { filtros.push('created_at <= ?'); params.push(`${hasta} 23:59:59`); }
  const [rows] = await pool.query(
    `SELECT p.id, p.numero, p.origen, p.ref_externa, p.cliente_nombre, p.cliente_telefono,
            p.fecha_entrega, p.estado, p.total, p.costo_total, p.created_at,
            (SELECT COALESCE(SUM(i.cantidad), 0) FROM pp_pedido_items i WHERE i.pedido_id = p.id) AS unidades
     FROM pp_pedidos p
     ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
     ORDER BY p.created_at DESC
     LIMIT 300`,
    params
  );
  success(res, rows.map((r) => ({
    ...r,
    total: Number(r.total),
    costo_total: Number(r.costo_total),
    unidades: Number(r.unidades),
    food_cost: foodCost(Number(r.total), Number(r.costo_total)),
  })));
}));

router.get('/pedidos/:id', manejar(async (req, res) => {
  const p = await pedidos.getPedido({ id: req.params.id });
  if (!p) return error(res, 'Pedido no encontrado', 404);
  success(res, { ...p, food_cost: foodCost(p.total, p.costo_total), transiciones: pedidos.TRANSICIONES[p.estado] });
}));

router.post('/pedidos', manejar(async (req, res) => {
  const r = await pedidos.crearPedido({ ...req.body, origen: 'panel', ref_externa: null });
  success(res, r.pedido, 201);
}));

router.patch('/pedidos/:id/estado', manejar(async (req, res) => {
  success(res, await pedidos.cambiarEstado({ id: req.params.id }, req.body.estado));
}));

// ------------------------------------------------------------------- varios
// Import del catalogo de la tienda de pedidos personalizados (idempotente).
router.post('/importar', manejar(async (req, res) => {
  success(res, await importarDesdeTienda(process.env.PP_TIENDA_API || undefined));
}));

// Estado de la integracion, para la pantalla del panel.
router.get('/estado', manejar(async (req, res) => {
  const catalogo = await getCatalogo();
  success(res, {
    api_key_configurada: !!process.env.PP_API_KEY,
    catalogo_version: catalogo.version,
    productos_publicados: catalogo.publico.length,
  });
}));

module.exports = router;
