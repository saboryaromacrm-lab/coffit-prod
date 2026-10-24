// Estado y food cost de las filas de la pestana Recetas. Correr: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluar } = require('./recetas');

const linea = (cantidad, costoUnitario, porKg = false) => ({ cantidad, costo_unitario: costoUnitario, por_kg: porKg });

test('sin receta = falta', () => {
  assert.deepEqual(evaluar([], 12000, 'fijo', 0.7), { estado: 'falta', costo: { fijo: 0, por_kg: 0, incompleto: false }, food_cost: null, aviso: null });
});

test('harina de 700 g con masa: food cost contra el precio fijo', () => {
  // 700 g de masa a $9.52/g = $6664 sobre $12000
  const r = evaluar([linea(700, 9.52)], 12000, 'fijo', 0.7);
  assert.equal(r.estado, 'ok');
  assert.equal(r.costo.fijo, 6664);
  assert.equal(r.food_cost, 55.5);
});

test('version de torta por kg: food cost contra el precio por kg', () => {
  // 1000 g/kg a $10/g = $10000/kg sobre $32000/kg
  const r = evaluar([linea(1000, 10, true)], 32000, 'por_kg', null);
  assert.equal(r.estado, 'ok');
  assert.equal(r.costo.por_kg, 10000);
  assert.equal(r.food_cost, 31.3);
});

test('ingrediente borrado o costo 0 = incompleta', () => {
  assert.equal(evaluar([linea(100, null)], 3000, 'fijo', null).estado, 'incompleta');
  assert.equal(evaluar([linea(100, 0)], 3000, 'fijo', null).estado, 'incompleta');
});

test('linea x kg en un producto sin peso = incompleta con aviso (caso Chipitas)', () => {
  const r = evaluar([linea(1000, 3.398, true)], 13500, 'fijo', null);
  assert.equal(r.estado, 'incompleta');
  assert.match(r.aviso, /x kg/);
  assert.equal(r.food_cost, null);
});
