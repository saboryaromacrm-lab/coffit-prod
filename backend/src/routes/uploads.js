const router = require('express').Router();
const multer = require('multer');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');
const IMG = require('../utils/imagenes');

// ============================================================================
// SUBIDA DE IMAGENES
// Recibe la foto en crudo, la optimiza (WebP 1200px) y devuelve la URL publica
// lista para pegar en carta_items.imagen.
// ============================================================================

// En memoria: la foto se procesa y se escribe ya optimizada, nunca se guarda el
// original pesado en disco.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMG.MAX_BYTES_ENTRADA, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!IMG.MIMES_VALIDOS.has(file.mimetype)) {
      return cb(new Error(`Formato no soportado (${file.mimetype}). Usá JPG, PNG o WebP.`));
    }
    cb(null, true);
  },
});

// Multer tira sus propios errores (tamaño, formato) fuera del flujo de
// asyncHandler, asi que los traducimos a un 400 con mensaje entendible.
const subirUno = (req, res, next) =>
  upload.single('imagen')(req, res, (err) => {
    if (!err) return next();
    const mb = Math.round(IMG.MAX_BYTES_ENTRADA / 1024 / 1024);
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? `La imagen supera el limite de ${mb} MB`
      : err.message;
    return error(res, msg, 400);
  });

// POST /api/uploads/imagen  (multipart/form-data, campo: imagen)
router.post(
  '/imagen',
  subirUno,
  asyncHandler(async (req, res) => {
    if (!req.file) return error(res, 'No llego ninguna imagen');

    let datos;
    try {
      datos = await IMG.procesarYGuardar(req.file.buffer, req.file.originalname);
    } catch {
      // sharp falla si el archivo no es una imagen real (ej: un HEIC renombrado)
      return error(res, 'No se pudo procesar la imagen. Verificá que sea un JPG, PNG o WebP valido.');
    }

    success(res, { url: IMG.urlPublica(req, datos.nombre), ...datos }, 201);
  })
);

module.exports = router;
