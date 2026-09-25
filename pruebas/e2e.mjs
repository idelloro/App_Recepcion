/**
 * Prueba de punta a punta de la app de recepción, en Chromium con pantalla de TC27.
 * Escanea "como DataWedge" (teclas + ENTER) y recorre todas las reglas: pallets nuevos,
 * cierre, reapertura, repetidas, no identificados, deshacer, mover, eliminar, recarga,
 * modo sin conexión y el Excel exportado.
 *
 *   node pruebas/e2e.mjs [--real=<packing real .xls>] [--capturas=<carpeta>]
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';

// Playwright no es dependencia del proyecto: su instalación baja ~150 MB de navegadores.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Falta playwright. Instalar con:  npm i -D playwright');
  process.exit(1);
}

const aqui = new URL('.', import.meta.url).pathname;
const APP = join(aqui, '..');
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || null;
const REAL = arg('real');
const CAPTURAS = arg('capturas');
if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
const XLSX = new Function('exports', 'module', 'define', 'window',
  readFileSync(join(APP, 'xlsx.full.min.js'), 'utf8') + '\nreturn XLSX;')();

// ---------- servidor estático ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const servidor = createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = join(APP, ruta);
  if (!archivo.startsWith(APP) || !existsSync(archivo)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(archivo)] || 'application/octet-stream' });
  res.end(readFileSync(archivo));
});
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${servidor.address().port}/`;

// ---------- utilidades de la prueba ----------
const fallas = [];
let pasos = 0;
function afirmar(cond, msj) {
  pasos++;
  if (!cond) { fallas.push(msj); console.log('  ✗ ' + msj); } else console.log('  ✓ ' + msj);
}
const navegador = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// TC27: pantalla de 6" FHD+ en vertical ≈ 412 × 780 px CSS con la barra de estado.
const contexto = await navegador.newContext({
  viewport: { width: 412, height: 780 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, acceptDownloads: true,
});
const page = await contexto.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()} ${m.location().url || ''}`.trim()); });
page.on('response', (r) => { if (r.status() >= 400) errores.push(`HTTP ${r.status()}: ${r.url()}`); });

const estado = () => page.evaluate(() => {
  const E = window.recepcion.estado();
  return {
    escaneos: E.escaneos.map((s) => ({ codigo: s.codigo, pallet: s.pallet, repetida: s.repetida, sku: s.sku })),
    pallets: [...E.pallets.values()].map((p) => ({ num: p.num, estado: p.estado, sku: p.sku })).sort((a, b) => a.num - b.num),
    noident: E.noident.map((s) => s.leido),
  };
});
const visible = (sel) => page.locator(sel).isVisible();
const texto = (sel) => page.locator(sel).innerText();
async function calma() {
  await page.waitForTimeout(60);
  await page.evaluate(() => Promise.race([window.recepcion.cola(), new Promise((r) => setTimeout(r, 1500))]));
  await page.waitForTimeout(60);
}
async function escanear(codigo) {
  await page.keyboard.type(String(codigo));
  await page.keyboard.press('Enter');
  await calma();
}
async function captura(nombre) {
  if (CAPTURAS) await page.screenshot({ path: join(CAPTURAS, nombre + '.png') });
}
async function sinScrollHorizontal(donde) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  afirmar(ok, `${donde}: sin scroll horizontal`);
}
async function botonesGrandes(donde) {
  const chicos = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => b.offsetParent !== null && !b.closest('#prueba'))
    .map((b) => ({ t: b.innerText.trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height) }))
    .filter((b) => b.h < 48));
  afirmar(chicos.length === 0, `${donde}: todos los botones miden ≥ 48 px ${chicos.length ? JSON.stringify(chicos) : ''}`);
}
async function tocar(sel) {
  await page.locator(sel).first().tap();
  await page.waitForTimeout(450);   // los avisos ignoran toques de los primeros 400 ms
}

try {
  // =================================================================== inicio
  console.log('\nInicio y carga del packing list de prueba');
  await page.goto(BASE + '?prueba');
  await page.waitForSelector('#p-inicio:not([hidden])');
  await page.setInputFiles('#archivo', join(aqui, 'packing_list_prueba.xls'));
  await page.waitForSelector('.cifras');
  const cifras = await texto('.cifras');
  afirmar(/40\s*cajas/.test(cifras) && /5\s*productos/.test(cifras) && /139,83\s*kg/.test(cifras),
    `resumen de carga: 40 cajas, 5 productos, 139,83 kg (${cifras.replace(/\s+/g, ' ')})`);
  const sel = (id) => page.$eval(id, (s) => s.options[s.selectedIndex].text);
  afirmar(await sel('#m-hoja') === 'Nro Packing List', 'elige sola la hoja "Nro Packing List" aunque "Hoja1" va primero');
  afirmar(await sel('#m-codigo') === 'E · Num Caja', 'N° de caja = columna E');
  afirmar(await sel('#m-kilos') === 'Q · Kilos', 'kilos = columna Q');
  afirmar(await sel('#m-desc') === 'AZ · Descripción', 'producto = columna AZ');
  afirmar(await sel('#m-sku') === '— igual al producto —', 'sin columna SKU aparte');
  afirmar(await page.inputValue('#ref') === 'packing_list_prueba', 'la referencia se propone desde el nombre del archivo');
  await captura('01-inicio');
  await sinScrollHorizontal('inicio');
  await page.fill('#ref', 'PRUEBA 001');
  await page.click('#btn-iniciar');
  await page.waitForSelector('#p-escaneo:not([hidden])');
  afirmar((await texto('#e-num')).includes('Escanee la primera caja'), 'pantalla de escaneo lista, sin cajas');
  await botonesGrandes('escaneo');

  // =================================================================== reglas de pallets
  console.log('\nReglas de pallets');
  await escanear('10000001');
  afirmar(await visible('#capa-nuevo'), 'SKU nunca escaneado: aviso azul de pallet nuevo');
  afirmar((await texto('#capa-nuevo .t1')) === 'NUEVO PALLET N°' && (await texto('#cn-num')) === '1' && (await texto('#cn-sku')).includes('Minced 2 kg'), 'el aviso dice "NUEVO PALLET N° 1 – Minced"');
  await captura('02-nuevo-pallet');
  await escanear('10000003');
  afirmar(!(await visible('#capa-nuevo')), 'la siguiente lectura cierra el aviso azul');
  afirmar((await texto('#e-num')) === '1' && (await texto('#e-pal-v')) === '2 cajas', 'misma SKU con pallet abierto: se suma al N° 1');
  await escanear('10000005');
  afirmar((await texto('#cn-num')) === '2', 'otra SKU: pallet N° 2');
  await escanear('10000004');
  let st = await estado();
  afirmar(st.escaneos.at(-1).pallet === 1, 'la tercera caja de Minced vuelve al pallet N° 1');
  afirmar((await texto('#e-sku-v')) === '3 / 14', 'avance del producto 3 / 14');
  await captura('03-escaneo');

  // =================================================================== no identificado
  console.log('\nCódigo que no está en el packing list');
  await escanear('55555555');
  afirmar(await visible('#capa-error'), 'aviso rojo');
  afirmar((await texto('#ce-cod')) === '55555555', 'muestra el código leído');
  await captura('04-no-encontrado');
  await escanear('10000008');
  st = await estado();
  afirmar(!st.escaneos.some((s) => s.codigo === '10000008'), 'con el aviso rojo abierto, una lectura se rechaza y no se registra');
  afirmar(st.noident.length === 1 && st.noident[0] === '55555555', 'el código queda en el log de no identificados');
  await tocar('#capa-error');
  afirmar(!(await visible('#capa-error')), 'el aviso rojo se cierra con un toque');
  await escanear('10000008');
  st = await estado();
  afirmar(st.escaneos.at(-1).codigo === '10000008' && st.escaneos.at(-1).pallet === 1, 'después del toque, la caja entra al pallet N° 1');

  // =================================================================== pallet lleno
  console.log('\nPallet lleno / Nuevo pallet');
  afirmar((await texto('#btn-lleno-sub')) === 'Cierra el pallet N° 1', 'el botón indica qué pallet cierra');
  await tocar('#btn-lleno');
  afirmar(await visible('#modal'), 'pide confirmación antes de cerrar');
  await captura('05-confirmar-cierre');
  await escanear('10000011');
  st = await estado();
  afirmar(await visible('#modal') && !st.escaneos.some((s) => s.codigo === '10000011'), 'un escaneo no responde el diálogo: se rechaza');
  await tocar('#modal [data-r="si"]');
  st = await estado();
  afirmar(st.pallets.find((p) => p.num === 1).estado === 'CERRADO', 'pallet N° 1 cerrado');
  await escanear('10000011');
  afirmar((await texto('#cn-num')) === '3', 'SKU con todos sus pallets cerrados: pallet nuevo N° 3');

  // =================================================================== repetida
  console.log('\nCaja escaneada dos veces');
  await escanear('10000011');
  afirmar(await visible('#capa-repetida'), 'aviso ámbar de caja ya escaneada');
  afirmar((await texto('#cr-texto')).includes('pallet N° 3'), 'dice en qué pallet está');
  await captura('06-repetida');
  await tocar('#capa-repetida [data-r="descartar"]');
  st = await estado();
  afirmar(st.escaneos.filter((s) => s.codigo === '10000011').length === 1, 'descartar: no se registra');
  await escanear('10000011');
  await tocar('#capa-repetida [data-r="registrar"]');
  st = await estado();
  afirmar(st.escaneos.filter((s) => s.codigo === '10000011').length === 2 && st.escaneos.at(-1).repetida, 'registrar igual: queda marcada como repetida');

  // =================================================================== deshacer
  console.log('\nDeshacer último');
  await tocar('#btn-deshacer');
  afirmar((await texto('#modal-hoja')).includes('10000011') && (await texto('#modal-hoja')).includes('N° 3'), 'la confirmación muestra caja y pallet');
  await captura('07-deshacer');
  await tocar('#modal [data-r="si"]');
  st = await estado();
  afirmar(st.escaneos.filter((s) => s.codigo === '10000011').length === 1 && st.pallets.some((p) => p.num === 3), 'deshace la repetida; el pallet N° 3 sigue');
  await tocar('#btn-deshacer');
  afirmar((await texto('#modal-hoja')).includes('se elimina'), 'avisa que el pallet queda vacío');
  await tocar('#modal [data-r="si"]');
  st = await estado();
  afirmar(!st.pallets.some((p) => p.num === 3), 'pallet N° 3 (única caja) eliminado');
  await escanear('10000019');
  afirmar((await texto('#cn-num')) === '3', 'el número 3 se reutiliza');

  // =================================================================== foco
  console.log('\nFoco del lector');
  await page.evaluate(() => document.activeElement.blur());
  await escanear('10000007');
  st = await estado();
  afirmar(st.escaneos.at(-1).codigo === '10000007', 'sin foco, la lectura igual se captura');
  await page.waitForTimeout(1100);
  afirmar(await page.evaluate(() => document.activeElement.id === 'lectura'), 'el foco vuelve solo al lector');
  await page.evaluate(() => document.querySelector('#btn-resumen').focus());
  await page.keyboard.press('Enter');
  await calma();
  afirmar(await visible('#p-escaneo'), 'ENTER con un botón enfocado no lo aprieta');
  for (const c of ['10000009', '10000014', '10000022']) await page.keyboard.type(c + '\n');
  await calma();
  st = await estado();
  afirmar(st.escaneos.slice(-3).map((s) => s.codigo).join() === '10000009,10000014,10000022', 'tres lecturas seguidas sin pausa, en orden');

  console.log('\nEscáner sin ENTER');
  await page.keyboard.type('10000029', { delay: 8 });   // ritmo de DataWedge, sin ENTER
  await page.waitForTimeout(300);
  await calma();
  st = await estado();
  afirmar(st.escaneos.at(-1).codigo === '10000029', 'una lectura rápida sin ENTER se procesa sola');
  await page.keyboard.insertText('10000038');           // código completo en un solo evento, sin ENTER
  await page.waitForTimeout(300);
  await calma();
  st = await estado();
  afirmar(st.escaneos.at(-1).codigo === '10000038', 'el código entero en un solo evento, sin ENTER, también se procesa solo');
  await page.keyboard.type('10000032', { delay: 150 });  // alguien tecleando
  await page.waitForTimeout(400);
  st = await estado();
  afirmar(st.escaneos.at(-1).codigo === '10000038', 'lo tecleado a mano espera el ENTER');
  await page.keyboard.press('Enter');
  await calma();
  st = await estado();
  afirmar(st.escaneos.at(-1).codigo === '10000032', 'y con ENTER se procesa');

  // =================================================================== recarga
  console.log('\nRecarga en medio de la recepción');
  const antes = await estado();
  await page.reload();
  await page.waitForSelector('#p-escaneo:not([hidden])');
  const despues = await estado();
  afirmar(JSON.stringify(antes) === JSON.stringify(despues), 'después de recargar, el estado es idéntico');
  afirmar((await texto('#e-num')) === '2', 'muestra la última caja: pallet N° 2');

  // =================================================================== resumen, reabrir, mover, eliminar
  console.log('\nResumen y detalle');
  await tocar('#btn-resumen');
  afirmar(await visible('#p-resumen'), 'abre el resumen');
  const filas = await page.locator('#r-lista .fila').count();
  afirmar(filas === 3, `3 pallets en la lista (${filas})`);
  await captura('08-resumen');
  afirmar(await page.evaluate(() => document.querySelector('#p-resumen').getBoundingClientRect().height <= innerHeight + 1),
    'resumen: alto fijo; la lista se desplaza y el pie queda a la vista');
  await sinScrollHorizontal('resumen');
  await botonesGrandes('resumen');
  await tocar('#r-lista [data-pallet="1"]');
  afirmar(await visible('#p-detalle'), 'abre el detalle del pallet N° 1');
  await tocar('[data-accion="reabrir"]');
  afirmar((await texto('#modal-hoja')).includes('N° 3'), 'al reabrir avisa que el N° 3 (abierto, mismo SKU) se cerrará');
  await tocar('#modal [data-r="si"]');
  st = await estado();
  afirmar(st.pallets.find((p) => p.num === 1).estado === 'ABIERTO' && st.pallets.find((p) => p.num === 3).estado === 'CERRADO',
    'N° 1 abierto y N° 3 cerrado: un solo pallet abierto por SKU');
  const cajas = page.locator('#d-lista .caja-fila');
  await cajas.nth(0).tap();
  await cajas.nth(1).tap();
  await captura('09-detalle-seleccion');
  await sinScrollHorizontal('detalle');
  await tocar('#d-pie [data-accion="mover"]');
  const destinos = await page.locator('#modal [data-r]:not([data-r=""])').allInnerTexts();
  afirmar(destinos.length === 1 && destinos[0].includes('N° 3'), 'solo ofrece pallets del mismo SKU (N° 3)');
  await tocar('#modal [data-r="3"]');
  await tocar('#modal [data-r="si"]');
  st = await estado();
  afirmar(st.escaneos.filter((s) => s.pallet === 1).length === 2 && st.escaneos.filter((s) => s.pallet === 3).length === 3, 'mueve 2 cajas del N° 1 al N° 3');
  await page.locator('#d-lista .caja-fila').nth(0).tap();
  await tocar('#d-pie [data-accion="eliminar"]');
  await tocar('#modal [data-r="si"]');
  st = await estado();
  afirmar(st.escaneos.filter((s) => s.pallet === 1).length === 1, 'elimina un escaneo desde el detalle');

  console.log('\nLectura desde el resumen');
  await tocar('#p-detalle [data-volver]');
  afirmar(await visible('#p-resumen'), 'atrás vuelve al resumen');
  await escanear('10000024');
  afirmar(await visible('#p-escaneo'), 'escanear en el resumen vuelve a la pantalla de escaneo');
  st = await estado();
  afirmar(st.escaneos.at(-1).codigo === '10000024' && st.escaneos.at(-1).pallet === 2, 'y registra la caja en su pallet');

  console.log('\nUnir: pallet mixto (excepción)');
  await tocar('#btn-resumen');
  await tocar('#r-lista [data-pallet="2"]');
  const antesP2 = (await estado()).escaneos.filter((s) => s.pallet === 2).length;
  await page.locator('#d-lista .caja-fila').nth(0).tap();
  await tocar('#d-pie [data-accion="unir"]');
  const opcionesUnir = await page.locator('#modal [data-r]:not([data-r=""])').allInnerTexts();
  afirmar(opcionesUnir.length === 2 && opcionesUnir.some((t) => t.includes('N° 3')), 'Unir ofrece pallets de cualquier producto (N° 1 y N° 3)');
  await tocar('#modal [data-r="3"]');
  afirmar((await texto('#modal-hoja')).includes('MIXTO'), 'la confirmación avisa que el pallet queda MIXTO');
  await tocar('#modal [data-r="si"]');
  st = await estado();
  const skus3 = new Set(st.escaneos.filter((s) => s.pallet === 3).map((s) => s.sku));
  afirmar(skus3.size === 2 && st.escaneos.filter((s) => s.pallet === 2).length === antesP2 - 1, 'la caja pasa al N° 3, que queda con dos productos');
  await tocar('#p-detalle [data-volver]');
  await tocar('#r-lista [data-pallet="3"]');
  await page.locator('#d-lista .caja-fila').nth(0).tap();
  await captura('10a-mixto');
  await page.locator('#d-lista .caja-fila').nth(0).tap();
  await tocar('#p-detalle [data-volver]');
  afirmar((await texto('#r-lista')).includes('MIXTO:'), 'el resumen muestra el pallet N° 3 como MIXTO');
  await escanear('10000027');
  st = await estado();
  afirmar(st.escaneos.at(-1).pallet === 2, 'regla B: la siguiente caja de Ahumados sigue yendo a su propio pallet (N° 2), no al mixto');

  console.log('\nAvance y no identificados');
  await tocar('#btn-resumen');
  await tocar('.tab[data-tab="avance"]');
  const avance = await texto('#r-lista');
  afirmar(avance.includes('/ 40 cajas') && avance.includes('FALTAN'), 'avance por SKU contra el packing list');
  await captura('10-avance');
  await tocar('.tab[data-tab="noident"]');
  afirmar((await texto('#r-lista')).includes('55555555'), 'lista de no identificados');

  // =================================================================== exportación
  console.log('\nFinalizar y exportar');
  await tocar('.tab[data-tab="pallets"]');
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-exportar').tap()]);
  const nombre = descarga.suggestedFilename();
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  afirmar(nombre === `Recepcion_PRUEBA_001_${fecha}.xlsx`, `nombre del archivo: ${nombre}`);
  const ruta = join(tmpdir(), nombre);
  await descarga.saveAs(ruta);
  await page.waitForSelector('#modal:not([hidden])');
  await captura('11-exportado');
  await tocar('#modal [data-r="no"]');
  st = await estado();
  const wb = XLSX.read(readFileSync(ruta));
  afirmar(wb.SheetNames.join() === 'Pallets,Resumen_SKU,Diferencias,Detalle_Escaneos,No_Identificados,Cajas_No_Recibidas',
    `hojas: ${wb.SheetNames.join(', ')}`);
  const aoa = (h) => XLSX.utils.sheet_to_json(wb.Sheets[h], { header: 1, raw: true });
  const pal = aoa('Pallets');
  afirmar(pal[0].join('|') === 'N° pallet|Tipo|SKU|Descripción|Cajas|Kg|Estado', 'Pallets: columnas');
  const filasEsperadas = st.pallets.reduce((a, p) => a + new Set(st.escaneos.filter((s) => s.pallet === p.num).map((s) => s.sku)).size, 0);
  afirmar(pal.length === 1 + filasEsperadas + 1 && pal.at(-1)[0] === 'TOTAL GENERAL' && pal.at(-1)[4] === st.escaneos.length,
    `Pallets: una fila por pallet y producto, y total general (${pal.at(-1)[4]} cajas)`);
  const filas3 = pal.filter((f) => f[0] === 3);
  afirmar(filas3.length === 2 && filas3.every((f) => f[1] === 'MIXTO'), 'Pallets: el N° 3 ocupa dos filas, marcadas MIXTO');
  afirmar(pal.filter((f) => f[0] === 2).every((f) => f[1] === 'SIMPLE'), 'Pallets: el N° 2 es SIMPLE');
  const sku = aoa('Resumen_SKU');
  const minced = sku.find((f) => String(f[0]).includes('Minced'));
  afirmar(minced && minced[3] === '1, 3', `Resumen_SKU: pallets usados "1, 3" (${minced && minced[3]})`);
  const dif = aoa('Diferencias');
  const estadoDif = (t) => (dif.find((f) => f[0] === t) || [])[8];
  afirmar(dif.length === 1 + 5 + 1 && estadoDif('Ahumados C kgs') === 'OK' && estadoDif('Salmon Ahumado En Frio Minced 2 kg') === 'FALTANTE',
    'Diferencias: los 5 SKU con total; Ahumados completo (OK) y Minced FALTANTE');
  const det = aoa('Detalle_Escaneos');
  afirmar(det.length === 1 + st.escaneos.length && typeof det[1][0] === 'number', 'Detalle_Escaneos: una fila por caja, con fecha de Excel');
  afirmar(aoa('No_Identificados')[1][1] === 55555555, 'No_Identificados: el código leído (como número, igual que en el packing list)');
  afirmar(dif.at(-1)[8] === undefined || dif.at(-1)[8] === '', 'Diferencias: la fila total no lleva estado');
  const unicos = new Set(st.escaneos.map((s) => s.codigo)).size;
  afirmar(aoa('Cajas_No_Recibidas').length === 1 + 40 - unicos, `Cajas_No_Recibidas: ${40 - unicos} cajas`);
  const kgTotal = st.escaneos.length ? pal.at(-1)[5] : 0;
  afirmar(Math.abs(kgTotal - pal.slice(1, -1).reduce((a, f) => a + f[5], 0)) < 1e-6, 'los kilos del total cuadran con la suma de pallets');
  const ahum = sku.find((f) => String(f[0]) === 'Ahumados C kgs');
  afirmar(ahum && ahum[3] === '2, 3', `Resumen_SKU: Ahumados usa los pallets "2, 3" (${ahum && ahum[3]})`);

  // =================================================================== sin conexión
  console.log('\nSin conexión');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 });
  await page.goto(BASE + 'pruebas/etiquetas_prueba.html');
  afirmar((await page.locator('h1').innerText()).startsWith('Etiquetas de prueba'),
    'con el service worker activo, pruebas/etiquetas_prueba.html abre las etiquetas y no la app');
  await page.goto(BASE + '?prueba');
  await page.waitForSelector('#p-escaneo:not([hidden])');
  await contexto.setOffline(true);
  await page.reload();
  await page.waitForSelector('#p-escaneo:not([hidden])');
  afirmar(JSON.stringify(await estado()) === JSON.stringify(st), 'sin red, la app abre desde el equipo con la recepción intacta');
  await escanear('10000021');
  afirmar((await estado()).escaneos.at(-1).codigo === '10000021', 'y sigue escaneando sin conexión');
  await tocar('#btn-resumen');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-exportar').tap()]);
  afirmar(!!d2.suggestedFilename(), 'exporta sin conexión (SheetJS va incluido)');
  await page.waitForSelector('#modal:not([hidden])');
  await contexto.setOffline(false);

  // =================================================================== nueva recepción
  console.log('\nNueva recepción');
  await tocar('#modal [data-r="si"]');
  afirmar((await texto('#modal-hoja')).includes('¿Borrar la recepción?'), 'pide una segunda confirmación antes de borrar');
  await tocar('#modal [data-r="si"]');
  await page.waitForSelector('#p-inicio:not([hidden])');
  await page.reload();
  await page.waitForSelector('#p-inicio:not([hidden])');
  afirmar(true, 'la recepción anterior se borró: la app vuelve al inicio');

  // =================================================================== packing list real
  if (REAL) {
    console.log('\nPacking list real');
    await page.setInputFiles('#archivo', REAL);
    await page.waitForSelector('.cifras');
    const c = (await texto('.cifras')).replace(/\s+/g, ' ');
    afirmar(/340 cajas/.test(c) && /8 productos/.test(c) && /1\.471,41 kg/.test(c), `real: 340 cajas, 8 productos, 1.471,41 kg (${c})`);
    afirmar(await sel('#m-codigo') === 'E · Num Caja' && await sel('#m-kilos') === 'Q · Kilos' && await sel('#m-desc') === 'AZ · Descripción',
      'real: columnas E, Q y AZ');
    afirmar(!(await page.locator('#carga .avisos').count()), 'real: sin avisos de lectura');
    await captura('12-real-carga');
    await page.click('#btn-iniciar');
    await page.waitForSelector('#p-escaneo:not([hidden])');
    await escanear('98171500');
    afirmar((await texto('#cn-num')) === '1' && (await texto('#cn-sku')) === 'Salmon Ahumado En Frio Minced 2 kg', 'real: primera caja → pallet N° 1');
    await escanear('098177571');
    afirmar((await texto('#e-caja')).includes('2,01 kg'), 'real: tolera ceros a la izquierda y toma los kilos de la caja (2,01)');
    afirmar((await texto('#e-sku-v')) === '2 / 151', 'real: avance 2 / 151');
    await captura('13-real-escaneo');
    // Una caja de cada producto: 8 pallets, más de los que caben en la pantalla.
    const primeras = await page.evaluate(() => {
      const vistos = new Map();
      for (const c of window.recepcion.estado().cajas.values()) if (!vistos.has(c.sku)) vistos.set(c.sku, c.codigo);
      return [...vistos.values()];
    });
    for (const c of primeras.slice(1)) { await escanear(c); await tocar('#capa-nuevo'); }
    await tocar('#btn-resumen');
    const pie = await page.evaluate(() => {
      const b = document.querySelector('#btn-exportar').getBoundingClientRect();
      const l = document.querySelector('#r-lista');
      const filas = [...l.querySelectorAll('.fila')].map((f) => f.getBoundingClientRect());
      const encimadas = filas.some((f, i) => i && filas[i - 1].bottom > f.top + 0.5);
      const desbordadas = [...l.querySelectorAll('.fila')].some((f) => f.scrollHeight > f.clientHeight + 1);
      return { visible: b.bottom <= innerHeight + 1, desplaza: l.scrollHeight > l.clientHeight, filas: filas.length, encimadas, desbordadas };
    });
    afirmar(pie.filas === 8 && pie.desplaza && pie.visible, `real: con ${pie.filas} pallets la lista se desplaza y "Finalizar y exportar" sigue a la vista`);
    afirmar(!pie.encimadas && !pie.desbordadas, 'real: las filas no se aplastan ni se superponen');
    await captura('14-real-resumen');
  }
} catch (e) {
  fallas.push('excepción: ' + (e.stack || e));
  console.error(e);
  await captura('zz-error');
}

afirmar(errores.length === 0, `sin errores en la consola ${errores.length ? JSON.stringify(errores) : ''}`);
await navegador.close();
servidor.close();
console.log(`\n${pasos - fallas.length} de ${pasos} comprobaciones OK`);
if (fallas.length) {
  console.log('Fallas:\n - ' + fallas.join('\n - '));
  process.exit(1);
}
