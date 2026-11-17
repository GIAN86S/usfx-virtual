// Preinscripción en 3 pasos: el corazón de la captación de postulantes.
// Habla con Supabase por REST (sin cargar supabase-js) para que la landing siga siendo liviana.
import { CARRERAS, type Carrera } from './datos';

const URL_SB = (import.meta.env.VITE_SUPABASE_URL as string) || location.origin;
const CLAVE = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'demo';
export const VAPID = import.meta.env.VITE_VAPID_PUBLICA as string | undefined;
const FORM_RESPALDO = 'https://forms.gle/gJCDN6Yaq4xi5EjF9';
// Publicada sin base de datos todavía (por ejemplo, la primera subida a GitHub Pages): se usa el formulario oficial de Google.
export const SIN_SERVIDOR = !import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_DEMO !== '1';
const K_BORRADOR = 'usfx-preins-borrador';
const K_HECHA = 'usfx-preins-hecha';
const K_ORIGEN = 'usfx-origen';

const PREFIJOS: Record<string, string> = {
  Bolivia: '+591', Argentina: '+54', Brasil: '+55', Chile: '+56', 'Perú': '+51', Paraguay: '+595',
  Ecuador: '+593', Colombia: '+57', 'España': '+34', 'Estados Unidos': '+1', 'Otro país': '+',
};

// ── Almacenamiento seguro (puede fallar en modo privado) ──
const leer = (k: string, s: Storage = localStorage) => { try { return s.getItem(k); } catch { return null; } };
const guardar = (k: string, v: string, s: Storage = localStorage) => { try { s.setItem(k, v); } catch { /* sin almacenamiento */ } };
const borrar = (k: string) => { try { localStorage.removeItem(k); } catch { /* nada */ } };

export async function rpcPublica<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CLAVE, Authorization: `Bearer ${CLAVE}` },
    body: JSON.stringify(args),
  });
  const txt = await r.text();
  let datos: any = null;
  try { datos = txt ? JSON.parse(txt) : null; } catch { throw new Error('No pudimos conectar con el servidor.'); }
  if (!r.ok) throw new Error(datos?.message || 'No pudimos conectar con el servidor.');
  return datos as T;
}

/** Guarda de dónde llegó la visita (campañas de Facebook, TikTok, QR…) para medir qué funciona. */
export function registrarOrigen() {
  if (leer(K_ORIGEN, sessionStorage)) return;
  const q = new URLSearchParams(location.search);
  const o: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) { const v = q.get(k); if (v) o[k] = v.slice(0, 100); }
  if (document.referrer && !document.referrer.startsWith(location.origin)) o.referrer = new URL(document.referrer).hostname;
  guardar(K_ORIGEN, JSON.stringify(o), sessionStorage);
}

// ── Formulario ──
let etapa = 1;
const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
let form: HTMLFormElement;

export function seleccionarCarrera(id: Carrera['id'], avanzar = true) {
  const r = form?.querySelector<HTMLInputElement>(`input[name="carrera"][value="${id}"]`);
  if (!r) return;
  r.checked = true;
  guardarBorrador();
  if (avanzar && etapa === 1 && !$('#form').hidden) irA(2);
}

export function enfocarFormulario() {
  const destino = $('#exito').hidden ? $('#form') : $('#exito');
  setTimeout(() => {
    const campo = destino.querySelector<HTMLElement>('.etapa.on input:not([type=hidden]), .etapa.on select') ?? destino;
    campo.focus({ preventScroll: true });
  }, 700);
}

function irA(n: number) {
  const atras = n < etapa;
  etapa = n;
  form.querySelectorAll<HTMLElement>('.etapa').forEach((f) => {
    const on = Number(f.dataset.etapa) === n;
    f.classList.toggle('on', on);
    f.classList.toggle('atras', on && atras);
  });
  $('#form-paso').textContent = `Paso ${n} de 3`;
  $('#form-barra').style.width = `${(n / 3) * 100}%`;
  $('#atras').hidden = n === 1;
  $('#siguiente').innerHTML = n === 3 ? 'Preinscribirme <span class="flecha" aria-hidden="true">→</span>' : 'Continuar <span class="flecha" aria-hidden="true">→</span>';
  error('');
  if (window.innerWidth < 1020) $('#form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function error(msg: string, html = false) {
  const e = $('#form-error');
  e.hidden = !msg;
  if (html) e.innerHTML = msg; else e.textContent = msg;
}

function marcar(nombre: string, mal: boolean) {
  form.querySelector(`[name="${nombre}"]`)?.closest('.cmp')?.classList.toggle('error', mal);
}

function validar(n: number): string {
  const d = new FormData(form);
  if (n === 1) {
    const ok = !!d.get('carrera');
    $('#opc-carreras').classList.toggle('error', !ok);
    return ok ? '' : 'Elige la carrera que te interesa.';
  }
  if (n === 2) {
    const nom = String(d.get('nombres') || '').trim(), ape = String(d.get('apellidos') || '').trim();
    marcar('nombres', nom.length < 2); marcar('apellidos', ape.length < 2);
    return nom.length < 2 || ape.length < 2 ? 'Escribe tus nombres y apellidos.' : '';
  }
  const cel = String(d.get('celular') || '').replace(/[^\d]/g, '');
  const correo = String(d.get('correo') || '').trim();
  const celMal = cel.length < 7 || cel.length > 13;
  const correoMal = !!correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo);
  marcar('celular', celMal); marcar('correo', correoMal);
  if (celMal) return 'Escribe un número de celular válido (con WhatsApp).';
  if (correoMal) return 'Revisa tu correo, o déjalo en blanco.';
  return '';
}

