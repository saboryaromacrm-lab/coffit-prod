const router = require('express').Router();
const pool = require('../../config/db');
const asyncHandler = require('../../middleware/asyncHandler');
const { success, error } = require('../../utils/response');
const { NUTRIENTES } = require('./calculo');
const D = require('./datos');
const { MODELOS, MODELO_DEFAULT, MAX_POR_PEDIDO, ErrorIA, sugerirIngredientes } = require('./ia');

// ============================================================================
// INFO NUTRICIONAL — /api/nutricion
// Ingredientes: valores cada 100 g (sugeridos por la IA o a mano) + control.
// Subrecetas y productos: calculados con la receta, control del producto.
// ============================================================================

// ---------------------------------------------------------------- ingredientes

// Alertas de la IA que siguen vigentes (la linea existe con la misma cantidad)
function alertasVigentes(fila, usos) {
  return D.alertasDe(fila).flatMap((a) => {
    const uso = usos.find((u) => u.tipo === a.tipo && u.linea_id === Number(a.linea_id) && u.cantidad === Number(a.cantidad));
    return uso ? [{ tipo: a.tipo, receta_id: uso.receta_id, receta: uso.receta, cantidad: uso.cantidad, motivo: a.motivo }] : [];
  });
}

async function listarIngredientes(ids = null) {
  const [rows] = await pool.query(
    `SELECT i.id, i.nombre, i.categoria, u.abreviatura AS unidad, i.contenido_envase, i.precio1,
            i.gramos_por_unidad, ${D.COLS_NUTRI}, i.nutri_estado, i.nutri_confianza, i.nutri_nota,
            i.nutri_alertas, i.nutri_controlado_at
     FROM ingredientes i
     LEFT JOIN unidades u ON u.id = i.unidad_id
     WHERE i.activo = 1 ${ids ? 'AND i.id IN (?)' : ''}
     ORDER BY i.nombre`,
    ids ? [ids] : []
  );
  const usos = await D.usosDeIngredientes(ids);
  return rows.map((r) => {
    const usosIng = usos.get(r.id) || [];
    return {
      id: r.id,
      nombre: r.nombre,
      categoria: r.categoria,
      unidad: r.unidad,
      contenido_envase: Number(r.contenido_envase),
      precio_envase: Number(r.precio1),
      gramos_por_unidad: r.gramos_por_unidad == null ? null : Number(r.gramos_por_unidad),
      valores: D.valoresDe(r),
      estado: r.nutri_estado,
      confianza: r.nutri_confianza,
      nota: r.nutri_nota,
      controlado_at: r.nutri_controlado_at,
      usos: usosIng.length,
      alertas: alertasVigentes(r, usosIng),
    };
  });
}

router.get('/ingredientes', asyncHandler(async (req, res) => {
  success(res, await listarIngredientes());
}));

// Numero >= 0 obligatorio (los 9 valores y el peso de la unidad)
const numValido = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// PUT /ingredientes/:id — carga o correccion a mano
router.put('/ingredientes/:id', asyncHandler(async (req, res) => {
  const { gramos_por_unidad: gpu, valores, controlado } = req.body;
  if (!numValido(gpu) || gpu === 0) return error(res, 'Indicá cuántos gramos pesa 1 unidad de receta');
  if (!valores || NUTRIENTES.some((k) => !numValido(valores[k]))) return error(res, 'Completá todos los valores (0 si no tiene)');

  const [[actual]] = await pool.query(
    `SELECT i.gramos_por_unidad, ${D.COLS_NUTRI}, i.nutri_estado FROM ingredientes i WHERE i.id = ? AND i.activo = 1`,
    [req.params.id]
  );
  if (!actual) return error(res, 'Ingrediente no encontrado', 404);
  // La confianza es de la IA: si se cambio algun numero, ya no aplica
  const previos = D.valoresDe(actual);
  const sinCambios = previos && Number(actual.gramos_por_unidad) === gpu && NUTRIENTES.every((k) => previos[k] === valores[k]);

  await pool.query(
    `UPDATE ingredientes SET gramos_por_unidad = ?, ${NUTRIENTES.map((k) => `nutri_${k} = ?`).join(', ')},
       nutri_estado = ?, nutri_confianza = IF(?, nutri_confianza, NULL),
       nutri_controlado_at = IF(?, COALESCE(nutri_controlado_at, NOW()), NULL)
     WHERE id = ?`,
    [gpu, ...NUTRIENTES.map((k) => valores[k]), controlado ? 'controlado' : 'sin_revisar', !!sinCambios, !!controlado, req.params.id]
  );
  success(res, (await listarIngredientes([Number(req.params.id)]))[0]);
}));

