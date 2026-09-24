/**
 * Code 128 mínimo para las etiquetas de prueba. Los códigos solo de dígitos van en el
 * set C (dos dígitos por símbolo; si sobra uno, se cambia al set B para el último) y el
 * resto en el set B. Devuelve los módulos como texto: "1" barra, "0" espacio.
 */
const PATRONES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const INICIO_B = 104, INICIO_C = 105, CAMBIO_B = 100, FIN = 106;

export function valoresCode128(texto) {
  const s = String(texto);
  if (!s || /[^\x20-\x7E]/.test(s)) throw new Error(`Code 128 B/C no codifica "${s}"`);
  const valores = [];
  if (/^\d+$/.test(s) && s.length >= 2) {
    valores.push(INICIO_C);
    const pares = s.length - (s.length % 2);
    for (let i = 0; i < pares; i += 2) valores.push(Number(s.slice(i, i + 2)));
    if (pares < s.length) valores.push(CAMBIO_B, s.charCodeAt(pares) - 32);
  } else {
    valores.push(INICIO_B);
    for (const ch of s) valores.push(ch.charCodeAt(0) - 32);
  }
  const control = valores.reduce((suma, v, i) => suma + v * (i || 1), 0) % 103;
  return [...valores, control, FIN];
}

export function modulosCode128(texto) {
  return valoresCode128(texto).map((v) => [...PATRONES[v]]
    .map((ancho, i) => (i % 2 ? '0' : '1').repeat(Number(ancho))).join('')).join('');
}

// SVG en unidades de módulo, con zona de silencio de 10 módulos a cada lado.
export function svgCode128(texto, { alto = 50, ancho = null } = {}) {
  const m = modulosCode128(texto);
  const total = m.length + 20;
  let barras = '';
  for (let i = 0; i < m.length;) {
    if (m[i] === '1') {
      let j = i;
      while (m[j] === '1') j++;
      barras += `<rect x="${i + 10}" y="0" width="${j - i}" height="${alto}"/>`;
      i = j;
    } else i++;
  }
  const dim = ancho ? ` width="${ancho}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${alto}"${dim} preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${total}" height="${alto}" fill="#fff"/><g fill="#000">${barras}</g></svg>`;
}
