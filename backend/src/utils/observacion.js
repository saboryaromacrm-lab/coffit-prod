const MAX_OBSERVACION = 255;

// Observacion libre de una linea de receta (producto o subreceta): el texto
// recortado, o null si vino vacia. No afecta costos.
const leerObservacion = (item) => String(item.observacion ?? '').trim().slice(0, MAX_OBSERVACION) || null;

module.exports = { leerObservacion };
