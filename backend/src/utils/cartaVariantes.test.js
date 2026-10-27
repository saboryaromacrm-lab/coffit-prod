// Variantes de carta: el tamaño fija el precio y el resto suma. Correr: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('./cartaVariantes');

const json = (v) => JSON.stringify(v);

test('eleccion con extra: legacy texto, negativo y solo_tamanos sin repetidos', () => {
  assert.deepEqual(V.parseTemperaturas('Frío, Caliente'), [
    { nombre: 'Frío', extra: 0, solo_tamanos: [] },
    { nombre: 'Caliente', extra: 0, solo_tamanos: [] },
  ]);
  assert.deepEqual(
    V.parseTemperaturas(json([{ nombre: 'Frío', extra: '-500', solo_tamanos: ['Estándar', 'Estándar', ' '] }])),
    [{ nombre: 'Frío', extra: -500, solo_tamanos: ['Estándar'] }]
  );
  assert.deepEqual(V.parseSabores(json([{ nombre: 'Pistacho', extra: 500, fecha_nuevo: '2026-10-01' }])), [
    { nombre: 'Pistacho', extra: 500, solo_tamanos: [], fecha_nuevo: '2026-10-01' },
  ]);
});

test('item viejo con solo frio_caliente=1: Frío y Caliente sin cargo', () => {
  assert.deepEqual(V.temperaturasEfectivas({ frio_caliente: 1, temperaturas: null }), V.TEMPERATURAS_DEFAULT);
});

test('menu: precio = base + extra y solo_tamanos limpio de tamaños borrados', () => {
  const r = V.resolverParaMenu({
    tamanos: json([{ nombre: 'Estándar', precio: 5500 }, { nombre: 'Grande', precio: 6000 }]),
    temperaturas: json([
      { nombre: 'Frío', extra: 0, solo_tamanos: ['Estándar', 'Mediano'] },
      { nombre: 'Caliente', extra: 1000 },
    ]),
    grupos_opciones: json([{ nombre: 'Leche', opciones: [{ nombre: 'Almendras', extra: 700 }] }]),
  }, 6000, 45, new Date());

  assert.deepEqual(r.temperaturas, [
    { nombre: 'Frío', precio: 6000, precio_extra: 0, es_base: true, solo_tamanos: ['Estándar'] },
    { nombre: 'Caliente', precio: 7000, precio_extra: 1000, es_base: false, solo_tamanos: [] },
  ]);
  assert.equal(r.grupos_opciones[0].opciones[0].precio_extra, 700);
  assert.deepEqual(r.tamanos.map((t) => t.precio), [5500, 6000]);
});
