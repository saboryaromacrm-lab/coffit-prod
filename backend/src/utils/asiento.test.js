// Como se asienta en produccion: validacion de lo que llega del editor. Correr: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { leerAsiento, leerCarga } = require('./asiento');

test('asiento: sin campos no se toca; vacio = la receta completa', () => {
  assert.equal(leerAsiento({ nombre: 'x' }), undefined);
  assert.deepEqual(leerAsiento({ asiento_unidad: '  ', asiento_rinde: null }), { unidad: null, rinde: null });
  assert.deepEqual(leerAsiento({ asiento_unidad: ' plancha ', asiento_rinde: '' }), { unidad: 'plancha', rinde: null });
  assert.deepEqual(leerAsiento({ asiento_unidad: 'bandeja', asiento_rinde: '24' }), { unidad: 'bandeja', rinde: 24 });
});

test('asiento: rinde invalido o sin nombre de unidad es error', () => {
  assert.ok(leerAsiento({ asiento_unidad: 'plancha', asiento_rinde: 0 }).error);
  assert.ok(leerAsiento({ asiento_unidad: 'plancha', asiento_rinde: 'abc' }).error);
  assert.ok(leerAsiento({ asiento_unidad: '', asiento_rinde: 2 }).error);
  assert.ok(leerAsiento({ asiento_unidad: 'x'.repeat(31), asiento_rinde: null }).error);
});

test('rinde de una carga: solo un numero mayor a 0', () => {
  assert.equal(leerCarga({ rinde: 3 }).rinde, 3);
  assert.equal(leerCarga({ rinde: '2.5' }).rinde, 2.5);
  for (const v of [null, undefined, '', 0, -1, 'x']) assert.equal(leerCarga({ rinde: v }).rinde, null);
});

test('forma de una carga: receta, base o la configurada; la base no rinde distinto', () => {
  assert.deepEqual(leerCarga({ forma: 'receta', rinde: 9 }), { forma: 'receta', rinde: 9 });
  assert.deepEqual(leerCarga({ forma: 'base', rinde: 3 }), { forma: 'base', rinde: null });
  for (const forma of [undefined, null, '', 'plancha']) assert.equal(leerCarga({ forma }).forma, null);
});