function guardarBorrador() {
  const d = Object.fromEntries([...new FormData(form).entries()].filter(([k]) => k !== 'web'));
  guardar(K_BORRADOR, JSON.stringify(d));
}
function restaurarBorrador() {
  try {
    const d = JSON.parse(leer(K_BORRADOR) || '{}');
    for (const [k, v] of Object.entries(d)) {
      const els = form.querySelectorAll<HTMLInputElement>(`[name="${k}"]`);
      els.forEach((el) => {
        if (el.type === 'radio') el.checked = el.value === v;
        else if (el.type === 'checkbox') el.checked = v === 'on';
        else el.value = String(v);
      });
    }
    actualizarPrefijo();
  } catch { /* borrador dañado: se ignora */ }
}

function actualizarPrefijo() {
  const pais = (form.querySelector<HTMLSelectElement>('[name="pais"]')!).value;
  $('#prefijo').textContent = PREFIJOS[pais] ?? '+';
}

function celularCompleto(d: FormData) {
  const crudo = String(d.get('celular') || '').trim();
  const digitos = crudo.replace(/[^\d]/g, '');
  if (crudo.startsWith('+')) return '+' + digitos;
  const pref = PREFIJOS[String(d.get('pais'))] ?? '';
  return pref.length > 1 ? pref + digitos : digitos;
}

async function enviar() {
  if (SIN_SERVIDOR) {
    error(`La preinscripción en línea se habilitará muy pronto. Mientras tanto, completa el <a href="${FORM_RESPALDO}" target="_blank" rel="noopener">formulario oficial de preinscripción</a>: toma un minuto.`, true);
    return;
  }
  const d = new FormData(form);
  const boton = $<HTMLButtonElement>('#siguiente');
  boton.disabled = true; boton.textContent = 'Enviando…';
  let origen: Record<string, string> = {};
  try { origen = JSON.parse(leer(K_ORIGEN, sessionStorage) || '{}'); } catch { /* sin origen */ }
  if (d.get('como')) origen.como = String(d.get('como'));
  try {
    const r = await rpcPublica<{ codigo: string; nombres: string; repetida?: boolean }>('preinscribir', {
      p: {
        carrera: d.get('carrera'), nombres: d.get('nombres'), apellidos: d.get('apellidos'),
        celular: celularCompleto(d), correo: d.get('correo') || null, pais: d.get('pais'), ciudad: d.get('ciudad'),
        es_profesional: d.get('es_profesional') === 'on', acepta_contacto: d.get('acepta_contacto') === 'on',
        web: d.get('web') || '', origen,
      },
    });
    const carrera = CARRERAS.find((c) => c.id === d.get('carrera'))!;
    guardar(K_HECHA, JSON.stringify({ codigo: r.codigo, nombres: r.nombres, carrera: carrera.id }));
    borrar(K_BORRADOR);
    mostrarExito(r.codigo, r.nombres, carrera, r.repetida);
    confeti();
  } catch (e: any) {
    const sinRed = /fetch|network|conectar/i.test(e.message);
    error(sinRed
      ? `No pudimos conectar con el servidor. Revisa tu internet, o usa el <a href="${FORM_RESPALDO}" target="_blank" rel="noopener">formulario alternativo</a>.`
      : e.message, sinRed);
    $('#form').classList.add('sacudir'); setTimeout(() => $('#form').classList.remove('sacudir'), 450);
  } finally {
    boton.disabled = false;
    boton.innerHTML = 'Preinscribirme <span class="flecha" aria-hidden="true">→</span>';
  }
}

function mostrarExito(codigo: string, nombres: string, carrera: Carrera, repetida = false) {
  $('#form').hidden = true;
  const ex = $('#exito'); ex.hidden = false;
  $('#exito-t').textContent = repetida ? `¡Ya te teníamos, ${nombres}!` : `¡Listo, ${nombres}! Ya estás preinscrito.`;
  $('#exito-sub').textContent = `Tu preinscripción a ${carrera.nombre} quedó registrada. Te escribiremos por WhatsApp con los requisitos, costos y fechas.`;
  $('#codigo').textContent = codigo;
  const msj = `¡Me preinscribí a ${carrera.nombre} en la USFX Virtual! Estudia una carrera de la universidad más antigua de Bolivia, 100% en línea. Preinscríbete gratis aquí: ${location.origin}${location.pathname}#preinscripcion`;
  $<HTMLAnchorElement>('#btn-compartir').href = `https://wa.me/?text=${encodeURIComponent(msj)}`;
  ex.focus({ preventScroll: true });
}

