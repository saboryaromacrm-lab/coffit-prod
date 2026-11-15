// Asistente de combos: lo que devuelve la IA se limpia antes de mostrarlo. Correr: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizar } = require('./ia');

const porId = new Map([
  [1, { producto_id: 1, nombre: 'Americano' }],
  [2, { producto_id: 2, nombre: 'Chai' }],
  [3, { producto_id: 3, nombre: 'Cookie chips' }],
  [4, { producto_id: 4, nombre: 'Agua', sin_costo: true }],
]);

test('combo: solo productos de la carta con costo, cantidades y recargos validos', () => {
  const p = normalizar({
    nombre: '  Merienda  ', categoria_carta: 'Combos', precio: 6499.6, descripcion: 'x', por_que: 'y',
    productos: [{ producto_id: 3, cantidad: 1 }, { producto_id: 3, cantidad: 1 }, { producto_id: 99, cantidad: 1 }, { producto_id: 4, cantidad: 1 }],
    pasos: [
      { nombre: 'Infusión', opciones: [{ producto_id: 1, extra: 0 }, { producto_id: 2, extra: 499.7 }, { producto_id: 2, extra: 0 }, { producto_id: 4, extra: 0 }] },
      { nombre: 'Vacío', opciones: [{ producto_id: 99, extra: 0 }] },
    ],
  }, porId);
  assert.equal(p.nombre, 'Merienda');
  assert.equal(p.tipo, 'precio_especial');
  assert.equal(p.valor, 6500);
  assert.deepEqual(p.productos, [{ id: 3, nombre: 'Cookie chips', cantidad: 2, rol: 'pago', descuento_pct: 100 }]);
  assert.deepEqual(p.pasos, [{ nombre: 'Infusión', opciones: [{ producto_id: 1, extra: 0 }, { producto_id: 2, extra: 500 }] }]);
});

test('combo: sin nada usable o sin precio se descarta', () => {
  const base = { nombre: 'X', categoria_carta: 'Boxs', descripcion: '', por_que: '', pasos: [] };
  assert.equal(normalizar({ ...base, precio: 5000, productos: [{ producto_id: 4, cantidad: 2 }] }, porId), null);
  assert.equal(normalizar({ ...base, precio: 0, productos: [{ producto_id: 1, cantidad: 1 }] }, porId), null);
});
