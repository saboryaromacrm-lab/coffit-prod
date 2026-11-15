const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { success, error } = require('../../utils/response');
const { modeloElegido, conIA } = require('../ia/claude');
const { contextoCombos } = require('./datos');
const { CATEGORIAS, MAX_PROPUESTAS, sugerirCombos } = require('./ia');

// ============================================================================
// ASISTENTE DE COMBOS/BOXS — /api/combos-ia
// POST /sugerir { objetivo?, categoria?, cantidad? } -> { propuestas, descartadas }
// Solo propone: lo que se elige se revisa y se guarda desde el editor.
// ============================================================================

router.post('/sugerir', asyncHandler(async (req, res) => {
  const cantidad = Math.min(MAX_PROPUESTAS, Math.max(1, parseInt(req.body.cantidad, 10) || 3));
  const categoria = CATEGORIAS.includes(req.body.categoria) ? req.body.categoria : null;
  const objetivo = String(req.body.objetivo || '').trim().slice(0, 600);

  const contexto = await contextoCombos();
  if (!contexto.carta.some((p) => !p.sin_costo)) {
    return error(res, 'No hay productos en la carta con costo cargado para armar combos');
  }
  const r = await conIA(res, async () => sugerirCombos(
    { cantidad, categoria: categoria || 'cualquiera', objetivo: objetivo || 'sin pedido puntual' },
    contexto,
    await modeloElegido(),
  ));
  if (r) success(res, r);
}));

module.exports = router;
