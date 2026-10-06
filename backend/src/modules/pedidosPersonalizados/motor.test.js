// Pruebas del motor con los productos reales de la tienda (precios de la app
// de pedidos personalizados). Correr: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { cotizar, estadoCosteo } = require('./motor');

const op = (id, nombre, extra = {}) => ({
  id, nombre, precio: 0, precio_modo: 'fijo', peso_kg: null, depende_de: null, receta: [], ...extra,
});

// Budin: harina obligatoria (define el precio), relleno obligatorio,
// proteina opcional y hasta 3 toppings.
const budin = {
  id: 23, nombre: 'Budin', activo: true, precio_base: 0,
  receta: [{ cc_producto_id: 900, cantidad: 1, por_kg: false }], // packaging
  pasos: [
    { id: 1, nombre: 'Harina', min_sel: 1, max_sel: 1, opciones: [
      op(12, 'Harina integral', { precio: 8500, peso_kg: 0.9, receta: [{ ingrediente_id: 1, cantidad: 500, por_kg: false }] }),
      op(21, 'Harina Keto (350 g)', { precio: 6000, peso_kg: 0.35 }),
    ] },
    { id: 2, nombre: 'Relleno', min_sel: 1, max_sel: 1, opciones: [
      op(9, 'Frutos rojos', { precio: 3000 }),
      op(12001, 'Sin relleno'),
    ] },
    { id: 3, nombre: 'Proteina', min_sel: 0, max_sel: 1, opciones: [op(30, 'Proteina en polvo', { precio: 1000 })] },
    { id: 4, nombre: 'Toppings', min_sel: 0, max_sel: 3, opciones: [
      op(8, 'Chips de choco', { precio: 1000 }),
      op(11, 'Frutos rojos congelados', { precio: 1500 }),
      op(13, 'Mix de semillas', { precio: 1000 }),
      op(15, 'Nuez pecan', { precio: 3000, receta: [{ nombre_manual: 'Nuez', costo_manual: 800, cantidad: 1, por_kg: false }] }),
    ] },
  ],
};

// Tortas: version (precio por kg) -> tamano (peso) -> toppings propios de
// algunas versiones.
const tortas = {
  id: 42, nombre: 'Tortas', activo: true, precio_base: 0, receta: [],
  pasos: [
    { id: 10, nombre: 'Version', min_sel: 1, max_sel: 1, opciones: [
      op(4, 'Carrot cake', { precio: 32000, precio_modo: 'por_kg', receta: [{ subreceta_id: 5, cantidad: 1000, por_kg: true }] }),
      op(8000, 'Bruce', { precio: 32000, precio_modo: 'por_kg' }),
      op(10000, 'Brownie', { precio: 35000, precio_modo: 'por_kg' }),
    ] },
    { id: 11, nombre: 'Tamano', min_sel: 1, max_sel: 1, opciones: [
      op(101, 'Unico tamano', { peso_kg: 1.8, depende_de: 4 }),
      op(102, 'Chico', { peso_kg: 1.7, depende_de: 8000 }),
      op(103, 'Grande', { peso_kg: 2.5, depende_de: 8000 }),
      op(104, 'Unico tamano', { peso_kg: 1.6, depende_de: 10000 }),
    ] },
    { id: 12, nombre: 'Toppings', min_sel: 0, max_sel: 3, opciones: [
      op(201, 'Frutillas', { precio: 2000, depende_de: 10000 }),
    ] },
  ],
};

const catalogo = { productos: new Map([[23, budin], [42, tortas]]) };
const costos = {
  ingredientes: new Map([[1, 4]]),      // $4 por gramo
  subrecetas: new Map([[5, 10]]),       // $10 por gramo
  productos: new Map([[900, 150]]),     // packaging $150
};

test('budin completo: harina + relleno + proteina + 3 toppings', () => {
  const r = cotizar(catalogo, costos, [{ producto_id: 23, opciones: [12, 9, 30, 8, 11, 15] }]);
  assert.equal(r.ok, true);
  const it = r.items[0];
  assert.equal(it.precio_unitario, 8500 + 3000 + 1000 + 1000 + 1500 + 3000);
  assert.equal(it.costo_unitario, 150 + 500 * 4 + 800);
  assert.equal(it.peso_kg, 0.9);
});

test('falta el relleno obligatorio', () => {
  const r = cotizar(catalogo, costos, [{ producto_id: 23, opciones: [21] }]);
  assert.equal(r.ok, false);
  assert.equal(r.items[0].errores[0].paso_id, 2);
});