// ── Avisos push ──
export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const instalada = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
export const claveBin = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function activarAvisos() {
  const nota = $('#avisos-nota'); const btn = $<HTMLButtonElement>('#btn-avisos');
  nota.className = 'exito-nota';
  const hecha = JSON.parse(leer(K_HECHA) || '{}');
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      if (esIOS() && !instalada()) throw new Error('En iPhone, primero toca Compartir → «Agregar a inicio» y abre la página desde ese ícono. Luego activa los avisos.');
      throw new Error('Este navegador no permite notificaciones. Te avisaremos por WhatsApp.');
    }
    if (!VAPID) throw new Error('Los avisos se activarán cuando la plataforma esté publicada. Por ahora te avisaremos por WhatsApp.');
    btn.disabled = true;
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') throw new Error('No diste permiso. Puedes activarlo después desde los ajustes del navegador.');
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }));
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBin(VAPID) }));
    const j = sub.toJSON();
    await rpcPublica('suscribir_preinscripcion', { p_codigo: hecha.codigo, p_endpoint: j.endpoint, p_p256dh: j.keys!.p256dh, p_auth: j.keys!.auth });
    nota.textContent = '✓ Avisos activados. Te llegará una notificación de bienvenida en unos segundos.';
    nota.classList.add('ok');
    btn.hidden = true;
  } catch (e: any) {
    nota.textContent = e.message;
    btn.disabled = false;
  }
}

function confeti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colores = ['#e3343f', '#1f4788', '#ffffff', '#2d63c8', '#ff9aa0', '#ffd257'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('i');
    c.className = 'confeti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colores[i % colores.length];
    c.style.setProperty('--x', (Math.random() * 200 - 100) + 'px');
    c.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
    c.style.setProperty('--t', (2.2 + Math.random() * 1.8) + 's');
    c.style.animationDelay = Math.random() * 0.4 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5000);
  }
}

export const yaPreinscrito = () => !!leer(K_HECHA);

export function iniciarFormulario() {
  form = $<HTMLFormElement>('#form');
  // Opciones de carrera
  $('#opc-carreras').innerHTML = CARRERAS.map((c) => `
    <label class="opc" style="--c:${c.color}"><input type="radio" name="carrera" value="${c.id}"><span><b class="o-l">${c.nombre}</b><b class="o-c">${c.corto}</b><small>${c.facultad}</small></span></label>`).join('');

  restaurarBorrador();
  form.addEventListener('input', guardarBorrador);
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'pais') actualizarPrefijo();
    if (t.name === 'carrera') { $('#opc-carreras').classList.remove('error'); error(''); }
    if (t.closest('.cmp')) t.closest('.cmp')!.classList.remove('error');
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = validar(etapa);
    if (msg) { error(msg); form.querySelector<HTMLElement>('.etapa.on .error input, .etapa.on input')?.focus(); return; }
    if (etapa < 3) irA(etapa + 1); else enviar();
  });
  $('#atras').addEventListener('click', () => irA(etapa - 1));
  $('#btn-avisos').addEventListener('click', activarAvisos);
  $('#copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#codigo').textContent || ''); $('#copiar').textContent = '¡Copiado!'; }
    catch { $('#copiar').textContent = 'Selecciónalo'; }
    setTimeout(() => { $('#copiar').textContent = 'Copiar'; }, 1800);
  });

  // Si ya se preinscribió desde este dispositivo, le mostramos su código y el siguiente paso.
  const previa = leer(K_HECHA);
  if (previa) {
    try {
      const p = JSON.parse(previa);
      const c = CARRERAS.find((x) => x.id === p.carrera);
      if (c && p.codigo) {
        mostrarExito(p.codigo, p.nombres, c, true);
        const otra = document.createElement('button');
        otra.type = 'button'; otra.className = 'btn texto'; otra.textContent = 'Preinscribir a otra persona';
        otra.style.marginTop = '12px';
        otra.addEventListener('click', () => { borrar(K_HECHA); $('#exito').hidden = true; $('#form').hidden = false; form.reset(); irA(1); otra.remove(); });
        $('.siguiente-paso').appendChild(otra);
      }
    } catch { borrar(K_HECHA); }
  }
}

/** Prueba social con datos reales: solo se muestra cuando ya hay un número que inspire confianza. */
export async function mostrarConteo() {
  if (SIN_SERVIDOR) return;
  try {
    const n = await rpcPublica<number>('conteo_preinscripciones');
    if (typeof n === 'number' && n >= 25) {
      const p = $('#preins-social');
      p.innerHTML = `<span><b>${n.toLocaleString('es-BO')}</b> personas ya se preinscribieron a la gestión 2027</span>`;
      p.hidden = false;
    }
  } catch { /* sin conexión: no mostramos nada */ }
}
