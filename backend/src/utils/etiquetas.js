// ============================================================================
// ETIQUETAS de producto ("SIN GLUTEN", "KETO"...).
// La Carta las guarda como texto separado por coma (carta_items.etiqueta) y
// Pedidos personalizados como lista JSON. Esta es la UNICA normalizacion, para
// que "Sin gluten", "SIN GLUTEN." y "SIN  GLUTEN" cuenten como la misma.
// ============================================================================

const MAX_ETIQUETAS = 20;
const MAX_LARGO = 40;

// Mayusculas, espacios simples, sin puntuacion al final.
function normalizarEtiqueta(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '')
    .trim()
    .toLocaleUpperCase('es')
    .slice(0, MAX_LARGO);
}

// Lista limpia y sin repetidos (respeta el orden en que vinieron).
function normalizarLista(lista) {
  const vistas = new Set();
  const salida = [];
  for (const e of Array.isArray(lista) ? lista : []) {
    const n = normalizarEtiqueta(e);
    if (n && !vistas.has(n)) {
      vistas.add(n);
      salida.push(n);
    }
  }
  return salida.slice(0, MAX_ETIQUETAS);
}

// Texto de la Carta ("SIN AZUCAR, SIN GLUTEN.") -> ['SIN AZUCAR', 'SIN GLUTEN']
const desdeTextoCarta = (texto) => normalizarLista(String(texto || '').split(','));

// Lista -> texto de la Carta (null si no hay ninguna)
const aTextoCarta = (lista) => (lista.length ? lista.join(', ') : null);

module.exports = { normalizarEtiqueta, normalizarLista, desdeTextoCarta, aTextoCarta, MAX_ETIQUETAS };
