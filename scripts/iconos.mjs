// Genera los íconos de cada app instalable: emblema para Campus y un ícono por función en las demás.
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';

const lucide = (n) => readFileSync(`node_modules/lucide-static/icons/${n}.svg`, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[^>]*>/, '').replace('</svg>', '');
const APPS = { chat: ['messages-square', '#003b90'], notas: ['graduation-cap', '#7a1020'], matricula: ['wallet-cards', '#0f5c4d'] };
mkdirSync('public/icons', { recursive: true });
const emblema = await sharp('public/logos/usfx-emblema.png').toBuffer();

async function icono(fondo, interior, nombre, seguro) {
  for (const t of [192, 512]) {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${t}" height="${t}"><rect width="${t}" height="${t}" fill="${fondo}"/><rect y="${t * 0.9}" width="${t}" height="${t * 0.1}" fill="#ffbd00"/></svg>`;
    const capa = await interior(Math.round(t * seguro));
    await sharp(Buffer.from(s)).composite([{ input: capa, gravity: 'center' }]).png().toFile(`public/icons/${nombre}-${t}.png`);
  }
}
await icono('#003b90', (l) => sharp(emblema).resize(l, l, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), 'campus', 0.62);
for (const [app, [ic, color]] of Object.entries(APPS)) {
  await icono(color, (l) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${l}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${lucide(ic)}</svg>`)).png().toBuffer(), app, 0.55);
}
console.log('íconos listos');
