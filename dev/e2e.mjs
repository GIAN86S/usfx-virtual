// Prueba de punta a punta en un navegador real contra el servidor de demo.
// npm run build:demo una vez y luego: node dev/e2e.mjs [carpeta de capturas]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { crearDB } from './pg.mjs';
import { crearGateway, hashDemo } from './gateway.mjs';
import { sembrar } from './semilla.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(tmpdir(), 'usfx-e2e'); mkdirSync(OUT, { recursive: true });
const DESC = mkdtempSync(join(tmpdir(), 'usfx-desc'));
const PUERTO = 4199, BASE = `http://127.0.0.1:${PUERTO}`;
const db = await crearDB(); await sembrar(db, hashDemo);
const srv = crearGateway(db, { dist: join(RAIZ, 'dist') }).listen(PUERTO);

// Archivos de prueba
const roja = join(OUT, 'foto4x4.png'); const azul = join(OUT, 'doc.png'); const pdf = join(OUT, 'material.pdf');
await sharp({ create: { width: 200, height: 200, channels: 3, background: '#d01010' } }).png().toFile(roja);
await sharp({ create: { width: 300, height: 200, channels: 3, background: '#2040a0' } }).png().toFile(azul);
writeFileSync(pdf, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--remote-debugging-port=9360', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'usfx-e')), 'about:blank']);
await new Promise((r) => setTimeout(r, 2500));
const t = (await (await fetch('http://127.0.0.1:9360/json')).json()).find((x) => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {}, errores = [], fallos = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend[m.id]) pend[m.id](m);
  if (m.method === 'Runtime.exceptionThrown' && !/Receiving end does not exist/.test(JSON.stringify(m.params))) errores.push(m.params.exceptionDetails.exception?.description?.slice(0, 300) ?? m.params.exceptionDetails.text);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400 && !m.params.response.url.includes('/realtime/')) fallos.push(`${m.params.response.status} ${m.params.response.url.replace(BASE, '').slice(0, 90)}`);
};
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => { const r = await cmd('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('EV: ' + x.slice(0, 80) + ' → ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
const w = (ms) => new Promise((r) => setTimeout(r, ms));
await cmd('Runtime.enable'); await cmd('Page.enable'); await cmd('Network.enable'); await cmd('DOM.enable');
await cmd('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DESC });

let ok = 0, mal = 0;
const paso = (nombre, cond, extra = '') => { if (cond) { ok++; console.log('  ok  ' + nombre); } else { mal++; console.log('  MAL ' + nombre + (extra ? ' → ' + extra : '')); } };
const tam = async (ancho, alto) => cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: ancho < 600 });
const foto = async (n) => { const s = await cmd('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, n + '.png'), Buffer.from(s.result.data, 'base64')); };
const texto = () => ev('document.body.innerText');
const hasta = async (fn, ms = 7000) => { const f = Date.now() + ms; while (Date.now() < f) { if (await ev(`!!(${fn})`)) return true; await w(120); } return false; };
const hayTexto = (s) => hasta(`document.body.innerText.includes(${JSON.stringify(s)})`);
const ir = async (url) => { await cmd('Page.navigate', { url: url.startsWith('http') ? url : BASE + url }); await w(700); };
const ruta = async (r) => { await ev(`location.hash=${JSON.stringify('#' + r)}`); await w(450); };
const clic = async (s, sel = 'button,a,label.boton,.chat-item') => {
  const r = await ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find(x=>x.innerText&&x.innerText.trim().includes(${JSON.stringify(s)})||x.getAttribute('aria-label')===${JSON.stringify(s)});if(!e)return false;e.scrollIntoView({block:'center'});e.click();return true})()`);
  await w(300); return r;
};
// Escribe como una persona, para detectar campos que no dejan teclear.
const escribe = async (etiqueta, valor) => {
  const f = await ev(`(()=>{const l=[...document.querySelectorAll('label.campo')].reverse().find(x=>x.querySelector('span')?.innerText.trim()===${JSON.stringify(etiqueta)});const i=l?.querySelector('input,textarea');if(!i)return false;i.focus();i.select&&i.select();return true})()`);
  if (!f) return false;
  for (const ch of String(valor)) await cmd('Input.dispatchKeyEvent', { type: 'char', text: ch });
  await w(40); return true;
};
const elige = (etiqueta, textoOp) => ev(`(()=>{const l=[...document.querySelectorAll('label.campo')].reverse().find(x=>x.querySelector('span')?.innerText.trim()===${JSON.stringify(etiqueta)});const s=l?.querySelector('select');if(!s)return false;const o=[...s.options].find(o=>o.text.includes(${JSON.stringify(textoOp)}));if(!o)return false;const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
const archivo = async (selector, ruta_, indice = 0) => {
  const doc = await cmd('DOM.getDocument'); const n = await cmd('DOM.querySelectorAll', { nodeId: doc.result.root.nodeId, selector });
  await cmd('DOM.setFileInputFiles', { files: [ruta_], nodeId: n.result.nodeIds[indice] }); await w(500);
};
const entrar = async (u, app = 'campus', clave = 'demo1234') => {
  await ir(`/${app}/`);
  await ev(`localStorage.removeItem('usfx-sesion');location.reload()`); await w(500); await hasta(`document.querySelector('input[autocomplete=username]')`, 12000);
  await escribe('Usuario', u); await escribe('Contraseña', clave);
  await clic('Ingresar', 'button'); await hasta(`document.querySelector('.superior')`);
};
const clicVarios = async (partes) => { await ev(`(()=>{const e=[...document.querySelectorAll('a')].find(x=>${JSON.stringify(partes)}.every(p=>x.innerText.includes(p)));e.click()})()`); await w(300); };
const salirForzado = () => ev(`localStorage.removeItem('usfx-sesion')`);
const sinDesborde = () => ev(`document.documentElement.scrollWidth<=innerWidth+1`);

try {
  console.log('Landing');
  await tam(1280, 800); await ir('/'); await w(500); await foto('01-landing-compu');
  paso('landing carga', (await texto()).includes('Cuatro siglos'));
  paso('landing sin emojis', !/\p{Extended_Pictographic}/u.test(await texto()));
  await tam(390, 844); await ir('/'); await w(400); await foto('02-landing-celular');
  paso('landing sin desborde en celular', await sinDesborde());
  await ev(`document.querySelector('#carreras').scrollIntoView()`); await w(400); await foto('03-landing-carreras');
  paso('landing: explorador muestra el plan de estudios', await hasta(`document.querySelectorAll('#exp-panel .curso li').length >= 30`, 15000));
  // Preinscripción completa desde la landing, como un visitante sin cuenta
  await tam(1280, 800); await ir('/'); await hasta(`document.querySelector('.hc-op')`, 15000);
  await ev(`localStorage.clear(); document.querySelector('.hc-op[data-c="psicologia"]').click()`);
  paso('landing: elegir carrera en la portada lleva al paso 2', await hasta(`document.querySelector('#form-paso').textContent === 'Paso 2 de 3'`));
  await ev(`(() => { const f = document.querySelector('#form'); f.nombres.value = 'Prueba'; f.apellidos.value = 'Automática'; f.requestSubmit(); })()`); await w(600);
  await ev(`(() => { const f = document.querySelector('#form'); f.celular.value = '70012345'; f.requestSubmit(); })()`);
  paso('landing: preinscripción devuelve un código', await hasta(`/^PRE27-[0-9A-F]{6}$/.test(document.querySelector('#codigo').textContent)`));
  await foto('03b-landing-preinscrito');
  paso('landing: la preinscripción queda en la base', (await db.query(`select count(*)::int n from preinscripciones where apellidos='Automática'`)).rows[0].n === 1);
  for (const a of ['campus', 'chat', 'notas', 'matricula']) {
    const m = await (await fetch(`${BASE}/${a}/manifest.webmanifest`)).json();
    const ic = await fetch(new URL(m.icons[0].src, `${BASE}/${a}/manifest.webmanifest`));
    paso(`manifiesto de ${a} con ícono y alcance propio`, m.scope === './' && ic.ok && m.display === 'standalone');
  }
  await ir('/chat/?instalar=1'); await hayTexto('Instalar Chat USFX'); await foto('04-instalar');
  paso('guía de instalación aparece', (await texto()).includes('Instalar Chat USFX'));

  console.log('Ingreso');
  await ir('/campus/'); await hayTexto('Ingresa a tu cuenta'); await foto('05-login');
  await escribe('Usuario', 'estudiante'); await escribe('Contraseña', 'mala-clave'); await clic('Ingresar', 'button');
  paso('clave mala avisa', await hayTexto('incorrectos'));
  paso('el usuario se pudo teclear', (await ev(`document.querySelector('input[autocomplete=username]').value`)) === 'estudiante');

  console.log('Estudiante al día');
  await entrar('estudiante');
  paso('entra al campus', await hayTexto('Hola, Ana')); await w(500); await foto('06-inicio-estudiante');
  paso('sin desborde', await sinDesborde());
  await ruta('/notas'); paso('ve sus notas publicadas', await hayTexto('Primer parcial')); await foto('07-notas');
  await ruta('/kardex'); paso('kardex con materia cerrada', await hayTexto('87')); await foto('08-kardex');
  const antes = readdirSync(DESC).length;
  await clic('PDF', 'button'); await w(2500);
  paso('kardex PDF se descarga', readdirSync(DESC).some((f) => f.startsWith('Kardex') && f.endsWith('.pdf') && statSync(join(DESC, f)).size > 3000), readdirSync(DESC).join());
  await clic('Excel', 'button'); await w(3000);
  paso('kardex Excel se descarga', readdirSync(DESC).some((f) => f.startsWith('Kardex') && f.endsWith('.xlsx')), readdirSync(DESC).join());
  await ruta('/asistencia'); paso('asistencia propia', await hayTexto('Introducción a la Programación')); await foto('09-asistencia');
  await ruta('/horario'); paso('horario', await hayTexto('Lunes'));
  await ruta('/materias'); await hayTexto('Introducción'); await foto('10-materias');
  await clicVarios(['Introducción a la Programación','Paralelo A']); paso('contenido de materia', await hayTexto('Fundamentos de programación')); await foto('11-materia');
  await ruta('/inscripcion'); paso('catálogo de inscripción', await hayTexto('Redes de Computadoras')); await foto('12-inscripcion');
  await clic('Inscribirme', 'button'); await w(600);
  const insc = await texto();
  paso('prerrequisito o inscripción responde', /Inscripción registrada|prerrequisito|Inscrito/.test(insc));
  await ruta('/pagos'); paso('pagos', await hayTexto('Mensualidad de noviembre')); await foto('13-pagos');

  console.log('Chat');
  await ruta('/chat'); await hayTexto('Introducción'); await w(300); await foto('14-chat-bandeja');
  await clic('Programación · A', '.chat-item'); paso('abre conversación', await hayTexto('La clase de hoy'));
  const ta = await ev(`(()=>{const t=document.querySelector('.chat-pie textarea');t.focus();return !!t})()`);
  for (const ch of 'Mensaje de prueba') await cmd('Input.dispatchKeyEvent', { type: 'char', text: ch });
  await w(100); await clic('Enviar', 'button');
  paso('mensaje enviado', await hasta(`[...document.querySelectorAll('.burbuja.mia')].some(b=>b.innerText.includes('Mensaje de prueba')&&!b.innerText.includes('Enviando'))`));
  await archivo('.chat-pie input[type=file]', azul); paso('foto enviada y visible', await hasta(`(()=>{const i=document.querySelector('.burbuja.mia img');if(i){i.scrollIntoView();i.loading='eager'};return i&&i.complete&&i.naturalWidth>0})()`), 'no cargó');
  await archivo('.chat-pie input[type=file]', pdf); paso('PDF enviado', await hasta(`[...document.querySelectorAll('.burbuja.mia')].some(b=>b.innerText.includes('material.pdf'))`));
  await clic('Grabar audio', 'button'); await w(1300); await clic('Terminar y enviar audio', 'button');
  paso('audio enviado', await hasta(`document.querySelector('.burbuja.mia audio')`, 6000));
  await foto('15-chat-sala'); paso('chat sin desborde', await sinDesborde());
  await ev(`location.hash='#/chat'`); await w(300); await clic('Nueva conversación', 'button'); await w(200);
  for (const ch of 'laura') await cmd('Input.dispatchKeyEvent', { type: 'char', text: ch });
  paso('busca a su docente', await hayTexto('Laura Salinas'));
  await clic('Laura Salinas', '.chat-item'); paso('abre chat directo', await hasta(`location.hash.length>10`));
  await foto('16-chat-directo');

  console.log('Moroso bloqueado, paga y se libera');
  await entrar('moroso');
  await ruta('/notas'); paso('notas bloqueadas por deuda', await hayTexto('Tus notas están bloqueadas')); await foto('17-bloqueo');
  const r1 = await ev(`(async()=>{const s=JSON.parse(localStorage.getItem('usfx-sesion'));const r=await fetch('/rest/v1/notas?select=*',{headers:{authorization:'Bearer '+s.access_token,apikey:'demo'}});return (await r.json()).length})()`);
  paso('ni pidiendo a la API directo ve notas', r1 === 0, String(r1));
  await ruta('/pagos'); await hayTexto('Mensualidad de octubre'); await clic('Reportar comprobante', 'button'); await w(200);
  await escribe('N.º de transacción', 'QR-555'); await archivo('.modal input[type=file]', azul);
  await foto('18-reportar-pago'); await clic('Enviar a revisión', 'button');
  paso('comprobante enviado', await hayTexto('En revisión'));
  await ruta('/notas'); paso('sigue bloqueado mientras se revisa', await hayTexto('Tus notas están bloqueadas'));

  await entrar('finanzas');
  await ruta('/finanzas'); paso('Finanzas ve el pago', await hayTexto('Bruno Deudor')); await w(500); await foto('19-finanzas');
  await clic('Aprobar', 'button'); await hayTexto('Pago revisado');
  await entrar('moroso');
  await ruta('/notas'); paso('tras aprobar, ve sus notas', await hayTexto('Primer parcial'));

  console.log('Postulante nuevo');
  await salirForzado(); await ir('/matricula/'); await ev(`localStorage.removeItem('usfx-sesion');location.hash='#/postulacion';location.reload()`); await w(900);
  paso('registro desde postular', await hayTexto('Crea tu cuenta de postulante'));
  await escribe('Nombres', 'Nuevo'); await escribe('Apellidos', 'Postulante Prueba'); await escribe('Carnet de identidad', '7654321'); await escribe('Celular', '70000000');
  await escribe('Usuario', 'nuevo.post'); await escribe('Contraseña', 'clave-segura-1'); await foto('20-registro');
  await clic('Crear cuenta', 'button');
  paso('cuenta creada', await hayTexto('1. Tus datos'), (await texto()).slice(0, 200)); await w(400);
  await elige('Carrera a la que postulas', 'Sistemas');
  await archivo('.tarjeta input[type=file]', azul, 0); await hayTexto('Subido');
  await w(500); await archivo('.tarjeta input[type=file]', azul, 1); await w(700);
  await archivo('.tarjeta input[type=file]', azul, 2); await w(700);
  await archivo('.tarjeta input[type=file]', roja, 3); await w(900);
  paso('los 4 documentos subidos', (await ev(`[...document.querySelectorAll('.etiqueta.ok')].filter(x=>x.innerText.includes('Subido')).length`)) === 4, await ev(`document.querySelectorAll('.etiqueta.ok').length+''`));
  paso('foto con fondo rojo no alerta', !(await texto()).includes('no parece rojo'));
  await ev(`document.querySelector('input[type=checkbox]').click()`); await escribe('Escribe tu nombre completo como firma', 'Nuevo Postulante Prueba');
  await foto('21-postulacion'); await clic('Enviar postulación', 'button');
  paso('postulación enviada', await hayTexto('En revisión'), (await texto()).slice(-300));

  await entrar('admin');
  paso('panel de administración', await hayTexto('Estudiantes activos')); await w(400); await foto('22-admin-inicio');
  await ruta('/postulaciones'); await hayTexto('Nuevo Postulante'); await clic('Revisar', 'button'); await w(700); await foto('23-revisar');
  await clic('Aprobar', 'button'); paso('administración aprueba', await hayTexto('Postulación actualizada'));
  // El estudiante recién aprobado no tiene contrato: su acceso a clases está suspendido hasta firmarlo.
  await entrar('nuevo.post', 'campus', 'clave-segura-1');
  await ruta('/materias'); paso('estudiante sin contrato ve su acceso suspendido', await hayTexto('acceso a clases está suspendido'));
  await ruta('/contrato'); await hayTexto('Elige tu plan'); await clic('Plan anual', 'button');
  await ev(`[...document.querySelectorAll('label')].find(l=>l.innerText.includes('acepto sus condiciones')).querySelector('input').click()`);
  await clic('Firmar contrato', 'button');
  paso('firma su contrato y ve su plan anual', await hasta(`location.hash.startsWith('#/pagos') && document.body.innerText.includes('Plan anual')`), (await texto()).slice(0, 300));
  paso('acceso a clases habilitado tras firmar', await hayTexto('Habilitado')); await foto('23b-contrato-firmado');
  await entrar('admin');
  await ruta('/usuarios'); await hayTexto('usuarios'); await w(300); await foto('24-usuarios');
  await clic('Nuevo usuario', 'button'); await elige('Rol', 'Docente'); await escribe('Usuario', 'doc.nuevo'); await escribe('Nombres', 'Docente'); await escribe('Apellidos', 'Creado');
  await clic('Crear usuario', 'button'); paso('crea usuario y muestra clave temporal', await hayTexto('Clave temporal'));
  const clave = await ev(`document.querySelector('.modal b[style*=monospace]').innerText`);
  await clic('Cerrar', 'button');
  await ruta('/carreras'); paso('carreras', await hayTexto('Bases de Datos') || await hayTexto('Ingeniería de Sistemas')); await w(300); await foto('25-carreras');
  await ruta('/oferta'); paso('ofertas y horarios', await hayTexto('Didáctica')); await foto('26-oferta');
  await ruta('/comunicados'); await hayTexto('Destinatarios');
  await clic('Docentes', 'label'); paso('calcula audiencia', await hayTexto('Llegará a'));
  await escribe('Título', 'Reunión de docentes'); await escribe('Mensaje', 'Reunión el viernes.'); await foto('27-comunicados');
  await ev(`window.confirm=()=>true`); await clic('Enviar comunicado', 'button');
  paso('comunicado enviado', await hasta(`location.hash.startsWith('#/chat/')`));
  await ruta('/reportes'); await clic('Preparar reportes', 'button'); paso('reportes listos', await hayTexto('Nómina de estudiantes'));
  await clic('Excel', 'button'); await w(2500); paso('reporte en Excel', readdirSync(DESC).some((f) => f.startsWith('Cartera_cobros')), readdirSync(DESC).join());
  await ruta('/auditoria'); paso('auditoría registra', await hayTexto('revisar') || await hayTexto('UPDATE'));

  console.log('Primer ingreso con clave temporal');
  await entrar('doc.nuevo', 'campus', clave);
  paso('obliga a cambiar la clave', await hayTexto('Crea tu contraseña personal')); await foto('28-cambiar-clave');
  await escribe('Nueva contraseña', 'nueva-clave-1'); await escribe('Repite la contraseña', 'nueva-clave-1'); await clic('Guardar contraseña', 'button');
  paso('tras cambiarla entra', await hasta(`document.querySelector('.superior')`));

  console.log('Docente');
  await entrar('docente');
  await ruta('/materias'); await hayTexto('Introducción'); await clicVarios(['Introducción a la Programación','Paralelo A']); await hayTexto('Contenido');
  await clic('Subir material', 'button'); await archivo('.modal input[type=file]', pdf); await escribe('Título', 'Guía de la unidad'); await clic('Publicar', 'button');
  paso('docente publica un PDF', await hayTexto('Guía de la unidad')); await foto('29-contenido-docente');
  await clic('Asistencia', '.pestanas button'); paso('lista para llamar', await hayTexto('Perez Flores')); await w(200); await foto('30-llamar-lista');
  await clic('Marcar todos presentes', 'button'); paso('marca todos', await hayTexto('28 de 28 presentes') );
  await clic('Guardar asistencia', 'button'); paso('asistencia guardada', await hayTexto('Asistencia guardada'));
  await clic('PDF', 'button'); await w(2200); paso('registro de asistencia en PDF', readdirSync(DESC).some((f) => f.startsWith('Asistencia_SIS101')));
  await clic('Notas', '.pestanas button'); paso('planilla de notas', await hayTexto('Primer parcial')); await w(200); await foto('31-planilla');
  const n1 = await ev(`(()=>{const i=document.querySelector('input.nota:not([disabled])');i.focus();i.select();return i.value})()`);
  for (const ch of '77') await cmd('Input.dispatchKeyEvent', { type: 'char', text: ch });
  await clic('Guardar notas', 'button'); paso('guarda notas', await hayTexto('Notas guardadas'));
  await clic('Excel', 'button'); await w(2500); paso('planilla en Excel', readdirSync(DESC).some((f) => f.startsWith('Notas_SIS101')));
  await ruta('/perfil'); paso('hoja de vida del docente', await hayTexto('Maestría en Ingeniería de Software')); await foto('32-perfil-docente');

  console.log('Vista de compu y apps separadas');
  await tam(1366, 820);
  await ruta('/inicio'); await w(500); await foto('33-compu-docente');
  await entrar('estudiante', 'chat'); await hayTexto('Chat');
  paso('la app Chat solo muestra lo suyo', !(await ev(`document.querySelector('.lateral').innerText`)).includes('Kardex')); await hayTexto('Programación · A'); await clic('Programación · A', '.chat-item'); await hayTexto('La clase de hoy'); await w(500); await foto('34-compu-chat');
  await entrar('estudiante', 'notas'); paso('la app Notas muestra notas', (await ev(`document.querySelector('.lateral').innerText`)).includes('Kardex'));
  await ev(`document.documentElement.dataset.tema='oscuro'`); await w(300); await foto('35-oscuro');
  await ev(`delete document.documentElement.dataset.tema`);
  const inesperados = fallos.filter((f) => !/^40[0-9] \/auth\/v1\/token/.test(f) && !f.includes('/rest/v1/notas?select=*'));
  paso('sin errores de JavaScript', errores.length === 0, errores.slice(0, 3).join(' | '));
  console.log('Pedidos con error durante la prueba:', [...new Set(inesperados)].slice(0, 12));
} catch (e) { mal++; console.log('FALLÓ LA PRUEBA:', e.message); await foto('error'); console.log((await texto().catch(() => '')).slice(0, 500)); }
console.log(`\nResultado: ${ok} bien, ${mal} mal. Capturas en ${OUT}`);
ws.close(); edge.kill(); srv.close(); process.exit(mal ? 1 : 0);
