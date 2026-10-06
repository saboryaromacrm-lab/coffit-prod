const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');
const requiereClave = require('../middleware/apiKey');
const { success, error } = require('../utils/response');
const { cascadeFromIngredient } = require('../utils/recalculate');
const { aplicarCostoIngrediente, normalizarNombre, convertirCosto, esUnidad } = require('../utils/costoSya');

// ============================================================================
// LISTA DE COSTOS QUE EMPUJA EL ERP DE SABOR Y AROMA
// POST /api/public/sya/costos   (header X-API-Key = SYA_API_KEY)
//
// El ERP manda costo por unidad ya calculado y el NOMBRE del ingrediente tal
// cual esta en CoffitCost (decision del usuario: iguala los nombres a mano).
// Por eso la coincidencia es exacta salvo mayusculas, tildes y espacios, y
// todo lo que no se pudo aplicar vuelve en la respuesta con el motivo: un
// nombre que no coincide nunca se pierde en silencio.
//
// Mismas reglas que el import de envios (utils/costoSya.js): desperdicio,
// Sabor y Aroma como proveedor 1, anti-retroceso por fecha y cascada a
// subrecetas y productos. Todo en una transaccion.
// ============================================================================

const MAX_RENGLONES = 2000;
const router = express.Router();
// Se monta antes del express.json global de la app.
router.use(express.json({ limit: '1mb' }));

router.post(
  '/costos',
  requiereClave('SYA_API_KEY'),
  asyncHandler(async (req, res) => {
    const { fecha, referencia, costos } = req.body || {};

    const f = new Date(fecha);
    if (!fecha || Number.isNaN(f.getTime())) return error(res, 'fecha requerida (ISO 8601)');
    // Fecha del dia en Argentina: es la que se guarda y la que compara el anti-retroceso.
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(f);
    if (!Array.isArray(costos) || costos.length === 0) return error(res, 'costos tiene que ser una lista con al menos un renglon');
    if (costos.length > MAX_RENGLONES) return error(res, `Maximo ${MAX_RENGLONES} renglones por envio`);
    const codigo = String(referencia || 'LISTA').trim().slice(0, 20) || 'LISTA';

    const [ings] = await pool.query(
      `SELECT i.id, i.nombre, i.costo_unitario, COALESCE(u.abreviatura, 'g') AS unidad
       FROM ingredientes i LEFT JOIN unidades u ON u.id = i.unidad_id
       WHERE i.activo = 1`
    );
    const porNombre = new Map();
    for (const i of ings) {
      const k = normalizarNombre(i.nombre);
      if (!porNombre.has(k)) porNombre.set(k, []);
      porNombre.get(k).push(i);
    }

    const r = {
      fecha: dia,
      recibidos: costos.length,
      actualizados: [],
      sin_cambios: [],
      mas_viejos: [],
      no_encontrados: [],
      ambiguos: [],
      unidad_incompatible: [],
      invalidos: [],
    };

    // 1) Validar y resolver cada renglon (sin tocar la base)
    const aAplicar = [];
    const vistos = new Set();
    costos.forEach((c, indice) => {
      const nombre = typeof c?.nombre === 'string' ? c.nombre.trim() : '';
      const costo = Number(c?.costo);
      if (!nombre) return r.invalidos.push({ indice, motivo: 'Falta nombre' });
      if (!Number.isFinite(costo) || costo <= 0) return r.invalidos.push({ indice, nombre, motivo: 'costo tiene que ser un numero mayor a 0' });
      if (!esUnidad(c.unidad)) return r.invalidos.push({ indice, nombre, motivo: 'unidad tiene que ser g, kg, ml, l, u o doc' });

      const k = normalizarNombre(nombre);
      if (vistos.has(k)) return r.invalidos.push({ indice, nombre, motivo: 'Nombre repetido en el envio' });
      vistos.add(k);

      const encontrados = porNombre.get(k) || [];
      if (encontrados.length === 0) return r.no_encontrados.push(nombre);
      if (encontrados.length > 1) return r.ambiguos.push({ nombre, ingredientes: encontrados.map((i) => i.id) });
      const ing = encontrados[0];

      const convertido = convertirCosto(costo, c.unidad, ing.unidad);
      if (convertido == null) {
        return r.unidad_incompatible.push({ nombre, unidad_enviada: c.unidad, unidad_ingrediente: ing.unidad });
      }
      // costo_unitario se guarda con 4 decimales: igual a eso es "sin cambios"
      const nuevo = Math.round(convertido * 10000) / 10000;
      if (Number(ing.costo_unitario) === nuevo) return r.sin_cambios.push(ing.nombre);
      aAplicar.push({ ing, nuevo });
    });

    // 2) Aplicar y recalcular en cascada, todo o nada
    if (aAplicar.length) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const tocados = [];
        for (const { ing, nuevo } of aAplicar) {
          if (await aplicarCostoIngrediente(conn, ing.id, nuevo, dia, codigo)) {
            tocados.push(ing.id);
            r.actualizados.push({
              ingrediente_id: ing.id,
              nombre: ing.nombre,
              unidad: ing.unidad,
              costo_anterior: Number(ing.costo_unitario),
              costo_nuevo: nuevo,
            });
          } else {
            // Anti-retroceso: ya tiene un costo de Sabor y Aroma con fecha posterior
            r.mas_viejos.push(ing.nombre);
          }
        }
        for (const id of tocados) await cascadeFromIngredient(conn, id);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }

    success(res, r);
  })
);

module.exports = router;
