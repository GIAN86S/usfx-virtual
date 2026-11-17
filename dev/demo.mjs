// npm run demo  ->  http://localhost:4173  (sin cuenta de Supabase; los datos viven en memoria y se pierden al cerrar)
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearDB } from './pg.mjs';
import { crearGateway, hashDemo } from './gateway.mjs';
import { CLAVE_DEMO, sembrar } from './semilla.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(RAIZ, 'dist');
const PUERTO = Number(process.env.PUERTO || 4173);
if (!process.env.SIN_BUILD) {
  console.log('Compilando…');
  execSync('npx vite build', { cwd: RAIZ, stdio: 'inherit', env: { ...process.env, VITE_DEMO: '1', VITE_SUPABASE_URL: '', VITE_BASE: '/' } });
}
console.log('Preparando base de datos…');
const db = await crearDB();
await sembrar(db, hashDemo);
crearGateway(db, { dist }).listen(PUERTO, () => {
  console.log(`\nUSFX Virtual en modo demo: http://localhost:${PUERTO}\n`);
  console.log(`Usuarios (clave para todos: ${CLAVE_DEMO}):`);
  console.log('  estudiante  moroso  postulante  docente  director  finanzas  admin  sistemas\n');
});
