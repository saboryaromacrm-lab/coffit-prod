// ============================================================================
// IMAGENES DE PRODUCTO (carta)
//
// Las fotos se suben en crudo (celular: 3-8 MB) y se guardan optimizadas para
// tienda online: WebP, lado maximo 1200px, sin metadata EXIF.
// Resultado tipico de una foto de comida: 50-150 KB (10-50x mas liviano).
//
// Se guardan en disco (UPLOADS_DIR) y se sirven como estaticos desde el mismo
// backend, asi la URL que queda en carta_items.imagen es publica y absoluta,
// igual que las URLs viejas de Hostinger (que siguen funcionando intactas).
//
// OJO: UPLOADS_DIR tiene que ser un VOLUMEN PERSISTENTE en Dokploy. Si no, las
// fotos se borran en cada redeploy.
// ============================================================================
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

// Optimo para tienda online: entra comodo en cualquier card/detalle sin pesar.
const LADO_MAX = 1200;
const CALIDAD = 82;

// Lo que aceptamos recibir. El celular manda JPG; el resto es por comodidad.
const MIMES_VALIDOS = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/tiff',
]);

const MAX_BYTES_ENTRADA = 25 * 1024 * 1024; // 25 MB: una foto cruda entra de sobra

async function asegurarCarpeta() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

// "Café Latte (1).JPG" -> "cafe-latte-1"
function slug(nombre) {
  return String(nombre || 'foto')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // saca acentos
    .replace(/\.[^.]+$/, '')                            // saca la extension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'foto';
}

// Nombre unico y legible: no pisa nada aunque subas dos veces la misma foto.
function nombreArchivo(nombreOriginal) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${slug(nombreOriginal)}-${Date.now()}-${rand}.webp`;
}

// Comprime y redimensiona. `rotate()` sin argumentos aplica la orientacion EXIF
// (si no, las fotos verticales del celular quedan acostadas).
async function optimizar(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(LADO_MAX, LADO_MAX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: CALIDAD })
    .toBuffer({ resolveWithObject: true }); // { data, info: { width, height, size } }
}

// Optimiza y guarda. Devuelve los datos para responderle al front.
async function procesarYGuardar(buffer, nombreOriginal) {
  await asegurarCarpeta();
  const { data, info } = await optimizar(buffer);
  const nombre = nombreArchivo(nombreOriginal);
  await fs.writeFile(path.join(UPLOADS_DIR, nombre), data);
  return {
    nombre,
    bytes: data.length,
    bytes_original: buffer.length,
    ancho: info.width,
    alto: info.height,
  };
}

// Base publica del backend. Se puede fijar con PUBLIC_URL; si no, se deduce del
// request (necesita app.set('trust proxy') para que detras de Traefik de https).
function baseUrl(req) {
  const fijada = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (fijada) return fijada;
  return `${req.protocol}://${req.get('host')}`;
}

const urlPublica = (req, nombre) => `${baseUrl(req)}/uploads/${nombre}`;

// True si la URL apunta a una foto servida por nosotros (vs una URL externa).
// Se usa para saber cual podemos borrar del disco sin romper nada de afuera.
const esSubidaPropia = (url) => /\/uploads\/[^/]+$/.test(String(url || ''));

const nombreDesdeUrl = (url) => {
  const m = String(url || '').match(/\/uploads\/([^/?#]+)$/);
  return m ? m[1] : null;
};

// Borra una foto subida por nosotros. Silencioso a proposito: que falle un
// borrado nunca tiene que romper el guardado del item.
async function borrarSiEsPropia(url) {
  const nombre = esSubidaPropia(url) ? nombreDesdeUrl(url) : null;
  if (!nombre) return false;
  try {
    await fs.unlink(path.join(UPLOADS_DIR, nombre));
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  UPLOADS_DIR, LADO_MAX, CALIDAD, MIMES_VALIDOS, MAX_BYTES_ENTRADA,
  asegurarCarpeta, optimizar, procesarYGuardar,
  urlPublica, esSubidaPropia, nombreDesdeUrl, borrarSiEsPropia,
};
