const { pedirJSON } = require('../ia/claude');

// ============================================================================
// ASISTENTE DE COMBOS/BOXS (Claude). Con la carta real (precios, costos y
// rentabilidad por canal) propone combos, promos y boxs de precio especial,
// con productos fijos y pasos a elegir. No guarda nada: la persona revisa la
// propuesta en el editor (que recalcula todo con la formula de siempre).
// ============================================================================

const CATEGORIAS = ['Combo', 'Promo', 'Boxs'];
const MAX_PROPUESTAS = 5;
const MAX_CANTIDAD = 12;

const SISTEMA = `Sos especialista en ingeniería de menú y en armar combos, promos y boxs rentables para cafeterías. Trabajás para una cafetería saludable de Argentina (opciones keto, sin TACC, sin azúcar, alto en proteínas) que costea todo en un sistema llamado CoffitCost.

Tu tarea: proponer combos, promos y boxs nuevos usando SOLO productos de su carta, que se vendan bien y dejen buen margen.

QUÉ ES CADA COSA
- Combo: productos que se consumen juntos en un momento del día (desayuno, merienda, almuerzo): una bebida con algo dulce o salado. Suele tener pasos a elegir.
- Promo: un empujón de venta puntual (ej. dos unidades de algo a precio especial, o un producto estrella con otro que rota poco).
- Box: caja para regalar o compartir (varias unidades, surtido de dulces, para llevar). El empaque se suma después como costo manual: dejá margen para eso y mencionalo.

CÓMO SE ARMA (estructura de la respuesta)
- productos: lo que lleva SIEMPRE, con su cantidad.
- pasos: lo que elige el cliente ("Infusión" → Té verde / Chai / Americano). Cada opción es un producto de la carta, con extra = recargo en pesos (0 = sin cargo). Usá pasos cuando dar a elegir suma valor (bebidas, sabores). Las opciones de un paso tienen que ser intercambiables (misma categoría y momento de consumo) y de costo parecido; a la opción premium ponele recargo. "2 cookies a elección" = dos pasos ("Cookie 1", "Cookie 2") con las mismas opciones. Un combo puede no tener productos fijos si todo se elige.
- precio: precio cerrado en pesos, redondo (terminado en 00; mejor en 500 o 000).
- Usá producto_id exactamente como viene en la carta. No inventes productos.

CÓMO SE CALCULA LA RENTABILIDAD (es lo que va a ver la persona)
- costo = suma de costo × cantidad de los productos fijos + el costo de la opción MÁS CARA de cada paso (peor caso).
- precio cobrado = precio + el recargo de esa opción más cara.
- precio de lista = suma de los precios de carta de lo que incluye (con esa opción más cara).
- food cost = costo / precio cobrado. Ganancia de un canal = precio cobrado − costo − comisiones del canal (porcentajes sobre el precio, en "comisiones").
Objetivos: food cost ≤ 35 % (ideal 25-32 %), ganancia en tarjeta ≥ 50 % del precio cobrado, y un descuento frente al precio de lista de entre 8 % y 20 % (en un box puede ser 0-10 %: se paga la presentación). Si no se pueden cumplir todos, priorizá el margen y decilo. Hacé las cuentas antes de fijar el precio.

CRITERIOS
- Combiná productos de food cost bajo con productos que traccionan (de entrada, conocidos): así se sube el ticket sin regalar margen.
- Que tenga sentido junto (momento del día, dulce/salado, frío/caliente) y respetá los perfiles: keto con keto, sin TACC con sin TACC, cuando el nombre o la categoría lo indiquen.
- No uses productos con "sin_costo": no se sabe su margen.
- No repitas promos que ya existen ni hagas variaciones mínimas de ellas.
- Propuestas distintas entre sí (momento, público, ticket).
- Si la persona pide algo puntual (objetivo), respetalo por encima de estos criterios.

TEXTOS (castellano rioplatense)
- nombre: corto y vendedor, máximo 40 caracteres.
- descripcion: una frase para la carta: qué incluye y qué se elige.
- por_que: 2 o 3 frases para la persona: para quién y en qué momento, por qué conviene (margen, ticket, qué productos mueve) y los números clave aproximados (food cost y descuento).`;

