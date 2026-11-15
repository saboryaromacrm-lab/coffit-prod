const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../../config/db');
const { error } = require('../../utils/response');

// ============================================================================
// CLAUDE (compartido): cliente, modelo elegido en Configuracion y pedido con
// respuesta JSON validada por esquema. Lo usan la info nutricional y el
// asistente de Combos/Boxs. Necesita ANTHROPIC_API_KEY en el servidor.
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
const CLAVE_MODELO = 'ia_modelo'; // en la tabla configuracion

class ErrorIA extends Error {}

let cliente = null;
function getCliente() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ErrorIA('Falta configurar ANTHROPIC_API_KEY en el servidor (variables del backend en Dokploy).');
  }
  cliente ??= new Anthropic({ timeout: 5 * 60 * 1000 });
  return cliente;
}

async function modeloElegido() {
  const [[fila]] = await pool.query('SELECT valor FROM configuracion WHERE clave = ?', [CLAVE_MODELO]);
  return MODELOS.some((m) => m.id === fila?.valor) ? fila.valor : MODELO_DEFAULT;
}

/**
 * Pide a Claude una respuesta JSON que cumple `esquema` (structured outputs).
 * sistema: textos del system prompt; el primero (fijo) se cachea y los
 *          siguientes (que cambian) van aparte. Los vacios se omiten.
 * cortada: mensaje si la respuesta no entra en maxTokens.
 * Lanza ErrorIA con un mensaje para la persona si algo sale mal.
 */
async function pedirJSON({ modeloId, sistema, mensaje, esquema, cortada, maxTokens = 16000 }) {
  const modelo = MODELOS.find((m) => m.id === modeloId) || MODELOS.find((m) => m.id === MODELO_DEFAULT);
  let resp;
  try {
    resp = await getCliente().beta.messages.create({
      model: modelo.id,
      max_tokens: maxTokens,
      ...(modelo.fallback && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
      output_config: { effort: 'high', format: { type: 'json_schema', schema: esquema } },
      system: sistema.filter(Boolean).map((text, i) => ({
        type: 'text', text, ...(i === 0 && { cache_control: { type: 'ephemeral' } }),
      })),
      messages: [{ role: 'user', content: mensaje }],
    });
  } catch (e) {
    if (e instanceof ErrorIA) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ErrorIA('La clave ANTHROPIC_API_KEY no es válida.');
    if (e instanceof Anthropic.RateLimitError) throw new ErrorIA('La IA está saturada de pedidos. Probá de nuevo en un minuto.');
    if (e instanceof Anthropic.APIError) throw new ErrorIA(`La IA respondió con un error (${e.status ?? 'sin conexión'}). Probá de nuevo.`);
    throw e;
  }

  if (resp.stop_reason === 'refusal') throw new ErrorIA('La IA no quiso responder este pedido.');
  if (resp.stop_reason === 'max_tokens') throw new ErrorIA(cortada || 'La respuesta de la IA quedó cortada. Probá de nuevo.');
  try {
    return JSON.parse(resp.content.find((b) => b.type === 'text')?.text);
  } catch {
    throw new ErrorIA('La IA devolvió una respuesta que no se pudo leer.');
  }
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

module.exports = { MODELOS, MODELO_DEFAULT, CLAVE_MODELO, ErrorIA, modeloElegido, pedirJSON, conIA };
