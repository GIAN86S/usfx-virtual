// Íconos de las apps instalables, con estilo de sello institucional:
// fondo azul o rojo USFX, doble anillo como un sello y el símbolo al centro.
// Respeta la zona segura de los íconos «maskable» (el 80 % central).
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';

const lucide = (n) => readFileSync(`node_modules/lucide-static/icons/${n}.svg`, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[^>]*>/, '').replace('</svg>', '');
const AZUL = ['#2a5aa8', '#0b1f4d'], ROJO = ['#d0404b', '#7d1420'];
const APPS = {
  chat: ['messages-square', AZUL],
  notas: ['graduation-cap', ROJO],
  matricula: ['file-pen-line', ROJO],
};
mkdirSync('public/icons', { recursive: true });
const emblema = await sharp('public/logos/usfx-emblema.png').toBuffer();

const fondo = (t, [claro, oscuro], anillo = '#fff') => `
  <svg xmlns="http://www.w3.org/2000/svg" width="${t}" height="${t}">
    <defs><radialGradient id="g" cx="30%" cy="22%" r="95%"><stop offset="0" stop-color="${claro}"/><stop offset="1" stop-color="${oscuro}"/></radialGradient></defs>
    <rect width="${t}" height="${t}" fill="url(#g)"/>
    <circle cx="${t / 2}" cy="${t / 2}" r="${t * 0.335}" fill="none" stroke="${anillo}" stroke-opacity=".95" stroke-width="${t * (anillo === '#fff' ? 0.012 : 0.022)}"/>
    <circle cx="${t / 2}" cy="${t / 2}" r="${t * 0.305}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="${t * 0.006}"/>
  </svg>`;

async function icono(nombre, colores, capa, anillo) {
  for (const t of [192, 512]) {
    await sharp(Buffer.from(fondo(t, colores, anillo))).composite([{ input: await capa(t), gravity: 'center' }]).png().toFile(`public/icons/${nombre}-${t}.png`);
  }
}
// Escudo dentro de un disco blanco (Campus y la app general USFX Virtual)
const conEscudo = async (t) => {
  const d = Math.round(t * 0.56);
  const disco = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`);
  const esc = await sharp(emblema).resize(Math.round(d * 0.8), Math.round(d * 0.8), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp(disco).composite([{ input: esc, gravity: 'center' }]).png().toBuffer();
};
const linea = (ic) => (t) => {
  const l = Math.round(t * 0.34);
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${l}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${lucide(ic)}</svg>`)).png().toBuffer();
};

await icono('campus', AZUL, conEscudo);
await icono('usfx', AZUL, conEscudo, '#e3343f');
for (const [app, [ic, colores]] of Object.entries(APPS)) await icono(app, colores, linea(ic));
console.log('íconos listos');
