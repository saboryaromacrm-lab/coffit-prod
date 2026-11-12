const test = require('node:test');
const assert = require('node:assert/strict');
const { NUTRIENTES, calcularSubreceta, calcularProducto, estadoProducto } = require('./calculo');

// Valores cada 100 g: solo energia y proteinas, el resto en 0
const vals = (kcal, prot = 0) => ({ ...Object.fromEntries(NUTRIENTES.map((k) => [k, 0])), energia_kcal: kcal, proteinas_g: prot });

const ingredientes = new Map([
  [1, { nombre: 'Harina', gramos_por_unidad: 1, valores: vals(350, 10), estado: 'controlado', alertas: [] }],
  // Huevo: la receta lo carga por unidad, 1 u = 50 g
  [2, { nombre: 'Huevo', gramos_por_unidad: 50, valores: vals(140, 12), estado: 'sin_revisar', alertas: [] }],
  [3, { nombre: 'Granola', gramos_por_unidad: 1000, valores: vals(450), estado: 'controlado',
    alertas: [{ tipo: 'producto', linea_id: 30, cantidad: 40, motivo: '40 kg en un bowl' }] }],
  [4, { nombre: 'Sin datos', gramos_por_unidad: null, valores: null, estado: null, alertas: [] }],
]);

const ing = (linea_id, ref_id, cantidad, nombre = ingredientes.get(ref_id).nombre) =>
  ({ linea_id, tipo: 'ingrediente', ref_id, nombre, cantidad, unidad: 'g' });

test('ingrediente por unidad: convierte con gramos_por_unidad', () => {
  const p = calcularProducto({ porciones: 2, peso_total_g: null }, [ing(1, 1, 100), ing(2, 2, 2)], ingredientes, {});
  // 100 g harina = 350 kcal; 2 huevos = 100 g = 140 kcal -> 490 / 2 porciones
  assert.equal(p.por_porcion.energia_kcal, 245);
  assert.equal(p.por_porcion.proteinas_g, 11); // (10 + 12) / 2
  assert.equal(p.gramos_receta, 200);
  assert.equal(p.completa, true);
  assert.deepEqual(p.sin_controlar, ['Huevo']);
  assert.equal(p.por_100g, null); // sin peso final no hay valor cada 100 g
});

test('por 100 g usa el peso final cargado, no el crudo', () => {
  const p = calcularProducto({ porciones: 1, peso_total_g: 250 }, [ing(1, 1, 100)], ingredientes, {});
  assert.equal(p.por_100g.energia_kcal, 140); // 350 kcal en 250 g
  assert.equal(p.porcion_g, 250);
});

test('subreceta por porciones y por gramos', () => {
  const porPorciones = calcularSubreceta({ rendimiento_gramos: 4, tipo_rendimiento: 'porciones' },
    [ing(10, 1, 200)], ingredientes);
  assert.equal(porPorciones.por_unidad.energia_kcal, 175); // 700 / 4
  assert.equal(porPorciones.gramos_por_unidad, 50);

  const porGramos = calcularSubreceta({ rendimiento_gramos: 500, tipo_rendimiento: 'gramos' },
    [ing(11, 1, 200)], ingredientes);
  assert.equal(porGramos.por_unidad.energia_kcal, 140); // 700 kcal en 500 g -> cada 100 g

  const subs = new Map([[7, { ...porPorciones, nombre: 'Masa' }], [8, { ...porGramos, nombre: 'Salsa' }]]);
  const p = calcularProducto({ porciones: 1 }, [
    { linea_id: 1, tipo: 'subreceta', ref_id: 7, nombre: 'Masa', cantidad: 2, unidad: 'porc' },
    { linea_id: 2, tipo: 'subreceta', ref_id: 8, nombre: 'Salsa', cantidad: 50, unidad: 'g' },
  ], ingredientes, { subreceta: subs });
  assert.equal(p.por_porcion.energia_kcal, 350 + 70);
  assert.equal(p.gramos_receta, 150);
});

test('faltantes: ingrediente sin datos y subreceta incompleta; el item manual no cuenta', () => {
  const sub = calcularSubreceta({ rendimiento_gramos: 2, tipo_rendimiento: 'porciones' },
    [ing(20, 1, 100), ing(21, 4, 10)], ingredientes);
  assert.equal(sub.completa, false);
  const p = calcularProducto({ porciones: 1 }, [
    ing(1, 1, 100),
    { linea_id: 2, tipo: 'manual', ref_id: null, nombre: 'Caja', cantidad: 1, unidad: 'u' },
    { linea_id: 3, tipo: 'subreceta', ref_id: 9, nombre: 'Relleno', cantidad: 1, unidad: 'porc' },
  ], ingredientes, { subreceta: new Map([[9, { ...sub, nombre: 'Relleno' }]]) });
  assert.equal(p.completa, false);
  assert.deepEqual(p.faltantes, ['Sin datos (en Relleno)']);
  assert.equal(estadoProducto(p, null, null), 'incompleto');
});

test('alerta de la IA: vigente solo con la misma linea y cantidad', () => {
  const conAlerta = calcularProducto({ porciones: 1 }, [ing(30, 3, 40)], ingredientes, {});
  assert.equal(conAlerta.alertas.length, 1);
  const corregida = calcularProducto({ porciones: 1 }, [ing(30, 3, 0.04)], ingredientes, {});
  assert.equal(corregida.alertas.length, 0);
  assert.equal(corregida.por_porcion.energia_kcal, 180); // 40 g de granola
});

test('estado: el control se vence si cambian los valores', () => {
  const lineas = [ing(1, 1, 100)];
  const p = calcularProducto({ porciones: 1 }, lineas, ingredientes, {});
  assert.equal(estadoProducto(p, null, null), 'pendiente');
  assert.equal(estadoProducto(p, new Date(), p.huella), 'controlado');
  const cambiado = calcularProducto({ porciones: 1 }, [ing(1, 1, 120)], ingredientes, {});
  assert.equal(estadoProducto(cambiado, new Date(), p.huella), 'vencido');
  assert.equal(estadoProducto(calcularProducto({ porciones: 1 }, [], ingredientes, {}), null, null), 'sin_datos');
});

test('linea de producto ya calculado: suma sus porciones', () => {
  // Torta de 10 porciones (1000 g de harina); otra receta usa 2 porciones
  const torta = calcularProducto({ porciones: 10 }, [ing(1, 1, 1000)], ingredientes, {});
  const p = calcularProducto({ porciones: 1 }, [
    { linea_id: 1, tipo: 'producto', ref_id: 5, nombre: 'Torta', cantidad: 2, unidad: 'porc' },
  ], ingredientes, { producto: new Map([[5, torta]]) });
  assert.equal(p.por_porcion.energia_kcal, 700); // 3500 kcal / 10 x 2
  assert.equal(p.gramos_receta, 200);
  assert.equal(p.completa, true);
});
