// ============================================================================
// MOTOR DE PEDIDOS PERSONALIZADOS
// Unica fuente de verdad de precio y costo: lo usan el simulador del panel,
// la cotizacion del POS y la creacion del pedido. Es una funcion pura (no
// toca la base): recibe el catalogo ya cargado y los costos unitarios, asi
// que se puede probar sola y lo cotizado es exactamente lo que se guarda.
//
// Reglas (ver database/pp_schema.sql):
//   precio = precio_base + opciones fijas + (opciones por kg x peso del item)
//   peso   = suma del peso de las opciones elegidas
//   costo  = receta base + recetas de las opciones (lineas por kg x peso)
// ============================================================================

const MAX_ITEMS = 50;
const MAX_CANTIDAD = 99;

const redondear = (n) => Math.round(n * 100) / 100;

// Opciones que se pueden elegir en un paso segun lo ya elegido en los pasos
// anteriores. Si hay opciones que dependen de algo elegido, se muestran SOLO
// esas (la lista propia de una version reemplaza a la general); si no, las
// que no dependen de nada.
function opcionesVisibles(paso, elegidas) {
  const especificas = paso.opciones.filter((o) => o.depende_de != null && elegidas.has(o.depende_de));
  return especificas.length ? especificas : paso.opciones.filter((o) => o.depende_de == null);
}

// Costo unitario de una linea de receta con los precios vigentes.
// Si la fuente ya no existe (ingrediente borrado) vale 0 y se avisa.
function costoLinea(linea, costos, peso) {
  let unitario;
  if (linea.ingrediente_id != null) unitario = costos.ingredientes.get(linea.ingrediente_id);
  else if (linea.subreceta_id != null) unitario = costos.subrecetas.get(linea.subreceta_id);
  else if (linea.cc_producto_id != null) unitario = costos.productos.get(linea.cc_producto_id);
  else unitario = linea.costo_manual;

  const factor = linea.por_kg ? peso : 1;
  if (unitario == null) return { costo: 0, incompleto: true };
  return { costo: linea.cantidad * unitario * factor, incompleto: false };
}

function costoReceta(lineas, costos, peso) {
  let costo = 0;
  let incompleto = false;
  for (const l of lineas) {
    const r = costoLinea(l, costos, peso);
    costo += r.costo;
    incompleto = incompleto || r.incompleto;
  }
  return { costo, incompleto };
}

// Un item: producto + ids de opciones elegidas. Los ids se comparan tal cual
// llegan (numeros desde la base; claves de texto en el simulador de un
// producto sin guardar): quien llama normaliza.
function cotizarItem(catalogo, costos, entrada) {
  const producto = catalogo.productos.get(entrada.producto_id);
  const cantidad = Number(entrada.cantidad ?? 1);
  const base = { producto_id: entrada.producto_id ?? null, cantidad, notas: entrada.notas || null };

  if (!producto || !producto.activo) {
    return { ...base, nombre: producto?.nombre || null, errores: [{ paso_id: null, mensaje: 'Producto no disponible' }] };
  }
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD) {
    return { ...base, nombre: producto.nombre, errores: [{ paso_id: null, mensaje: `Cantidad inválida (1 a ${MAX_CANTIDAD})` }] };
  }

  const pendientes = new Set(entrada.opciones || []);
  const elegidas = new Set();
  const errores = [];
  const pasos = [];
  const opcionesElegidas = []; // [{ paso, opcion }]

  // Los pasos se recorren en orden: lo elegido en uno habilita opciones
  // de los siguientes.
  for (const paso of producto.pasos) {
    const visibles = opcionesVisibles(paso, elegidas);
    const enPaso = visibles.filter((o) => pendientes.has(o.id));
    for (const o of enPaso) {
      pendientes.delete(o.id);
      elegidas.add(o.id);
      opcionesElegidas.push({ paso, opcion: o });
    }

    // Un paso sin opciones para mostrar no se pide (ej. toppings de una
    // version que no tiene).
    if (visibles.length) {
      const min = Math.min(paso.min_sel, visibles.length);
      if (enPaso.length < min) {
        errores.push({ paso_id: paso.id, mensaje: min === 1 ? `Falta elegir: ${paso.nombre}` : `${paso.nombre}: elegí al menos ${min}` });
      } else if (enPaso.length > paso.max_sel) {
        errores.push({ paso_id: paso.id, mensaje: `${paso.nombre}: máximo ${paso.max_sel}` });
      }
    }
    pasos.push({
      paso_id: paso.id,
      nombre: paso.nombre,
      min_sel: paso.min_sel,
      max_sel: paso.max_sel,
      opciones_visibles: visibles.map((o) => o.id),
      elegidas: enPaso.map((o) => o.id),
    });
  }

  // Lo que quedo sin ubicar no existe en el producto o no corresponde con lo
  // elegido (ej. un tamano de otra version).
  for (const id of pendientes) {
    const paso = producto.pasos.find((s) => s.opciones.some((o) => o.id === id));
    const nombre = paso?.opciones.find((o) => o.id === id).nombre;
    errores.push(paso
      ? { paso_id: paso.id, mensaje: `"${nombre}" no corresponde con lo elegido` }
      : { paso_id: null, mensaje: `La opción ${id} no existe en este producto` });
  }

  const peso = opcionesElegidas.reduce((s, { opcion }) => s + (opcion.peso_kg || 0), 0);
  // Solo si no falta nada mas: es un producto por kg sin ningun paso que de
  // el peso (si falta elegir el tamano, ya lo dijo el paso).
  if (!errores.length && peso <= 0 && opcionesElegidas.some(({ opcion }) => opcion.precio_modo === 'por_kg')) {
    errores.push({ paso_id: null, mensaje: 'Falta elegir el tamaño (el precio va por kg)' });
  }

  const recetaBase = costoReceta(producto.receta, costos, peso);
  let precio = producto.precio_base;
  let costo = recetaBase.costo;
  let incompleto = recetaBase.incompleto;

  const detalle = opcionesElegidas.map(({ paso, opcion }) => {
    const aporte = opcion.precio_modo === 'por_kg' ? opcion.precio * peso : opcion.precio;
    const receta = costoReceta(opcion.receta, costos, peso);
    precio += aporte;
    costo += receta.costo;
    incompleto = incompleto || receta.incompleto;
    return {
      opcion_id: opcion.id,
      paso_id: paso.id,
      paso_nombre: paso.nombre,
      nombre: opcion.nombre,
      precio: redondear(aporte),
      costo: redondear(receta.costo),
    };
  });

  return {
    ...base,
    nombre: producto.nombre,
    peso_kg: peso > 0 ? Math.round(peso * 1000) / 1000 : null,
    precio_unitario: redondear(precio),
    costo_unitario: redondear(costo),
    costo_incompleto: incompleto,
    opciones: detalle,
    pasos,
    errores,
  };
}

