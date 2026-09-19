#!/usr/bin/env node
// ============================================================================
// OPTIMIZA LAS FOTOS QUE YA ESTAN EN LA CARTA (una sola vez)
//
// Baja cada foto externa (las de saboryaroma.com/imagenescoffit/), la optimiza
// igual que una subida nueva (WebP 1200px) y apunta carta_items.imagen a la
// copia local.
//
// SEGURO Y REVERSIBLE:
//   - Los originales en Hostinger NO se tocan: siguen ahi intactos.
//   - Antes de escribir deja un backup JSON con las URLs viejas.
//   - Es idempotente: las que ya estan en /uploads/ las saltea.
//
// Uso:
//   node scripts/optimizar-imagenes-carta.js              # simulacro (no escribe)
//   node scripts/optimizar-imagenes-carta.js --aplicar    # aplica de verdad
//   node scripts/optimizar-imagenes-carta.js --revertir backup-xxx.json
// ============================================================================
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const pool = require('../src/config/db');
const IMG = require('../src/utils/imagenes');

const APLICAR = process.argv.includes('--aplicar');
const idxRevertir = process.argv.indexOf('--revertir');
const ARCHIVO_REVERTIR = idxRevertir !== -1 ? process.argv[idxRevertir + 1] : null;

const BASE = (process.env.PUBLIC_URL || 'https://apicoffit.saboryaroma.com').replace(/\/+$/, '');
const kb = (b) => `${(b / 1024).toFixed(0)} KB`;

async function revertir(archivo) {
  const backup = JSON.parse(await fs.readFile(archivo, 'utf8'));
  console.log(`Revirtiendo ${backup.length} imagenes desde ${archivo}...`);
  for (const { id, imagen } of backup) {
    await pool.query('UPDATE carta_items SET imagen = ? WHERE id = ?', [imagen, id]);
  }
  console.log('Listo. Las URLs volvieron a su valor original.');
}

// Escribir 100+ fotos en el disco efimero del contenedor seria tirarlas a la
// basura: el proximo deploy las borra y la carta queda con URLs rotas. Antes de
// aplicar verificamos que UPLOADS_DIR sea realmente un volumen montado.
async function verificarVolumen() {
  let montajes = '';
  try {
    montajes = await fs.readFile('/proc/mounts', 'utf8');
  } catch {
    return; // fuera de Linux (ej: corriendo local) no aplica
  }
  const dir = path.resolve(IMG.UPLOADS_DIR);
  const esMontaje = montajes.split('\n').some((l) => l.split(' ')[1] === dir);
  if (esMontaje) return;

  console.error(`\n  ATENCION: ${dir} NO es un volumen montado.`);
  console.error('  Las fotos se borrarian en el proximo deploy y la carta quedaria rota.');
  console.error('  Configurá el volumen en Dokploy (Advanced > Volumes) y redeployá antes de aplicar.');
  console.error('  Si igual querés seguir, agregá --sin-volumen.\n');
  if (!process.argv.includes('--sin-volumen')) process.exit(1);
}

async function main() {
  if (ARCHIVO_REVERTIR) return revertir(ARCHIVO_REVERTIR);
  if (APLICAR) await verificarVolumen();

  const [filas] = await pool.query(
    `SELECT id, nombre, imagen FROM carta_items
     WHERE activo = 1 AND imagen IS NOT NULL AND TRIM(imagen) != ''
       AND imagen NOT LIKE '%/uploads/%'
     ORDER BY id`
  );

  console.log(`${filas.length} imagenes para optimizar${APLICAR ? '' : '  (SIMULACRO: no se escribe nada)'}\n`);
  if (filas.length === 0) return;

  await IMG.asegurarCarpeta();

  const backup = [];
  let antes = 0, despues = 0, ok = 0;
  const fallidas = [];

  for (const fila of filas) {
    const etiqueta = `#${fila.id} ${String(fila.nombre).slice(0, 28)}`.padEnd(34);
    try {
      const res = await fetch(fila.imagen);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());

      const { data, info } = await IMG.optimizar(buf);
      antes += buf.length;
      despues += data.length;

      // El nombre sale del item, no de la URL: queda legible en el disco.
      const nombre = `${fila.nombre}`.trim() || 'foto';
      if (APLICAR) {
        const guardado = await IMG.procesarYGuardar(buf, nombre);
        const url = `${BASE}/uploads/${guardado.nombre}`;
        backup.push({ id: fila.id, imagen: fila.imagen });
        await pool.query('UPDATE carta_items SET imagen = ? WHERE id = ?', [url, fila.id]);
      }

      ok++;
      console.log(`${etiqueta} ${kb(buf.length).padStart(8)} => ${kb(data.length).padStart(7)}  ${info.width}x${info.height}`);
    } catch (e) {
      fallidas.push({ id: fila.id, nombre: fila.nombre, imagen: fila.imagen, motivo: e.message });
      console.log(`${etiqueta} ERROR: ${e.message}`);
    }
  }

  if (APLICAR && backup.length) {
    const archivo = path.join(__dirname, `backup-imagenes-${Date.now()}.json`);
    await fs.writeFile(archivo, JSON.stringify(backup, null, 2));
    console.log(`\nBackup de URLs viejas: ${archivo}`);
    console.log(`Para deshacer: node scripts/optimizar-imagenes-carta.js --revertir ${path.basename(archivo)}`);
  }

  console.log(`\n${ok}/${filas.length} optimizadas`);
  console.log(`Total: ${(antes / 1024 / 1024).toFixed(1)} MB => ${(despues / 1024 / 1024).toFixed(1)} MB` +
    (antes ? `  (-${(100 - despues / antes * 100).toFixed(0)}%)` : ''));

  if (fallidas.length) {
    console.log(`\n${fallidas.length} fallaron (quedan con su URL actual, no se rompe nada):`);
    for (const f of fallidas) console.log(`  #${f.id} ${f.nombre} — ${f.motivo} — ${f.imagen}`);
  }
  if (!APLICAR) console.log('\nEsto fue un simulacro. Corré con --aplicar para escribir.');
}

main()
  .catch((e) => { console.error('Error fatal:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
