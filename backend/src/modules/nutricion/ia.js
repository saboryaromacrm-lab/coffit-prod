const Anthropic = require('@anthropic-ai/sdk');
const { NUTRIENTES } = require('./calculo');

// ============================================================================
// IA NUTRICIONAL (Claude). Sugiere, por ingrediente:
//   - cuantos gramos pesa 1 unidad de receta (entiende g / kg / ml / L /
//     unidad / docena y lo que de verdad se carga en las recetas),
//   - los valores cada 100 g,
//   - las lineas de receta con una cantidad que no cierra con la unidad.
// Lo que devuelve queda "sin revisar" hasta que alguien lo controla.
// Necesita ANTHROPIC_API_KEY en el entorno del servidor.
// ============================================================================

// Modelos que se pueden elegir en Configuracion. `fallback`: si el modelo
// rechaza un pedido, el servidor de Anthropic lo reintenta con otro (Haiku no
// lo admite).
const MODELOS = [
  { id: 'claude-haiku-5-5', nombre: 'Haiku 5.5', detalle: 'Rápido y económico', fallback: false },
  { id: 'claude-sonnet-5-5', nombre: 'Sonnet 5.5', detalle: 'Equilibrado', fallback: true },
  { id: 'claude-opus-5-5', nombre: 'Opus 5.5', detalle: 'El más preciso, más caro', fallback: true },
];
const MODELO_DEFAULT = 'claude-haiku-5-5';
const MAX_POR_PEDIDO = 5;
const MAX_USOS = 40; // lineas de receta por ingrediente que se le muestran

const SISTEMA = `Sos especialista en composición de alimentos y tecnología alimentaria en Argentina. Trabajás para una cafetería saludable (opciones keto, sin TACC, sin azúcar, alto en proteínas) que costea sus recetas en un sistema llamado CoffitCost.

Tu tarea: para cada ingrediente que te paso, devolvé su información nutricional cada 100 g y cuántos gramos pesa 1 unidad de receta.

CÓMO GUARDA LAS CANTIDADES COFFITCOST (leelo con atención, es lo más importante)
- Cada ingrediente tiene un precio de envase y un "contenido_envase". El costo de 1 unidad de receta es precio_envase / contenido_envase, y las cantidades de las recetas están en ESA unidad.
- La etiqueta "unidad" (g, kg, ml, L, u, doc) la cargó una persona y a veces está mal. Ejemplo real: "Banana", unidad kg, contenido_envase 1000 → el envase es 1 kg dividido en 1000 partes: 1 unidad de receta = 1 g, y las recetas usan 60, 80, 90 (gramos).
- Otro: "Granola", unidad kg, contenido_envase 1 → 1 unidad de receta = 1 kg = 1000 g; una receta debería usar 0,04 (40 g).
- Otro: "Huevos", unidad u, contenido_envase 30 → maple de 30: 1 unidad de receta = 1 huevo ≈ 50-60 g.
- "Torta red velvet", unidad u, contenido_envase 8 → torta comprada de 8 porciones: 1 unidad = 1 porción.
- Si 1 unidad de receta es una pieza entera con partes que no se comen (ananá, melón, mango, palta, coco: cáscara, corona, carozo), gramos_por_unidad son SOLO los gramos comestibles, que es lo que entra a la receta. Ej.: "Ananá", unidad u, contenido_envase 1 → 1 ananá de ~1,2 kg ≈ 600 g de pulpa.
- Para ml/L usá la densidad (agua 1, leche ≈ 1,03, aceite ≈ 0,92). Para "doc" pensá si la unidad de receta es la docena o la pieza según contenido_envase y los usos.
- Mirá precio, contenido, nombre (suele traer el tamaño: "X500", "x15kg") y sobre todo las cantidades de los usos para decidir. gramos_por_unidad son los gramos de UNA unidad de receta.

LÍNEAS SOSPECHOSAS
Con la unidad ya entendida, revisá cada uso. Reportá en lineas_sospechosas solo los casos claros en que la cantidad no puede ser correcta para esa receta (típicamente 1000 veces de más o de menos: 40 kg de granola en un bowl, 0,3 g de banana en un waffle). En "motivo" decí en una frase qué está mal y qué cantidad sería la correcta en la unidad del ingrediente. Si no hay casos claros, devolvé la lista vacía.

VALORES CADA 100 g
- Del ingrediente tal como entra a la receta (crudo si se cocina después). Si es un producto listo para consumir (alfajor, medialuna, bebida), del producto.
- Fuentes de referencia: Tabla de Composición de Alimentos de Argentina (ARGENFOODS), USDA FoodData Central y, para productos de marca, el rótulo nutricional que conozcas. Si no conocés la marca, usá un valor típico de la categoría y bajá la confianza.
- energia_kcal en kcal; sodio_mg en miligramos; el resto en gramos. azucares_g = azúcares totales; fibra_g = fibra alimentaria. grasas_trans_g es 0 salvo que el alimento tenga.
- confianza: alta (alimento básico con dato de tabla), media (valor típico, preparación o marca estimada), baja (producto poco conocido o ambiguo).
- nota: en castellano, 1 o 2 frases: cómo interpretaste la unidad ("1 unidad = 1 huevo de ~55 g") y de dónde salen los valores o qué supusiste.`;

