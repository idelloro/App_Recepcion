/**
 * Genera pruebas/packing_list_prueba.xls: mismo formato que el packing list real
 * (hoja "Nro Packing List", 52 columnas, una fila por caja, y una hoja "Hoja1" antes),
 * con datos inventados para probar sin tocar información del proveedor.
 *
 * También genera pruebas/etiquetas_prueba.html: las mismas cajas en Code 128, para
 * imprimirlas (o mostrarlas en un monitor) y escanearlas con la TC27.
 *
 *   node pruebas/generar-packing-prueba.mjs
 *
 * Es determinista: siempre produce las mismas cajas y los mismos kilos.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { svgCode128 } from './code128.mjs';

const aqui = new URL('.', import.meta.url).pathname;
const XLSX = new Function('exports', 'module', 'define', 'window',
  readFileSync(aqui + '../xlsx.full.min.js', 'utf8') + '\nreturn XLSX;')();

// Encabezados del packing list real, en su orden (A … AZ). La app usa E, Q y AZ.
const ENCABEZADOS = ['Nro Packing SUM', 'Pedido Sap SUM', 'D Propietario', 'D Especie', 'Num Caja',
  'Num Caja Origen', 'Codigo Opm', 'Codigo Sap', 'D Preparacion', 'D Preparacion 2', 'D Otras Espec 1',
  'D Calidad', 'Calibre Inf', 'Calibre Sup', 'Peso Neto Vta', 'Unidad Caja', 'Kilos', 'Jaula',
  'Lote M Prima', 'Batch', 'Centro Cultivo', 'Stock Position', 'Fecha Elaboracion', 'Fecha Vencimiento',
  'Lote Planta Origen', 'Fecha Cosecha', 'D Otras Espec 2', 'D Otras Espec 3', 'Lote Number',
  'D Position', 'D Caja Master', 'Analisis Calidad', 'Bodega', 'Corr Prop', 'Estado Packing',
  'D Pres Indiv', 'Fecha Despacho', 'Destinatario', 'Lugar Almacenamiento', 'Certificado Bap',
  'Nro Pedido', 'Customer', 'Producto', 'P Sap Peso Neto Vta SUM', 'P Sap Kilos SUM', 'Unidad Venta',
  'Fecha Empaque', 'Planta Primaria', 'D Destino Final', 'Certificado Asc', 'Gexpo', 'Descripción'];
const col = Object.fromEntries(ENCABEZADOS.map((h, i) => [h, i]));

const PRODUCTOS = [
  { desc: 'Salmon Ahumado En Frio Minced 2 kg', cajas: 14, prep: 'SUBPRODUCTOS', esp: 'MINCED', kilos: [2, 4, 6, 8, 10, 12, 14] },
  { desc: 'Ahumados C kgs', cajas: 10, prep: 'LOINS', esp: 'REBANADA', kilos: [0.22, 0.67, 0.85, 1.35, 1.8, 2.48] },
  { desc: 'Salmon Ahumado En Frio Slice Trad (1 Kg) Kgs', cajas: 6, prep: 'SLICE', esp: 'REBANADA', kilos: [3, 4, 5, 6, 8, 9] },
  { desc: 'Salmon Ahumado en Frio Slice Trad (113 Grs) Kgs', cajas: 6, prep: 'SLICE', esp: 'REBANADA', kilos: [0.33, 0.45, 0.56, 0.79, 0.9] },
  { desc: 'Salmon Ahumado en Frio Slice Trad (100 Grs) Kgs', cajas: 4, prep: 'SLICE', esp: 'REBANADA', kilos: [0.4, 0.9, 1.3, 1.7] },
];

// PRNG con semilla fija (mulberry32) para que el archivo sea reproducible.
let semilla = 602622;
const azar = () => {
  semilla |= 0; semilla = (semilla + 0x6D2B79F5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Cajas mezcladas entre productos, como llegan en un packing list real.
const orden = PRODUCTOS.flatMap((p, i) => Array.from({ length: p.cajas }, () => i));
for (let i = orden.length - 1; i > 0; i--) {
  const j = Math.floor(azar() * (i + 1));
  [orden[i], orden[j]] = [orden[j], orden[i]];
}

const filas = [ENCABEZADOS];
const porProducto = PRODUCTOS.map(() => []);
orden.forEach((ip, k) => {
  const p = PRODUCTOS[ip];
  const numCaja = 10000001 + k;
  const kilos = p.kilos[Math.floor(azar() * p.kilos.length)];
  const f = new Array(ENCABEZADOS.length).fill(null);
  f[col['Nro Packing SUM']] = 900001;
  f[col['Pedido Sap SUM']] = 20099999;
  f[col['D Propietario']] = 'AHUMADO';
  f[col['D Especie']] = 'ATLANTICO';
  f[col['Num Caja']] = numCaja;
  f[col['Codigo Sap']] = `PRUEBA-${ip + 1}`;
  f[col['D Preparacion']] = p.prep;
  f[col['D Otras Espec 1']] = p.esp;
  f[col['Peso Neto Vta']] = kilos;
  f[col['Unidad Caja']] = 1;
  f[col['Kilos']] = kilos;
  f[col['Bodega']] = 'CO1';
  f[col['Estado Packing']] = 'Activo';
  f[col['Nro Pedido']] = 20099999;
  f[col['Customer']] = 'CLIENTE DE PRUEBA';
  f[col['P Sap Peso Neto Vta SUM']] = kilos;
  f[col['P Sap Kilos SUM']] = kilos;
  f[col['Unidad Venta']] = 'KGS';
  f[col['Gexpo']] = `TEST-00${ip + 1}`;
  f[col['Descripción']] = p.desc;
  filas.push(f);
  porProducto[ip].push({ numCaja, kilos });
});

// "Hoja1" va primero, igual que en el archivo real: la app debe encontrar sola la hoja buena.
const resumen = [[], [], ['Suma de Kilos'], ['Descripción', 'Cajas', 'Kilos']];
PRODUCTOS.forEach((p, i) => resumen.push([p.desc, porProducto[i].length,
  Math.round(porProducto[i].reduce((a, c) => a + c.kilos, 0) * 100) / 100]));

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Hoja1');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Nro Packing List');
const salida = aqui + 'packing_list_prueba.xls';
writeFileSync(salida, Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'biff8' })));

console.log(`Escrito ${salida}: ${orden.length} cajas, ${PRODUCTOS.length} productos.`);
PRODUCTOS.forEach((p, i) => {
  const kg = porProducto[i].reduce((a, c) => a + c.kilos, 0);
  console.log(`\n${p.desc} — ${porProducto[i].length} cajas, ${kg.toFixed(2)} kg`);
  console.log('  ' + porProducto[i].map((c) => c.numCaja).join(' '));
});

// ---------- Hoja de etiquetas ----------
const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const etiqueta = (codigo, lineas, clase = '') => `<div class="et ${clase}">${svgCode128(codigo)}<div class="n">${codigo}</div>${lineas.map((l) => `<div class="d">${escHtml(l)}</div>`).join('')}</div>`;
let cuerpo = '';
PRODUCTOS.forEach((p, i) => {
  cuerpo += `<h2>${escHtml(p.desc)} · ${porProducto[i].length} cajas</h2><div class="grid">` +
    porProducto[i].map((c) => etiqueta(c.numCaja, [`${c.kilos.toFixed(2).replace('.', ',')} kg`])).join('') + '</div>';
});
cuerpo += '<h2>Para probar errores</h2><div class="grid">' +
  etiqueta(99999999, ['No está en el packing list', 'Debe dar aviso rojo'], 'mala') + '</div>';
const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Etiquetas de prueba</title>
<link rel="icon" href="../icons/icono.svg" type="image/svg+xml">
<style>
@page { size: A4; margin: 10mm; }
body { margin: 10mm; font-family: system-ui, sans-serif; color: #111; }
@media print { body { margin: 0; } }
h1 { font-size: 16pt; margin: 0 0 2mm; }
p { font-size: 10pt; margin: 0 0 4mm; max-width: 170mm; }
h2 { font-size: 11pt; margin: 5mm 0 2mm; break-after: avoid; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
.et { border: .3mm solid #999; border-radius: 2mm; padding: 2mm 2mm 1.5mm; text-align: center; break-inside: avoid; }
.et svg { display: block; width: 100%; height: 14mm; }
.et .n { font: 700 12pt ui-monospace, monospace; margin-top: 1mm; }
.et .d { font-size: 8pt; color: #444; }
.et.mala { border: .6mm solid #C0392F; }
</style>
</head>
<body>
<h1>Etiquetas de prueba · packing_list_prueba.xls</h1>
<p>Cargue <b>packing_list_prueba.xls</b> en la app y escanee estas etiquetas con la TC27, impresas o en la pantalla de un PC.
Cada código es un N° de caja del packing list de prueba, en Code 128. Escanear dos veces la misma etiqueta prueba el aviso de caja repetida.</p>
${cuerpo}
</body>
</html>
`;
writeFileSync(aqui + 'etiquetas_prueba.html', html);
console.log(`\nEscrito ${aqui}etiquetas_prueba.html`);