test('mas de 3 toppings se rechaza', () => {
  const r = cotizar(catalogo, costos, [{ producto_id: 23, opciones: [21, 12001, 8, 11, 13, 15] }]);
  assert.equal(r.ok, false);
  assert.equal(r.items[0].errores[0].paso_id, 4);
});

test('dos harinas se rechaza', () => {
  const r = cotizar(catalogo, costos, [{ producto_id: 23, opciones: [12, 21, 9] }]);
  assert.equal(r.ok, false);
  assert.equal(r.items[0].errores[0].paso_id, 1);
});

test('opcion de otro producto se rechaza', () => {
  const r = cotizar(catalogo, costos, [{ producto_id: 23, opciones: [12, 9, 101] }]);
  assert.equal(r.ok, false);
});

test('torta: precio = precio por kg x peso del tamano', () => {
  const r = cotizar(catalogo, costos, [{ producto_id: 42, opciones: [4, 101], cantidad: 2 }]);
  assert.equal(r.ok, true);
  assert.equal(r.items[0].precio_unitario, 57600);
  assert.equal(r.total, 115200);
  // receta por kg: 1000 g/kg x 1.8 kg x $10
  assert.equal(r.items[0].costo_unitario, 18000);
});

test('torta: tamano de otra version se rechaza', () => {
  const r = cotizar(catalogo, costos, [{ producto_id: 42, opciones: [4, 103] }]);
  assert.equal(r.ok, false);
});

test('torta: solo muestra los tamanos de la version elegida', () => {
  const r = cotizar(catalogo, costos, [{ producto_id: 42, opciones: [8000] }]);
  const tamano = r.items[0].pasos.find((p) => p.paso_id === 11);
  assert.deepEqual(tamano.opciones_visibles, [102, 103]);
  assert.equal(r.ok, false); // falta el tamano
});

test('torta: toppings propios solo en la version que los tiene', () => {
  const sin = cotizar(catalogo, costos, [{ producto_id: 42, opciones: [8000, 103] }]);
  assert.equal(sin.ok, true);
  assert.deepEqual(sin.items[0].pasos.find((p) => p.paso_id === 12).opciones_visibles, []);
  assert.equal(sin.items[0].precio_unitario, 80000);

  const con = cotizar(catalogo, costos, [{ producto_id: 42, opciones: [10000, 104, 201] }]);
  assert.equal(con.ok, true);
  assert.equal(con.items[0].precio_unitario, 56000 + 2000);
});

test('version por kg sin tamano no tiene precio', () => {
  const sinTamanos = { ...tortas, pasos: [tortas.pasos[0]] };
  const cat = { productos: new Map([[42, sinTamanos]]) };
  const r = cotizar(cat, costos, [{ producto_id: 42, opciones: [4] }]);
  assert.equal(r.ok, false);
  assert.match(r.items[0].errores[0].mensaje, /tamaño/);
});

test('costo incompleto si se borro un ingrediente de la receta', () => {
  const r = cotizar(catalogo, { ...costos, ingredientes: new Map() }, [{ producto_id: 23, opciones: [12, 9] }]);
  assert.equal(r.ok, true);
  assert.equal(r.items[0].costo_incompleto, true);
});

test('producto inexistente, cantidad invalida y pedido vacio', () => {
  assert.equal(cotizar(catalogo, costos, [{ producto_id: 999, opciones: [] }]).ok, false);
  assert.equal(cotizar(catalogo, costos, [{ producto_id: 23, opciones: [12, 9], cantidad: 0 }]).ok, false);
  assert.equal(cotizar(catalogo, costos, []).ok, false);
});

test('estado de costeo: completo, parcial y sin costear', () => {
  // Budin: la receta base (packaging) da costo a todas las combinaciones
  assert.deepEqual(estadoCosteo(budin, costos), { costeo: 'completo', combinaciones_costeadas: 4, combinaciones: 4 });
  // Tortas: solo Carrot tiene receta -> 1 de 4 combinaciones version x tamano
  assert.deepEqual(estadoCosteo(tortas, costos), { costeo: 'parcial', combinaciones_costeadas: 1, combinaciones: 4 });
  // Sin ninguna receta
  const sinRecetas = { ...tortas, pasos: tortas.pasos.map((p) => ({ ...p, opciones: p.opciones.map((o) => ({ ...o, receta: [] })) })) };
  assert.equal(estadoCosteo(sinRecetas, costos).costeo, 'sin');
  // Receta cargada pero con ingrediente borrado (costo 0) no cuenta como completo
  assert.equal(estadoCosteo(budin, { ...costos, productos: new Map() }).costeo, 'parcial');
});