const numero = { type: 'number' };
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ingredientes'],
  properties: {
    ingredientes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'gramos_por_unidad', ...NUTRIENTES, 'confianza', 'nota', 'lineas_sospechosas'],
        properties: {
          id: { type: 'integer' },
          gramos_por_unidad: numero,
          ...Object.fromEntries(NUTRIENTES.map((k) => [k, numero])),
          confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
          nota: { type: 'string' },
          lineas_sospechosas: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['tipo', 'linea_id', 'motivo'],
              properties: {
                tipo: { type: 'string', enum: ['producto', 'subreceta'] },
                linea_id: { type: 'integer' },
                motivo: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

class ErrorIA extends Error {}

let cliente = null;
function getCliente() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ErrorIA('Falta configurar ANTHROPIC_API_KEY en el servidor (variables del backend en Dokploy).');
  }
  cliente ??= new Anthropic({ timeout: 5 * 60 * 1000 });
  return cliente;
}

// Valores fuera de rango fisico = respuesta no confiable para ese ingrediente
function validar(s) {
  const nums = ['gramos_por_unidad', ...NUTRIENTES].map((k) => s[k]);
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) return 'devolvió un valor inválido';
  if (!(s.gramos_por_unidad > 0)) return 'no pudo determinar el peso de la unidad';
  if (s.energia_kcal > 950) return 'energía mayor a 950 kcal cada 100 g';
  if (s.proteinas_g + s.carbohidratos_g + s.grasas_g + s.fibra_g > 105) return 'los macronutrientes suman más de 100 g';
  if (s.azucares_g > s.carbohidratos_g + 0.5 || s.grasas_sat_g + s.grasas_trans_g > s.grasas_g + 0.5) return 'los valores no son coherentes entre sí';
  return null;
}

/**
 * ingredientes: [{ id, nombre, categoria, unidad, contenido_envase, precio_envase,
 *                  proveedor, notas, usos: [{ tipo, linea_id, receta, cantidad }] }]
 * modeloId: uno de MODELOS (si no, el default)
 * Devuelve { sugerencias: Map id -> sugerencia, errores: [{ id, motivo }] }
 */
async function sugerirIngredientes(ingredientes, modeloId) {
  const pedido = ingredientes.map((i) => ({ ...i, usos: i.usos.slice(0, MAX_USOS) }));
  const modelo = MODELOS.find((m) => m.id === modeloId) || MODELOS.find((m) => m.id === MODELO_DEFAULT);

  let resp;
  try {
    resp = await getCliente().beta.messages.create({
      model: modelo.id,
      max_tokens: 16000,
      ...(modelo.fallback && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
      output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
      system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Ingredientes:\n${JSON.stringify(pedido, null, 1)}` }],
    });
  } catch (e) {
    if (e instanceof ErrorIA) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ErrorIA('La clave ANTHROPIC_API_KEY no es válida.');
    if (e instanceof Anthropic.RateLimitError) throw new ErrorIA('La IA está saturada de pedidos. Probá de nuevo en un minuto.');
    if (e instanceof Anthropic.APIError) throw new ErrorIA(`La IA respondió con un error (${e.status ?? 'sin conexión'}). Probá de nuevo.`);
    throw e;
  }

  if (resp.stop_reason === 'refusal') throw new ErrorIA('La IA no quiso responder este pedido.');
  if (resp.stop_reason === 'max_tokens') throw new ErrorIA('La respuesta de la IA quedó cortada. Probá con menos ingredientes.');
  const texto = resp.content.find((b) => b.type === 'text')?.text;
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new ErrorIA('La IA devolvió una respuesta que no se pudo leer.');
  }

  const pedidos = new Map(pedido.map((i) => [i.id, i]));
  const sugerencias = new Map();
  const errores = [];
  for (const s of datos.ingredientes) {
    const ing = pedidos.get(s.id);
    if (!ing || sugerencias.has(s.id)) continue;
    const motivo = validar(s);
    if (motivo) { errores.push({ id: s.id, motivo: `La IA ${motivo}` }); continue; }
    // Solo lineas que existen, con la cantidad de la base (no la que repita la IA)
    const alertas = s.lineas_sospechosas.flatMap((a) => {
      const uso = ing.usos.find((u) => u.tipo === a.tipo && u.linea_id === a.linea_id);
      return uso ? [{ tipo: a.tipo, linea_id: a.linea_id, cantidad: uso.cantidad, motivo: a.motivo }] : [];
    });
    sugerencias.set(s.id, { ...s, alertas });
  }
  for (const id of pedidos.keys()) {
    if (!sugerencias.has(id) && !errores.some((e) => e.id === id)) errores.push({ id, motivo: 'La IA no lo devolvió' });
  }
  return { sugerencias, errores };
}

module.exports = { MODELOS, MODELO_DEFAULT, MAX_POR_PEDIDO, ErrorIA, sugerirIngredientes };
