const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarNombre, convertirCosto, esUnidad } = require('./costoSya');

test('nombres: ignora mayusculas, tildes y espacios, pero no tamanos', () => {
  assert.equal(normalizarNombre('  Harina  de ALMENDRAS '), 'harina de almendras');
  assert.equal(normalizarNombre('Azúcar mascabo'), normalizarNombre('azucar mascabo'));
  assert.notEqual(normalizarNombre('Franui pote x150G'), normalizarNombre('Franui pote x300G'));
});

test('unidades: convierte dentro de la misma familia', () => {
  assert.equal(convertirCosto(12000, 'kg', 'g'), 12);
  assert.equal(convertirCosto(12, 'g', 'kg'), 12000);
  assert.equal(convertirCosto(3000, 'L', 'ml'), 3);
  assert.equal(convertirCosto(2400, 'doc', 'u'), 200);
  assert.equal(convertirCosto(15, 'g', 'g'), 15);
});

test('unidades: familias distintas o desconocidas no se convierten', () => {
  assert.equal(convertirCosto(100, 'kg', 'u'), null);
  assert.equal(convertirCosto(100, 'ml', 'g'), null);
  assert.equal(convertirCosto(100, 'caja', 'g'), null);
  assert.equal(esUnidad('KG'), true);
  assert.equal(esUnidad('caja'), false);
});