// PATCH /ingredientes/:id/control { controlado }
router.patch('/ingredientes/:id/control', asyncHandler(async (req, res) => {
  const controlado = !!req.body.controlado;
  const [r] = await pool.query(
    `UPDATE ingredientes SET nutri_estado = ?, nutri_controlado_at = ${controlado ? 'NOW()' : 'NULL'}
     WHERE id = ? AND activo = 1 AND nutri_estado IS NOT NULL`,
    [controlado ? 'controlado' : 'sin_revisar', req.params.id]
  );
  if (r.affectedRows === 0) return error(res, 'El ingrediente no tiene información nutricional cargada', 404);
  success(res, { controlado });
}));

// ------------------------------------------------------------------------- IA

const CLAVE_MODELO = 'ia_modelo';

async function modeloElegido() {
  const [[fila]] = await pool.query('SELECT valor FROM configuracion WHERE clave = ?', [CLAVE_MODELO]);
  return MODELOS.some((m) => m.id === fila?.valor) ? fila.valor : MODELO_DEFAULT;
}

// GET /ia/modelo — modelo elegido, opciones y si la clave esta cargada
router.get('/ia/modelo', asyncHandler(async (req, res) => {
  success(res, {
    modelo: await modeloElegido(),
    opciones: MODELOS.map(({ id, nombre, detalle }) => ({ id, nombre, detalle })),
    clave_configurada: !!process.env.ANTHROPIC_API_KEY,
  });
}));

