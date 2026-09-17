const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/response');

// ============================================================================
// COLABORADORES
// Administra colaboradores y sus secciones habilitadas (link de acceso propio).
// El acceso del colaborador es por access_key en la URL (/colaborador/:key).
// ============================================================================

// Secciones validas (deben coincidir con el frontend). Evita guardar basura.
const SECCIONES_VALIDAS = [
  'ingredientes', 'envios-saboryaroma', 'envios-coffit',
  'produccion', 'plan-hoy', 'perdidas', 'compras', 'carta',
  'sabor-y-aroma',
];

function genKey() {
  return crypto.randomBytes(9).toString('hex'); // 18 chars hex, no adivinable
}

function parseSecciones(raw) {
  if (Array.isArray(raw)) return raw.filter((s) => SECCIONES_VALIDAS.includes(s));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => SECCIONES_VALIDAS.includes(s)) : [];
  } catch {
    return [];
  }
}

// GET / - lista de colaboradores (para Configuracion)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM colaboradores WHERE activo = 1 ORDER BY nombre'
    );
    success(res, rows.map((r) => ({ ...r, secciones: parseSecciones(r.secciones) })));
  })
);

// GET /acceso/:key - datos del colaborador por su link (para el area colaborador)
router.get(
  '/acceso/:key',
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    const [rows] = await pool.query(
      'SELECT id, nombre, secciones FROM colaboradores WHERE access_key = ? AND activo = 1',
      [key]
    );
    if (rows.length === 0) return error(res, 'Acceso no valido', 404);
    success(res, { nombre: rows[0].nombre, secciones: parseSecciones(rows[0].secciones) });
  })
);

// POST / - crear colaborador (genera access_key)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nombre, secciones } = req.body;
    if (!nombre || !String(nombre).trim()) return error(res, 'Nombre es requerido');

    const secciasNorm = parseSecciones(secciones);
    let key = genKey();
    // Reintenta si (muy improbable) colisiona
    for (let i = 0; i < 3; i++) {
      const [dup] = await pool.query('SELECT id FROM colaboradores WHERE access_key = ?', [key]);
      if (dup.length === 0) break;
      key = genKey();
    }

    const [result] = await pool.query(
      'INSERT INTO colaboradores (nombre, access_key, secciones) VALUES (?, ?, ?)',
      [String(nombre).trim(), key, JSON.stringify(secciasNorm)]
    );

    const [row] = await pool.query('SELECT * FROM colaboradores WHERE id = ?', [result.insertId]);
    success(res, { ...row[0], secciones: parseSecciones(row[0].secciones) }, 201);
  })
);

// PUT /:id - editar nombre / secciones / activo
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { nombre, secciones, activo } = req.body;
    if (!nombre || !String(nombre).trim()) return error(res, 'Nombre es requerido');

    const [result] = await pool.query(
      'UPDATE colaboradores SET nombre = ?, secciones = ?, activo = ? WHERE id = ?',
      [String(nombre).trim(), JSON.stringify(parseSecciones(secciones)), activo === 0 ? 0 : 1, id]
    );
    if (result.affectedRows === 0) return error(res, 'Colaborador no encontrado', 404);

    const [row] = await pool.query('SELECT * FROM colaboradores WHERE id = ?', [id]);
    success(res, { ...row[0], secciones: parseSecciones(row[0].secciones) });
  })
);

// POST /:id/regenerar-key - genera un nuevo link (invalida el anterior)
router.post(
  '/:id/regenerar-key',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const key = genKey();
    const [result] = await pool.query(
      'UPDATE colaboradores SET access_key = ? WHERE id = ?',
      [key, id]
    );
    if (result.affectedRows === 0) return error(res, 'Colaborador no encontrado', 404);
    success(res, { id: Number(id), access_key: key });
  })
);

// DELETE /:id - soft delete (revoca el acceso)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE colaboradores SET activo = 0 WHERE id = ? AND activo = 1',
      [id]
    );
    if (result.affectedRows === 0) return error(res, 'Colaborador no encontrado', 404);
    success(res, { message: 'Colaborador eliminado' });
  })
);

module.exports = router;
