// Genera src/landing/iconos.ts: íconos de línea (Lucide, licencia ISC) más dos propios (Ψ y búho).
// Cada trazo lleva pathLength="1" para poder «dibujarse» con CSS.
import { readFileSync, writeFileSync } from 'node:fs';

const lucide = (n) => readFileSync(`node_modules/lucide-static/icons/${n}.svg`, 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(/\s+/g, ' ').trim();
const PROPIOS = {
  // Ψ: el símbolo clásico de la psicología
  psi: '<path d="M12 2.5v18" /> <path d="M5 4.5v1.8c0 4.6 2.8 7.7 7 7.7s7-3.1 7-7.7V4.5" /> <path d="M8.5 20.5h7" />',
  // Búho de Minerva posado sobre un libro: la filosofía
  buho: '<path d="M7 17.2C5.8 15.6 5.2 13.4 5.2 11c0-3.6 2.2-6.4 6.8-6.4s6.8 2.8 6.8 6.4c0 2.4-.6 4.6-1.8 6.2" /> <path d="M6.6 6.2 6 3l2.8 1.9" /> <path d="M17.4 6.2 18 3l-2.8 1.9" /> <circle cx="9.4" cy="10" r="1.9" /> <circle cx="14.6" cy="10" r="1.9" /> <path d="m12 11.4-.8 1.3h1.6z" /> <path d="M10.2 14.9l.9.6.9-.6.9.6.9-.6" /> <path d="M3.5 17.5 12 19l8.5-1.5" /> <path d="M3.5 17.5v2.2L12 21.2l8.5-1.5v-2.2" /> <path d="M12 19v2.2" />',
};
const MAPA = {
  derecho: 'scale', psicologia: 'psi', gerencia: 'landmark', sistemas: 'cog', contaduria: 'calculator', filosofia: 'buho',
  casa: 'house', titulo: 'graduation-cap', mundo: 'globe', celular: 'smartphone', calendario: 'calendar-days', mano: 'hand-heart',
  campana: 'bell', descargar: 'download', compartir: 'share', mas: 'square-plus', check: 'check', libro: 'book-open-text', diploma: 'scroll-text',
  preguntas: 'circle-help', personas: 'users', video: 'circle-play', flecha: 'arrow-right', pluma: 'pen-line', mensaje: 'message-circle', biblioteca: 'library-big',
};
// Safari dibuja mal pathLength en <circle>, <rect> y <line>: todo se convierte a <path>.
const at = (t, n) => Number((t.match(new RegExp(`\\s${n}="([^"]*)"`)) || [])[1] ?? 0);
const aPath = (svg) => svg
  .replace(/<circle\b[^>]*\/>/g, (t) => { const cx = at(t, 'cx'), cy = at(t, 'cy'), r = at(t, 'r'); return `<path d="M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0" />`; })
  .replace(/<line\b[^>]*\/>/g, (t) => `<path d="M${at(t, 'x1')} ${at(t, 'y1')}L${at(t, 'x2')} ${at(t, 'y2')}" />`)
  .replace(/<rect\b[^>]*\/>/g, (t) => {
    const x = at(t, 'x'), y = at(t, 'y'), w = at(t, 'width'), h = at(t, 'height'), r = Math.min(at(t, 'rx') || at(t, 'ry'), w / 2, h / 2);
    return r ? `<path d="M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z" />`
             : `<path d="M${x} ${y}h${w}v${h}h${-w}z" />`;
  })
  .replace(/<(polyline|polygon)\b[^>]*points="([^"]*)"[^>]*\/>/g, (_, tag, pts) => `<path d="M${pts.trim()}${tag === 'polygon' ? 'z' : ''}" />`);
const salida = {};
for (const [k, n] of Object.entries(MAPA)) {
  const cuerpo = aPath(PROPIOS[n] ?? lucide(n));
  salida[k] = cuerpo.replace(/<(path|circle|rect|line|polyline|polygon|ellipse)\b/g, '<$1 pathLength="1"');
}
writeFileSync('src/landing/iconos.ts',
  `// Generado por scripts/iconos-landing.mjs. Íconos de Lucide (ISC) y dos propios.\n` +
  `export const ICONOS = ${JSON.stringify(salida, null, 1)} as const;\n` +
  `export type Icono = keyof typeof ICONOS;\n` +
  `export const ico = (n: Icono, clase = '') => \`<svg class="ico \${clase}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">\${ICONOS[n]}</svg>\`;\n`);
console.log('iconos.ts:', Object.keys(salida).length, 'íconos');
