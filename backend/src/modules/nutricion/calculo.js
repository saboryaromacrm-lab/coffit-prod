const crypto = require('crypto');

// ============================================================================
// CALCULO NUTRICIONAL (funciones puras, sin base de datos)
//
// Los ingredientes tienen sus valores CADA 100 g y cuantos gramos pesa 1
// unidad de receta. Subrecetas y productos se calculan con la receta, igual
// que el costo: cantidad × gramos_por_unidad × valor/100.
// ============================================================================

const NUTRIENTES = [
  'energia_kcal', 'proteinas_g', 'carbohidratos_g', 'azucares_g', 'fibra_g',
  'grasas_g', 'grasas_sat_g', 'grasas_trans_g', 'sodio_mg',
];

const cero = () => Object.fromEntries(NUTRIENTES.map((k) => [k, 0]));
const escalar = (v, f) => Object.fromEntries(NUTRIENTES.map((k) => [k, v[k] * f]));
const sumarEn = (acc, v) => { for (const k of NUTRIENTES) acc[k] += v[k]; };

// Alerta de la IA que sigue vigente: misma linea y misma cantidad (si se
// corrigio la cantidad, deja de mostrarse sola).
function alertaDe(ing, tipo, linea) {
  return (ing.alertas || []).find((a) => a.tipo === tipo
    && Number(a.linea_id) === Number(linea.linea_id)
    && Number(a.cantidad) === Number(linea.cantidad))?.motivo || null;
}

/**
 * Suma las lineas de una receta.
 * lineas: [{ linea_id, tipo: 'ingrediente'|'subreceta'|'manual', ref_id, nombre, cantidad, unidad }]
 * ingredientes: Map id -> { nombre, gramos_por_unidad, valores|null, estado, alertas }
 * subrecetas: Map id -> resultado de calcularSubreceta (solo para lineas de subreceta)
 * origen: 'producto' | 'subreceta' (de que tabla vienen las lineas, para las alertas)
 */
function sumarLineas(lineas, ingredientes, subrecetas, origen) {
  const total = cero();
  let gramos = 0;
  const detalle = [];
  const faltantes = new Set();
  const sinControlar = new Set();
  const alertas = [];

  for (const l of lineas) {
    const cantidad = Number(l.cantidad) || 0;
    const fila = { linea_id: l.linea_id, tipo: l.tipo, nombre: l.nombre, cantidad, unidad: l.unidad, gramos: null, valores: null, completa: false };

    if (l.tipo === 'ingrediente') {
      const ing = ingredientes.get(Number(l.ref_id));
      const gpu = ing && Number(ing.gramos_por_unidad);
      if (ing?.valores && gpu > 0) {
        fila.gramos = cantidad * gpu;
        fila.valores = escalar(ing.valores, fila.gramos / 100);
        fila.completa = true;
        if (ing.estado !== 'controlado') sinControlar.add(ing.nombre);
      } else {
        faltantes.add(l.nombre);
      }
      const motivo = ing && alertaDe(ing, origen, l);
      if (motivo) { fila.alerta = motivo; alertas.push({ nombre: l.nombre, cantidad, motivo }); }
    } else if (l.tipo === 'subreceta') {
      const sub = subrecetas.get(Number(l.ref_id));
      if (sub && sub.total_por_unidad) {
        fila.gramos = sub.gramos_por_unidad != null ? cantidad * sub.gramos_por_unidad : null;
        fila.valores = escalar(sub.total_por_unidad, cantidad);
        fila.completa = sub.completa;
        sub.faltantes.forEach((n) => faltantes.add(`${n} (en ${l.nombre})`));
        sub.sin_controlar.forEach((n) => sinControlar.add(n));
        sub.alertas.forEach((a) => alertas.push({ ...a, nombre: `${a.nombre} (en ${l.nombre})` }));
      } else {
        faltantes.add(l.nombre);
      }
    } else {
      // Item manual: solo tiene costo (caja, envio...), no suma nutrientes
      fila.completa = true;
    }

    if (fila.valores) sumarEn(total, fila.valores);
    if (fila.gramos != null) gramos += fila.gramos;
    detalle.push(fila);
  }

  return {
    total,
    gramos_receta: gramos,
    lineas: detalle,
    completa: detalle.length > 0 && faltantes.size === 0,
    con_datos: detalle.some((f) => f.valores),
    faltantes: [...faltantes],
    sin_controlar: [...sinControlar],
    alertas,
  };
}

/**
 * Subreceta: rinde N porciones o N gramos (tipo_rendimiento).
 * total_por_unidad = valores de 1 porcion o de 1 gramo, lo que el producto
 * multiplica por su cantidad (igual que el costo).
 */
function calcularSubreceta(sub, lineas, ingredientes) {
  const r = sumarLineas(lineas, ingredientes, new Map(), 'subreceta');
  const rinde = Number(sub.rendimiento_gramos) || 0;
  const porciones = sub.tipo_rendimiento === 'porciones';
  const totalPorUnidad = rinde > 0 && r.con_datos ? escalar(r.total, 1 / rinde) : null;
  return {
    ...r,
    tipo_rendimiento: porciones ? 'porciones' : 'gramos',
    rendimiento: rinde,
    total_por_unidad: totalPorUnidad,
    // Para mostrar: por porcion, o cada 100 g
    por_unidad: totalPorUnidad && redondear(escalar(totalPorUnidad, porciones ? 1 : 100)),
    // Gramos de 1 unidad de la subreceta: 1 g, o el peso crudo de 1 porcion
    gramos_por_unidad: porciones ? (rinde > 0 && r.completa ? r.gramos_receta / rinde : null) : 1,
  };
}

// Valores redondeados como se muestran: la huella compara esto, asi una
// diferencia de decimales invisible no vence un control.
function redondear(v) {
  return Object.fromEntries(NUTRIENTES.map((k) => [k, k === 'energia_kcal' || k === 'sodio_mg'
    ? Math.round(v[k]) : Math.round(v[k] * 10) / 10]));
}

/**
 * Producto: la receta completa rinde `porciones`. Por 100 g solo si tiene el
 * peso final cargado (el crudo no sirve: al hornear se pierde agua).
 */
function calcularProducto(prod, lineas, ingredientes, subrecetas) {
  const r = sumarLineas(lineas, ingredientes, subrecetas, 'producto');
  const porciones = Number(prod.porciones) > 0 ? Number(prod.porciones) : 1;
  const peso = Number(prod.peso_total_g) > 0 ? Number(prod.peso_total_g) : null;
  const porPorcion = redondear(escalar(r.total, 1 / porciones));
  return {
    ...r,
    porciones,
    peso_total_g: peso,
    porcion_g: peso ? Math.round(peso / porciones) : null,
    por_porcion: porPorcion,
    por_100g: peso ? redondear(escalar(r.total, 100 / peso)) : null,
    huella: crypto.createHash('sha1').update(JSON.stringify([porPorcion, porciones, peso])).digest('hex'),
  };
}

/**
 * sin_datos | incompleto | pendiente (completo, sin controlar) |
 * controlado | vencido (se controlo, pero cambio la receta o un ingrediente)
 */
function estadoProducto(calc, controladoAt, huellaGuardada) {
  if (!calc.con_datos) return 'sin_datos';
  if (!calc.completa) return 'incompleto';
  if (!controladoAt) return 'pendiente';
  return huellaGuardada === calc.huella ? 'controlado' : 'vencido';
}

module.exports = { NUTRIENTES, calcularSubreceta, calcularProducto, estadoProducto };
