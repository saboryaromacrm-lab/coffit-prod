const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarEtiqueta, normalizarLista, desdeTextoCarta, aTextoCarta } = require('./etiquetas');

test('normaliza las variantes reales de la Carta', () => {
  assert.equal(normalizarEtiqueta('SIN GLUTEN.'), 'SIN GLUTEN');
  assert.equal(normalizarEtiqueta('  red  en lactosa '), 'RED EN LACTOSA');
  assert.equal(normalizarEtiqueta('Sin azúcar'), 'SIN AZÚCAR');
  assert.equal(normalizarEtiqueta(''), '');
});

test('texto de la Carta <-> lista', () => {
  assert.deepEqual(desdeTextoCarta('SIN AZUCAR, SIN GLUTEN.'), ['SIN AZUCAR', 'SIN GLUTEN']);
  assert.deepEqual(desdeTextoCarta('SIN GLUTEN,  RED EN LACTOSA'), ['SIN GLUTEN', 'RED EN LACTOSA']);
  assert.deepEqual(desdeTextoCarta(null), []);
  assert.equal(aTextoCarta(['KETO', 'SIN GLUTEN']), 'KETO, SIN GLUTEN');
  assert.equal(aTextoCarta([]), null);
});

test('sin repetidos ni vacios', () => {
  assert.deepEqual(normalizarLista(['keto', 'KETO.', ' ', 'Low carb']), ['KETO', 'LOW CARB']);
  assert.deepEqual(normalizarLista('no es lista'), []);
});
