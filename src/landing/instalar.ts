// Bienvenida: invita a instalar la app y a activar los avisos al entrar.
// Respeta a la persona: aparece una vez, se puede cerrar y no vuelve a insistir por 3 días.
import { ico } from './iconos';
import { SIN_SERVIDOR, VAPID, claveBin, esIOS, instalada, rpcPublica } from './preinscripcion';

const K_CERRADA = 'usfx-hoja-cerrada';
const K_AVISOS = 'usfx-avisos';          // '1' = suscrito en el servidor; 'pendiente' = permiso dado, falta suscribir
const K_INSTALADA = 'usfx-instalada';
const TRES_DIAS = 3 * 864e5;

const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

let evento: any = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); evento = e; });
addEventListener('appinstalled', () => { guardar(K_INSTALADA, '1'); marcar('instalar'); });

const hayPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const pushListo = () => !SIN_SERVIDOR && !!VAPID;
const estaInstalada = () => instalada() || leer(K_INSTALADA) === '1';
const avisosActivos = () => hayPush() && Notification.permission === 'granted' && !!leer(K_AVISOS);

function nota(texto: string, ok = false) {
  const n = $('#hoja-nota');
  n.textContent = texto;
  n.classList.toggle('ok', ok);
}
function marcar(paso: 'instalar' | 'avisos') {
  const li = $(`#paso-${paso}`);
  if (!li) return;
  li.classList.add('hecho');
  const b = li.querySelector('button')!;
  b.innerHTML = `${ico('check')} Listo`;
  b.disabled = true;
  if (document.querySelectorAll('.hoja-pasos li.hecho').length === 2) setTimeout(cerrar, 1600);
}

export function abrirHoja() {
  const h = $('#hoja');
  if (!h) return;
  h.hidden = false;
  requestAnimationFrame(() => h.classList.add('abierta'));
  document.documentElement.classList.add('con-hoja');
  try { sessionStorage.setItem('usfx-empujon', '1'); } catch { /* nada */ }
  setTimeout(() => h.querySelector<HTMLElement>('.hoja-pasos button:not(:disabled)')?.focus({ preventScroll: true }), 450);
}
function cerrar() {
  const h = $('#hoja');
  h.classList.remove('abierta');
  document.documentElement.classList.remove('con-hoja');
  guardar(K_CERRADA, String(Date.now()));
  setTimeout(() => { h.hidden = true; }, 420);
}

async function instalar() {
  if (estaInstalada()) { marcar('instalar'); return; }
  if (evento) {
    evento.prompt();
    const r = await evento.userChoice.catch(() => null);
    evento = null;
    if (r?.outcome === 'accepted') { guardar(K_INSTALADA, '1'); marcar('instalar'); nota('¡Listo! Ya tienes la USFX Virtual en tu pantalla de inicio.', true); }
    return;
  }
  if (esIOS()) { $('#ios-guia').hidden = false; nota(''); return; }
  nota('Abre el menú de tu navegador y elige «Instalar aplicación» o «Agregar a la pantalla de inicio».');
}

/** Crea la suscripción y la registra. Solo funciona con la plataforma publicada con su servidor. */
async function suscribir(): Promise<boolean> {
  if (!pushListo()) return false;
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBin(VAPID!) }));
  const j = sub.toJSON();
  let carrera: string | null = null;
  try { carrera = JSON.parse(localStorage.getItem('usfx-preins-borrador') || '{}').carrera ?? null; } catch { /* sin borrador */ }
  await rpcPublica('suscribir_visitante', { p_endpoint: j.endpoint, p_p256dh: j.keys!.p256dh, p_auth: j.keys!.auth, p_carrera: carrera });
  guardar(K_AVISOS, '1');
  return true;
}

async function activarAvisos() {
  const btn = $<HTMLButtonElement>('#btn-avisar');
  if (!hayPush()) {
    nota(esIOS() && !instalada()
      ? 'En iPhone, primero instala la app y ábrela desde su ícono. Desde ahí podrás activar los avisos.'
      : 'Este navegador no permite notificaciones. Te recomendamos abrir la página en Chrome.');
    if (esIOS()) $('#ios-guia').hidden = false;
    return;
  }
  btn.disabled = true;
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') {
      nota('No diste permiso. Puedes activarlo después desde los ajustes del navegador.');
      btn.disabled = false;
      return;
    }
    if (await suscribir()) nota('Avisos activados. En unos segundos recibirás un mensaje de bienvenida.', true);
    else { guardar(K_AVISOS, 'pendiente'); nota('Avisos permitidos en este dispositivo. Te llegarán apenas se publiquen los anuncios oficiales.', true); }
    marcar('avisos');
  } catch {
    nota('No pudimos activar los avisos ahora. Inténtalo de nuevo en un momento.');
    btn.disabled = false;
  }
}

export function iniciarBienvenida() {
  const h = $('#hoja');
  if (!h) return;
  h.querySelectorAll<HTMLElement>('[data-ico]').forEach((e) => { e.innerHTML = ico(e.dataset.ico as any); });
  h.querySelectorAll('[data-cerrar-hoja]').forEach((b) => b.addEventListener('click', cerrar));
  addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' && !h.hidden) cerrar(); });
  $('#btn-instalar').addEventListener('click', instalar);
  $('#btn-avisar').addEventListener('click', activarAvisos);
  document.querySelectorAll('[data-abrir-hoja]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); abrirHoja(); }));

  if (estaInstalada()) marcar('instalar');
  if (avisosActivos()) marcar('avisos');

  // Permiso dado antes de que existiera el servidor: se suscribe en silencio cuando ya es posible.
  if (leer(K_AVISOS) === 'pendiente' && hayPush() && Notification.permission === 'granted' && pushListo()) suscribir().catch(() => null);

  const yaTodo = estaInstalada() && avisosActivos();
  const cerradaHace = Date.now() - Number(leer(K_CERRADA) || 0);
  if (yaTodo || cerradaHace < TRES_DIAS) return;
  // Aparece cuando la persona ya vio la portada, sin taparla de entrada.
  setTimeout(() => { if (document.visibilityState === 'visible' && $('#menu-total').hidden) abrirHoja(); }, 4600);
}