// Pedido completo. `ok` = se puede guardar tal cual.
function cotizar(catalogo, costos, entradas) {
  if (!Array.isArray(entradas) || entradas.length === 0) {
    return { ok: false, items: [], total: 0, costo_total: 0, errores: ['El pedido no tiene ítems'] };
  }
  if (entradas.length > MAX_ITEMS) {
    return { ok: false, items: [], total: 0, costo_total: 0, errores: [`Máximo ${MAX_ITEMS} ítems por pedido`] };
  }

  const items = entradas.map((e) => cotizarItem(catalogo, costos, e || {}));
  let total = 0;
  let costoTotal = 0;
  for (const it of items) {
    if (it.errores.length) continue;
    total += it.precio_unitario * it.cantidad;
    costoTotal += it.costo_unitario * it.cantidad;
  }

  return {
    ok: items.every((it) => it.errores.length === 0),
    items,
    total: redondear(total),
    costo_total: redondear(costoTotal),
    errores: [],
  };
}

// Todas las combinaciones validas de los pasos OBLIGATORIOS de un producto
// (los opcionales van vacios), cotizadas con el mismo motor: respeta
// dependencias y precio por kg. Sirve para el "desde $X" y para ver el margen
// de cada combinacion en el panel. Los pasos que piden 2 o mas no se
// enumeran (explotan en combinaciones); tope por si el producto crece mucho.
function combinaciones(producto, costos, tope = 500) {
  const catalogo = { productos: new Map([[producto.id, producto]]) };
  const salida = [];
  let truncado = false;

  (function recorrer(i, elegidas) {
    if (salida.length >= tope) { truncado = true; return; }
    if (i === producto.pasos.length) {
      const r = cotizarItem(catalogo, costos, { producto_id: producto.id, opciones: elegidas });
      if (!r.errores.length) salida.push(r);
      return;
    }
    const paso = producto.pasos[i];
    const visibles = opcionesVisibles(paso, new Set(elegidas));
    if (!visibles.length || paso.min_sel === 0) return recorrer(i + 1, elegidas);
    if (paso.min_sel > 1) return;
    for (const o of visibles) recorrer(i + 1, [...elegidas, o.id]);
  })(0, []);

  return { combinaciones: salida, truncado };
}

// Estado de costeo de un producto mirando TODAS las combinaciones de sus pasos
// obligatorios (los extras opcionales no cuentan):
//   completo = todas dan costo > 0 | parcial = algunas o ninguna | sin = no hay
//   ninguna receta cargada. Con una sola harina costeada el producto NO queda
//   completo: las demas combinaciones darian $0.
function estadoCosteo(producto, costos) {
  const tieneRecetas = producto.receta.length > 0
    || producto.pasos.some((s) => s.opciones.some((o) => o.receta.length > 0));
  if (!tieneRecetas) return { costeo: 'sin', combinaciones_costeadas: 0, combinaciones: 0 };
  const lista = combinaciones(producto, costos).combinaciones;
  const conCosto = lista.filter((c) => c.costo_unitario > 0).length;
  return {
    costeo: lista.length > 0 && conCosto === lista.length ? 'completo' : 'parcial',
    combinaciones_costeadas: conCosto,
    combinaciones: lista.length,
  };
}

module.exports = { cotizar, cotizarItem, combinaciones, estadoCosteo, opcionesVisibles, MAX_ITEMS, MAX_CANTIDAD };
