const crypto = require('crypto');
const { error } = require('../utils/response');

// Exige el header X-API-Key igual a la variable de entorno `variable`.
// Cada integracion tiene su propia clave (si se filtra una, se cambia sola).
// Se comparan los hashes para que el tiempo de respuesta no delate cuantos
// caracteres coinciden.
module.exports = function requiereClave(variable) {
  return (req, res, next) => {
    const esperada = process.env[variable];
    if (!esperada) return error(res, 'Esta integracion no esta configurada', 503);
    const h = (s) => crypto.createHash('sha256').update(String(s || '')).digest();
    if (!crypto.timingSafeEqual(h(req.get('x-api-key')), h(esperada))) return error(res, 'Clave invalida', 401);
    next();
  };
};