// PUT /ia/modelo { modelo }
router.put('/ia/modelo', asyncHandler(async (req, res) => {
  const { modelo } = req.body;
  if (!MODELOS.some((m) => m.id === modelo)) return error(res, 'Modelo no válido');
  await pool.query(
    `INSERT INTO configuracion (clave, valor, descripcion) VALUES (?, ?, 'Modelo de IA para la info nutricional')
     ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
    [CLAVE_MODELO, modelo]
  );
  success(res, { modelo });
}));

/**
 * La IA completa estos ingredientes (de a MAX_POR_PEDIDO, en paralelo) y lo
 * guarda "sin revisar" (pisa lo que hubiera, aunque estuviera controlado).
 * Devuelve { actualizados: ids, errores: [{ id, nombre, motivo }] }.
 * Lanza ErrorIA si la IA no esta disponible (sin clave, caida...).
 */
async function completarConIA(ids) {
  const [rows] = await pool.query(
    `SELECT i.id, i.nombre, i.categoria, u.abreviatura AS unidad, i.contenido_envase, i.precio1, i.proveedor1, i.notas
     FROM ingredientes i LEFT JOIN unidades u ON u.id = i.unidad_id
     WHERE i.activo = 1 AND i.id IN (?)`,
    [ids]
  );
  if (rows.length === 0) return { actualizados: [], errores: [] };
  const usos = await D.usosDeIngredientes(rows.map((r) => r.id));
  const modelo = await modeloElegido();
  const pedidos = rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    unidad: r.unidad || 'sin unidad',
    contenido_envase: Number(r.contenido_envase),
    precio_envase: Number(r.precio1),
    proveedor: r.proveedor1,
    notas: r.notas,
    usos: (usos.get(r.id) || []).map(({ tipo, linea_id, receta, rinde, cantidad }) => ({ tipo, linea_id, receta, rinde, cantidad })),
  }));
  const lotes = [];
  for (let k = 0; k < pedidos.length; k += MAX_POR_PEDIDO) lotes.push(pedidos.slice(k, k + MAX_POR_PEDIDO));
  const resultados = await Promise.all(lotes.map((lote) => sugerirIngredientes(lote, modelo)));

  const nombres = new Map(rows.map((r) => [r.id, r.nombre]));
  const actualizados = [];
  const errores = [];
  for (const { sugerencias, errores: errs } of resultados) {
    for (const [id, s] of sugerencias) {
      await pool.query(
        `UPDATE ingredientes SET gramos_por_unidad = ?, ${NUTRIENTES.map((k) => `nutri_${k} = ?`).join(', ')},
           nutri_estado = 'sin_revisar', nutri_confianza = ?, nutri_nota = ?, nutri_alertas = ?, nutri_controlado_at = NULL
         WHERE id = ?`,
        [s.gramos_por_unidad, ...NUTRIENTES.map((k) => s[k]), s.confianza, s.nota,
          s.alertas.length ? JSON.stringify(s.alertas) : null, id]
      );
      actualizados.push(id);
    }
    errores.push(...errs.map((e) => ({ ...e, nombre: nombres.get(e.id) })));
  }
  return { actualizados, errores };
}

// Ejecuta la IA y traduce sus errores conocidos a una respuesta 503
async function conIA(res, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorIA) { error(res, e.message, 503); return null; }
    throw e;
  }
}

// POST /ia/ingredientes { ids } — hasta MAX_POR_PEDIDO por vez (el front
// arma los lotes para mostrar el progreso)
router.post('/ia/ingredientes', asyncHandler(async (req, res) => {
  const ids = [...new Set((req.body.ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0 || ids.length > MAX_POR_PEDIDO) return error(res, `Mandá entre 1 y ${MAX_POR_PEDIDO} ingredientes`);
  const r = await conIA(res, () => completarConIA(ids));
  if (!r) return;
  success(res, { actualizados: r.actualizados.length ? await listarIngredientes(r.actualizados) : [], errores: r.errores });
}));

// Completa con la IA los ingredientes de una receta (y de sus subrecetas y
// productos) que todavia no tienen info. Con reanalizar tambien vuelve a
// analizar los "sin revisar" (ej. despues de corregir una cantidad que la IA
// marco); los controlados no se tocan.
async function completarReceta(fuentes, reanalizar) {
  const ids = await D.ingredientesDeRecetas(fuentes);
  const [faltan] = ids.length
    ? await pool.query(
      `SELECT id FROM ingredientes WHERE activo = 1 AND id IN (?)
         AND ${reanalizar ? "(nutri_estado IS NULL OR nutri_estado = 'sin_revisar')" : 'nutri_estado IS NULL'}`, [ids])
    : [[]];
  return faltan.length ? completarConIA(faltan.map((f) => f.id)) : { actualizados: [], errores: [] };
}

// POST /ia/productos/:id { reanalizar } — devuelve el producto recalculado
router.post('/ia/productos/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const r = await conIA(res, () => completarReceta({ productos: [id] }, !!req.body.reanalizar));
  if (!r) return;
  const producto = (await D.calcularProductos([id])).get(id);
  if (!producto) return error(res, 'Producto no encontrado', 404);
  success(res, { producto, completados: r.actualizados.length, errores: r.errores });
}));

// POST /ia/pp/:id { reanalizar } — lo mismo para un pedido personalizado
router.post('/ia/pp/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [lineas] = await pool.query(
    'SELECT ingrediente_id, subreceta_id, cc_producto_id FROM pp_receta_lineas WHERE producto_id = ?', [id]
  );
  const ids = (col) => lineas.map((l) => l[col]).filter((v) => v != null);
  const fuentes = { ingredientes: ids('ingrediente_id'), subrecetas: ids('subreceta_id'), productos: ids('cc_producto_id') };
  const r = await conIA(res, () => completarReceta(fuentes, !!req.body.reanalizar));
  if (!r) return;
  const producto = (await D.calcularPedidosPersonalizados([id])).get(id);
  if (!producto) return error(res, 'Producto no encontrado', 404);
  success(res, { producto, completados: r.actualizados.length, errores: r.errores });
}));

// ----------------------------------------------------------------- subrecetas

router.get('/subrecetas/:id', asyncHandler(async (req, res) => {
  const ingredientes = await D.cargarIngredientes();
  const sub = (await D.cargarSubrecetas(ingredientes)).get(Number(req.params.id));
  if (!sub) return error(res, 'Subreceta no encontrada', 404);
  success(res, sub);
}));

// ------------------------------------------------------------------ productos

// Fila de la lista (sin el detalle de la receta)
const resumen = (p) => ({
  id: p.id,
  nombre: p.nombre,
  categoria: p.categoria,
  subcategoria: p.subcategoria,
  estado: p.estado,
  porciones: p.porciones,
  porcion_g: p.porcion_g,
  energia_kcal: p.con_datos ? p.por_porcion.energia_kcal : null,
  faltantes: p.faltantes.length,
  sin_controlar: p.sin_controlar.length,
  alertas: p.alertas.length,
});

// Solo los productos que estan en la carta (es donde se muestra la info)
router.get('/productos', asyncHandler(async (req, res) => {
  const productos = await D.calcularProductos(await D.idsEnCarta());
  success(res, [...productos.values()].map(resumen));
}));

router.get('/productos/:id', asyncHandler(async (req, res) => {
  const p = (await D.calcularProductos([Number(req.params.id)])).get(Number(req.params.id));
  if (!p) return error(res, 'Producto no encontrado', 404);
  success(res, p);
}));

// PATCH /productos/:id/control { controlado } — guarda la huella de los
// valores controlados: si despues cambian, el control se vence solo.
// PATCH /productos/:id/control y /pp/:id/control { controlado } — guarda la
// huella de los valores controlados: si despues cambian, se vence solo.
// Solo lo controlado sale en la carta y en el catalogo de Personalizados.
const CONTROL = {
  productos: { tabla: 'productos', calcular: (id) => D.calcularProductos([id]) },
  pp: { tabla: 'pp_productos', calcular: (id) => D.calcularPedidosPersonalizados([id]) },
};
for (const [ruta, { tabla, calcular }] of Object.entries(CONTROL)) {
  router.patch(`/${ruta}/:id/control`, asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const p = (await calcular(id)).get(id);
    if (!p) return error(res, 'Producto no encontrado', 404);
    if (req.body.controlado) {
      if (!p.completa) return error(res, 'Faltan datos de algunos ingredientes: no se puede controlar todavía');
      await pool.query(`UPDATE ${tabla} SET nutri_controlado_at = NOW(), nutri_huella = ? WHERE id = ?`, [p.huella, id]);
    } else {
      await pool.query(`UPDATE ${tabla} SET nutri_controlado_at = NULL, nutri_huella = NULL WHERE id = ?`, [id]);
    }
    success(res, (await calcular(id)).get(id));
  }));
}

// ----------------------------------------------------- pedidos personalizados

// Solo los publicados (lo que se vende)
router.get('/pp', asyncHandler(async (req, res) => {
  success(res, [...(await D.calcularPedidosPersonalizados()).values()].map(resumen));
}));

router.get('/pp/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const p = (await D.calcularPedidosPersonalizados([id])).get(id);
  if (!p) return error(res, 'Producto no encontrado', 404);
  success(res, p);
}));

module.exports = router;
