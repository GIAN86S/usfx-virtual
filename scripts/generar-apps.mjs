// Genera el HTML de entrada y el manifiesto de cada app instalable.
// Rutas relativas en el manifiesto: funcionan igual en GitHub Pages y en dominio propio.
import { mkdirSync, writeFileSync } from 'node:fs';

const APPS = {
  campus: ['Campus USFX', 'Campus', 'Campus virtual completo de la USFX: materias, notas, chat y administración.', '#003b90', 'campus'],
  chat: ['Chat USFX', 'Chat USFX', 'Mensajería oficial entre estudiantes, docentes y administración.', '#003b90', 'chat'],
  notas: ['Notas USFX', 'Notas USFX', 'Notas, kardex y asistencia.', '#7a1020', 'notas'],
  matricula: ['Matrícula USFX', 'Matrícula', 'Postulación, matrícula, inscripción de materias y pagos.', '#0f5c4d', 'matricula'],
};
for (const [id, [nombre, corto, desc, color, ic]] of Object.entries(APPS)) {
  mkdirSync(id, { recursive: true });
  mkdirSync(`public/${id}`, { recursive: true });
  writeFileSync(`public/${id}/manifest.webmanifest`, JSON.stringify({
    id: `usfx-${id}`, name: nombre, short_name: corto, description: desc, lang: 'es-BO',
    start_url: './', scope: './', display: 'standalone', orientation: 'any',
    background_color: '#ffffff', theme_color: color, categories: ['education'],
    icons: [
      { src: `../icons/${ic}-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `../icons/${ic}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `../icons/${ic}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2));
  writeFileSync(`${id}/index.html`, `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${nombre}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="${color}">
<link rel="manifest" href="/${id}/manifest.webmanifest">
<link rel="icon" href="/icons/${ic}-192.png">
<link rel="apple-touch-icon" href="/icons/${ic}-192.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${corto}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
</head>
<body data-app="${id}" data-nombre="${nombre}">
<div id="raiz"></div>
<script type="module" src="/src/main.tsx"></script>
</body>
</html>
`);
}
console.log('apps generadas');