const entero = { type: 'integer' };
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['propuestas'],
  properties: {
    propuestas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'categoria_carta', 'precio', 'productos', 'pasos', 'descripcion', 'por_que'],
        properties: {
          nombre: { type: 'string' },
          categoria_carta: { type: 'string', enum: CATEGORIAS },
          precio: { type: 'number' },
          productos: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['producto_id', 'cantidad'],
              properties: { producto_id: entero, cantidad: entero },
            },
          },
          pasos: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['nombre', 'opciones'],
              properties: {
                nombre: { type: 'string' },
                opciones: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['producto_id', 'extra'],
                    properties: { producto_id: entero, extra: { type: 'number' } },
                  },
                },
              },
            },
          },
          descripcion: { type: 'string' },
          por_que: { type: 'string' },
        },
      },
    },
  },
};

const texto = (v, max) => String(v || '').trim().slice(0, max);

// Deja solo lo que se puede usar: productos de la carta (con costo), cantidades
// y recargos validos, pasos con opciones. Devuelve null si no queda un combo.
// Forma de salida = la de una promo nueva (lo que precarga el editor).
function normalizar(p, porId) {
  const valido = (id) => porId.has(id) && !porId.get(id).sin_costo;
  const cantidades = new Map();
  for (const it of p.productos) {
    if (!valido(it.producto_id)) continue;
    const cant = Math.min(MAX_CANTIDAD, Math.max(1, Math.round(it.cantidad) || 1));
    cantidades.set(it.producto_id, Math.min(MAX_CANTIDAD, (cantidades.get(it.producto_id) || 0) + cant));
  }
  const pasos = p.pasos
    .map((paso) => {
      const vistos = new Set();
      return {
        nombre: texto(paso.nombre, 60),
        opciones: paso.opciones
          .filter((o) => valido(o.producto_id) && !vistos.has(o.producto_id) && vistos.add(o.producto_id))
          .map((o) => ({ producto_id: o.producto_id, extra: Math.max(0, Math.round(Number(o.extra) || 0)) })),
      };
    })
    .filter((paso) => paso.nombre && paso.opciones.length > 0);
  const precio = Math.round(Number(p.precio) || 0);
  if ((cantidades.size === 0 && pasos.length === 0) || precio <= 0) return null;

  return {
    nombre: texto(p.nombre, 80),
    categoria_carta: CATEGORIAS.includes(p.categoria_carta) ? p.categoria_carta : 'Combo',
    tipo: 'precio_especial',
    valor: precio,
    descripcion: texto(p.descripcion, 300),
    por_que: texto(p.por_que, 800),
    productos: [...cantidades].map(([id, cantidad]) => ({
      id, nombre: porId.get(id).nombre, cantidad, rol: 'pago', descuento_pct: 100,
    })),
    pasos,
  };
}

/**
 * pedido: { cantidad, categoria (o null = cualquiera), objetivo (texto libre) }
 * contexto: datos.contextoCombos()
 * Devuelve { propuestas, descartadas } (descartadas = las que no se podian usar).
 */
async function sugerirCombos(pedido, contexto, modeloId) {
  const datos = await pedirJSON({
    modeloId,
    sistema: [SISTEMA],
    mensaje: JSON.stringify({ pedido, ...contexto }, null, 1),
    esquema: ESQUEMA,
    cortada: 'La respuesta de la IA quedó cortada. Probá pidiendo menos propuestas.',
  });
  const porId = new Map(contexto.carta.map((p) => [p.producto_id, p]));
  const propuestas = datos.propuestas.slice(0, pedido.cantidad).map((p) => normalizar(p, porId)).filter(Boolean);
  return { propuestas, descartadas: Math.min(datos.propuestas.length, pedido.cantidad) - propuestas.length };
}

module.exports = { CATEGORIAS, MAX_PROPUESTAS, sugerirCombos, normalizar };
