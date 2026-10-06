const pool = require('../../config/db');
const { guardarProducto, guardarGrupo } = require('./editor');

// ============================================================================
// IMPORT DESDE LA APP DE PEDIDOS PERSONALIZADOS
// Lee el catalogo por su API publica (solo lectura) y lo pasa al modelo de
// pasos y opciones:
//   personalizable -> Harina (1) > Relleno (1) > Proteina (0-1) > Toppings (0-3)
//   simple         -> precio base + Proteina / Toppings si los tiene
//   hibrido        -> Version (precio por kg) > Tamano (peso, depende de la
//                     version) > Toppings (los propios de la version reemplazan
//                     a los del producto, como en la tienda)
// Los toppings genericos quedan como grupo "Toppings" de la biblioteca.
//
// Idempotente por origen_ref: lo ya importado se saltea (no pisa lo que se
// haya editado aca despues). Las recetas se cargan aca, la tienda no tiene.
// ============================================================================

const BASE_POR_DEFECTO = 'https://pedidoscoffit.saboryaroma.com/api';

async function traer(base, ruta) {
  const res = await fetch(`${base}${ruta}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`La tienda respondio ${res.status} en ${ruta}`);
  return res.json();
}

const nombres = (lista) => (Array.isArray(lista) ? lista.map((e) => e?.nombre).filter(Boolean) : []);
const activo = (x) => x.activo == null || !!Number(x.activo);
const limpio = (s) => (s == null ? null : String(s).trim() || null);

async function existe(tabla, origenRef) {
  const [[fila]] = await pool.query(`SELECT id FROM ${tabla} WHERE origen_ref = ?`, [origenRef]);
  return fila?.id ?? null;
}

async function importarDesdeTienda(base = BASE_POR_DEFECTO) {
  const origen = new URL(base).origin;
  const imagen = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : `${origen}${u.startsWith('/') ? '' : '/'}${u}`);

  const [productos, toppings, proteina] = await Promise.all([
    traer(base, '/products'),
    traer(base, '/toppings'),
    traer(base, '/config/proteina').catch(() => ({ activa_global: false })),
  ]);

  const informe = { grupos_creados: 0, productos_creados: [], omitidos: [], errores: [] };

  // Grupo de toppings genericos. Mapa: id de topping en la tienda -> id de opcion aca.
  let grupoToppings = await existe('pp_grupos', 'toppings');
  if (!grupoToppings && toppings.length) {
    grupoToppings = await guardarGrupo(null, {
      nombre: 'Toppings',
      opciones: toppings.map((t) => ({ nombre: limpio(t.nombre), descripcion: limpio(t.observacion), precio: t.precio_extra })),
    }, { origenRef: 'toppings' });
    informe.grupos_creados++;
  }
  // Las opciones del grupo se guardaron en el mismo orden que la lista de la
  // tienda; si el grupo ya existia, se cruza por nombre (solo para ajustes de
  // precio, nunca para crear nada).
  const [opcGrupo] = grupoToppings
    ? await pool.query('SELECT id, nombre FROM pp_opciones WHERE grupo_id = ? ORDER BY orden, id', [grupoToppings])
    : [[]];
  const opcionDeTopping = new Map();
  for (const t of toppings) {
    const o = opcGrupo.find((x) => x.nombre === limpio(t.nombre));
    if (o) opcionDeTopping.set(t.id, o.id);
  }

  let clave = 0;
  const nuevaClave = (prefijo) => `${prefijo}${++clave}`;

  // Paso de toppings a nivel producto: grupo generico y/o lista propia (la
  // propia pisa el precio del generico si es el mismo topping).
  async function pasoToppings(p, extrasPorVersion = []) {
    const propios = p.toppings_personalizados
      ? await traer(base, `/product-toppings/product/${p.id}`).catch(() => [])
      : [];
    const usaGrupo = !!p.tiene_toppings && grupoToppings;
    const ajustes = [];
    const opciones = [];
    for (const t of propios) {
      const idTienda = t.topping_id ?? t.id;
      if (usaGrupo && opcionDeTopping.has(idTienda)) {
        ajustes.push({ opcion_id: opcionDeTopping.get(idTienda), precio: t.precio_extra });
      } else {
        opciones.push({ key: nuevaClave('t'), nombre: limpio(t.nombre), precio: t.precio_extra });
      }
    }
    opciones.push(...extrasPorVersion);
    if (!usaGrupo && !opciones.length) return null;
    return { nombre: 'Toppings', min_sel: 0, max_sel: 3, grupo_id: usaGrupo ? grupoToppings : null, ajustes, opciones };
  }

  function pasoProteina(p) {
    const precio = Number(p.proteina_precio_extra) || 0;
    if (!proteina.activa_global || !p.proteina_activa || precio <= 0) return null;
    return {
      nombre: 'Proteína',
      min_sel: 0,
      max_sel: 1,
      opciones: [{ key: nuevaClave('p'), nombre: proteina.nombre_visible || 'Proteína en polvo', precio }],
    };
  }

  for (const [orden, p] of productos.entries()) {
    const ref = `producto:${p.id}`;
    try {
      if (await existe('pp_productos', ref)) {
        informe.omitidos.push(p.nombre);
        continue;
      }

      const pasos = [];
      if (p.tipo === 'personalizable') {
        const [variantes, rellenos] = await Promise.all([
          traer(base, `/variants/product/${p.id}`),
          traer(base, `/fillings/product/${p.id}`),
        ]);
        pasos.push({
          nombre: 'Harina',
          min_sel: 1,
          max_sel: 1,
          opciones: variantes.filter(activo).map((v) => {
            const gramos = Number(v.peso_aprox) || null;
            return {
              key: nuevaClave('h'),
              nombre: `${limpio(v.nombre_harina)}${gramos ? ` (${gramos} g)` : ''}`,
              precio: v.precio,
              peso_kg: gramos ? gramos / 1000 : null,
              etiquetas: nombres(v.etiquetas),
            };
          }),
        });
        if (rellenos.length) {
          pasos.push({
            nombre: 'Relleno',
            min_sel: 1,
            max_sel: 1,
            opciones: rellenos.filter(activo).map((f) => ({ key: nuevaClave('r'), nombre: limpio(f.nombre), precio: f.precio_extra })),
          });
        }
        const prot = pasoProteina(p);
        if (prot) pasos.push(prot);
        const tops = await pasoToppings(p);
        if (tops) pasos.push(tops);
      } else if (p.tipo === 'hibrido') {
        const versiones = (await traer(base, `/versions/product/${p.id}`)).filter(activo);
        const opVersiones = [];
        const opTamanos = [];
        const toppingsDeVersion = [];
        for (const v of versiones) {
          const kv = nuevaClave('v');
          opVersiones.push({
            key: kv,
            nombre: limpio(v.nombre),
            descripcion: limpio(v.descripcion),
            precio: v.precio_por_kg,
            precio_modo: 'por_kg',
            imagen: imagen(v.imagen_url),
            etiquetas: nombres(v.etiquetas),
          });
          for (const s of (v.sizes || []).filter(activo)) {
            opTamanos.push({ key: nuevaClave('s'), nombre: limpio(s.nombre), peso_kg: Number(s.peso_kg), depende_de: kv });
          }
          if (v.toppings_personalizados) {
            for (const t of v.custom_toppings || []) {
              toppingsDeVersion.push({
                key: nuevaClave('vt'),
                nombre: limpio(t.nombre),
                descripcion: t.cantidad ? `${t.cantidad} g` : null,
                precio: t.precio_extra,
                depende_de: kv,
              });
            }
          }
        }
        pasos.push({ nombre: 'Versión', min_sel: 1, max_sel: 1, opciones: opVersiones });
        pasos.push({ nombre: 'Tamaño', min_sel: 1, max_sel: 1, opciones: opTamanos });
        const tops = await pasoToppings(p, toppingsDeVersion);
        if (tops) pasos.push(tops);
      } else {
        const prot = pasoProteina(p);
        if (prot) pasos.push(prot);
        const tops = await pasoToppings(p);
        if (tops) pasos.push(tops);
      }

      await guardarProducto(null, {
        nombre: limpio(p.nombre),
        descripcion: limpio(p.descripcion_corta),
        categoria: limpio(p.categoria_nombre),
        imagen: imagen(p.imagen_url),
        emoji: limpio(p.emoji),
        precio_base: p.tipo === 'simple' ? p.precio_fijo : 0,
        etiquetas: nombres(p.etiquetas),
        es_congelado: !!p.es_congelado,
        orden,
        pasos,
      }, { origenRef: ref });
      informe.productos_creados.push(p.nombre);
    } catch (err) {
      informe.errores.push(`${p.nombre}: ${err.message}`);
    }
  }

  return informe;
}

module.exports = { importarDesdeTienda, BASE_POR_DEFECTO };
