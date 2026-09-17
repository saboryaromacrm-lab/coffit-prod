// ============================================================================
// SIMILITUD DE NOMBRES (para sugerir mapeos automaticos)
// Tolerante a tildes, typos y sufijos de tamaño. Lo usan:
//   - la Carta (carta item -> producto)
//   - Sabor y Aroma (articulo del CRM -> ingrediente)
// Una sola implementacion para que el comportamiento sea identico en toda la app.
// ============================================================================

// Normaliza un nombre para comparar/sugerir mapeos:
// minusculas, sin tildes, sin sufijos de tamaño (X500, X100G, X3Un...),
// sin "chico/grande/simple", sin puntuacion.
function normaliza(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\bx\s*\d+\s*(grs|gr|gs|g|cc|ml|lt|l|kg|un|u)?\b/gi, ' ')
    .replace(/\b(chico|chica|grande|simple|frio|caliente|caja|box)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Distancia de Levenshtein (para tolerar typos: "carrok" vs "carrot").
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

// Similitud 0..1 basada en Levenshtein normalizado.
function similitud(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

// Puntua que tan bien matchea un nombre candidato con un target normalizado.
// 100 = exacto; tolera tildes (ya normalizadas) y typos pequeños.
function scoreNombre(target, targetTokens, nombreCandidato) {
  const n = normaliza(nombreCandidato);
  if (!n) return 0;
  if (n === target) return 100;

  // Similitud por caracteres (typos)
  let score = Math.round(similitud(target, n) * 95);

  // Prefijo
  if (n.startsWith(target) || target.startsWith(n)) score = Math.max(score, 82);
  // Contenido
  if (n.includes(target) || target.includes(n)) score = Math.max(score, 75);

  // Solapamiento de tokens (Jaccard)
  const tokens = new Set(n.split(' ').filter(Boolean));
  const inter = [...targetTokens].filter((t) => tokens.has(t)).length;
  const union = new Set([...targetTokens, ...tokens]).size || 1;
  score = Math.max(score, Math.round((inter / union) * 85));

  return Math.min(100, score);
}

// Rankea una lista de candidatos {..., nombre} contra un nombre objetivo.
// Devuelve los candidatos con score > 0, ordenados de mejor a peor.
function rankearPorNombre(nombreObjetivo, candidatos, mapear) {
  const target = normaliza(nombreObjetivo);
  const targetTokens = new Set(target.split(' ').filter(Boolean));
  return candidatos
    .map((c) => ({ ...mapear(c), score: scoreNombre(target, targetTokens, c.nombre) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

module.exports = { normaliza, scoreNombre, rankearPorNombre };
