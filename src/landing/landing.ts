import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './landing.css';
import { CARRERAS, DOCENTES, TUTORIALES, type Carrera } from './datos';
import { enfocarFormulario, iniciarFormulario, mostrarConteo, registrarOrigen, seleccionarCarrera, yaPreinscrito } from './preinscripcion';

const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
const punteroFino = matchMedia('(hover: hover) and (pointer: fine)').matches;
const BASE = import.meta.env.BASE_URL;
const img = (n: string) => `${BASE}landing/img/${n}.webp`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

registrarOrigen();

/* ═══ Títulos que se arman palabra por palabra ═══ */
function partirPalabras(el: HTMLElement) {
  let w = 0;
  const recorrer = (nodo: Node) => {
    for (const hijo of [...nodo.childNodes]) {
      if (hijo.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const parte of (hijo.textContent || '').split(/(\s+)/)) {
          if (!parte) continue;
          if (/^\s+$/.test(parte)) { frag.append(' '); continue; }
          const pal = document.createElement('span'); pal.className = 'pal';
          const dentro = document.createElement('span'); dentro.textContent = parte; dentro.style.setProperty('--w', String(w++));
          pal.append(dentro); frag.append(pal);
        }
        hijo.replaceWith(frag);
      } else if (hijo.nodeType === Node.ELEMENT_NODE) recorrer(hijo);
    }
  };
  el.setAttribute('aria-label', el.textContent?.replace(/\s+/g, ' ').trim() || '');
  recorrer(el);
  el.querySelectorAll('.pal').forEach((p) => p.setAttribute('aria-hidden', 'true'));
}
$$('[data-palabras]').forEach(partirPalabras);

/* ═══ Aparición al entrar en pantalla ═══ */
const alVer = new Map<Element, () => void>();
const io = new IntersectionObserver((entradas) => {
  for (const e of entradas) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('vis');
    alVer.get(e.target)?.();
    io.unobserve(e.target);
  }
}, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
const observar = (el: Element, fn?: () => void) => { if (fn) alVer.set(el, fn); io.observe(el); };
if (reducido) { $$('[data-rev],[data-palabras]').forEach((e) => e.classList.add('vis')); }
else $$('[data-rev],[data-palabras]').forEach((e) => observar(e));
// el héroe aparece de inmediato
requestAnimationFrame(() => $$('.hero [data-rev], .hero [data-palabras]').forEach((e) => e.classList.add('vis')));

/* ═══ Anuncio ═══ */
try { if (sessionStorage.getItem('usfx-anuncio')) $('#anuncio').hidden = true; } catch { /* nada */ }
$('#anuncio-x').addEventListener('click', () => { $('#anuncio').hidden = true; try { sessionStorage.setItem('usfx-anuncio', '1'); } catch { /* nada */ } });

/* ═══ Cabecera inteligente + progreso + sección activa ═══ */
const cab = $('#cab'); const prog = $('#progreso'); const menuTotal = $('#menu-total');
let ultimoY = scrollY, pendiente = false;
const alDesplazar = () => {
  pendiente = false;
  const y = scrollY;
  cab.classList.toggle('solida', y > 40 || !menuTotal.hidden);
  cab.classList.toggle('oculta', y > 500 && y > ultimoY + 4 && menuTotal.hidden === true);
  if (y < ultimoY - 4) cab.classList.remove('oculta');
  ultimoY = y;
  const alto = document.documentElement.scrollHeight - innerHeight;
  prog.style.transform = `scaleX(${alto > 0 ? y / alto : 0})`;
  expandir(); avanzarPasos();
};
addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(alDesplazar); } }, { passive: true });

const enlacesNav = $$<HTMLAnchorElement>('.nav a');
const ioNav = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) enlacesNav.forEach((a) => a.classList.toggle('activo', a.hash === '#' + e.target.id));
}, { rootMargin: '-45% 0px -50% 0px' });
enlacesNav.forEach((a) => { const s = document.querySelector(a.hash); if (s) ioNav.observe(s); });

/* ═══ Menú a pantalla completa ═══ */
const btnMenu = $('#btn-menu');
const abrirMenu = (abrir: boolean) => {
  menuTotal.hidden = !abrir;
  btnMenu.setAttribute('aria-expanded', String(abrir));
  btnMenu.querySelector('.ocultar-movil')!.textContent = abrir ? 'Cerrar' : 'Menú';
  document.documentElement.style.overflow = abrir ? 'hidden' : '';
  cab.classList.toggle('solida', abrir || scrollY > 40);
  if (abrir) menuTotal.querySelector<HTMLElement>('a')?.focus();
};
btnMenu.addEventListener('click', () => abrirMenu(menuTotal.hidden === true));
menuTotal.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) abrirMenu(false); });
addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' && !menuTotal.hidden) { abrirMenu(false); btnMenu.focus(); } });

/* ═══ Héroe: fotos con movimiento lento, indicadores y pausa ═══ */
const hero = $('.hero'); const slides = $$('.slide'); const indic = $('#indic'); const cap = $('#cap');
const DURACION = 7000;
let actual = 0, temporizador = 0, pausado = reducido;
indic.innerHTML = slides.map((_, i) => `<button aria-label="Ver fotografía ${i + 1}" style="--t:${DURACION}ms"><i></i></button>`).join('');
const botones = $$<HTMLButtonElement>('button', indic);
const mostrar = (i: number) => {
  slides[actual].classList.remove('on'); botones[actual].classList.remove('on');
  actual = (i + slides.length) % slides.length;
  slides[actual].classList.add('on');
  botones[actual].classList.remove('on'); void botones[actual].offsetWidth; botones[actual].classList.add('on');
  cap.textContent = slides[actual].dataset.cap || '';
  programar();
};
const programar = () => { clearTimeout(temporizador); if (!pausado) temporizador = window.setTimeout(() => mostrar(actual + 1), DURACION); };
botones.forEach((b, i) => b.addEventListener('click', () => mostrar(i)));
const pausar = (p: boolean) => {
  pausado = p; hero.classList.toggle('pausado', p);
  $('#pausa').setAttribute('aria-pressed', String(p));
  $('#pausa').setAttribute('aria-label', p ? 'Reanudar presentación' : 'Pausar presentación');
  programar();
};
$('#pausa').addEventListener('click', () => pausar(!pausado));
botones[0].classList.add('on');
pausar(reducido);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(temporizador); else programar(); });

// Tarjeta «¿Qué te gustaría estudiar?»: el primer micro-compromiso.
$('#hc-opciones').innerHTML = CARRERAS.map((c) => `<button class="hc-op" data-c="${c.id}" style="--c:${c.color}"><i></i>${esc(c.corto)}</button>`).join('');
$('#hc-opciones').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-c]'); if (!b) return;
  irAlFormulario(b.dataset.c as Carrera['id']);
});

/* ═══ Ir al formulario desde cualquier botón ═══ */
function irAlFormulario(carrera?: Carrera['id']) {
  if (carrera) seleccionarCarrera(carrera);
  $('#preinscripcion').scrollIntoView({ behavior: reducido ? 'auto' : 'smooth' });
  enfocarFormulario();
}
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-ir-form]');
  if (!a) return;
  e.preventDefault(); ocultarEmpujon(); irAlFormulario();
});

/* ═══ Imagen que se expande con el scroll (Stanford) ═══ */
const expansor = $('#expansor');
function expandir() {
  if (reducido) return;
  const r = expansor.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.9)));
  expansor.style.setProperty('--p', p.toFixed(3));
}

/* ═══ Odómetro (dígitos que ruedan) ═══ */
$$('.odometro').forEach((b) => {
  const valor = b.dataset.valor!; const suf = b.dataset.sufijo || '';
  b.setAttribute('aria-label', valor + suf);
  b.innerHTML = [...valor].map((d, i) => `<span class="odo-d" aria-hidden="true"><span style="--dd:${i * 0.12}s" data-d="${d}">${'0123456789'.split('').map((n) => `<i>${n}</i>`).join('')}</span></span>`).join('')
    + (suf ? `<span class="suf" aria-hidden="true">${suf}</span>` : '');
  const girar = () => b.querySelectorAll<HTMLElement>('[data-d]').forEach((s) => { s.style.transform = `translateY(-${Number(s.dataset.d)}em)`; });
  if (reducido) girar(); else observar(b, girar);
});

/* ═══ Explorador de carreras + buscador de materias ═══ */
const tabs = $('#exp-tabs'); const panel = $('#exp-panel');
tabs.innerHTML = CARRERAS.map((c, i) => `
  <button class="exp-tab" role="tab" id="tab-${c.id}" aria-controls="exp-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-c="${c.id}" style="--c:${c.color}">
    <i></i><span><b>${esc(c.nombre)}</b><small>${esc(c.facultad)}</small></span>
  </button>`).join('');
const ROMANOS = ['Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto'];
function pintarCarrera(id: Carrera['id'], cursoAbierto = 0) {
  const c = CARRERAS.find((x) => x.id === id)!;
  $$<HTMLButtonElement>('.exp-tab', tabs).forEach((t) => { const on = t.dataset.c === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
  panel.setAttribute('aria-labelledby', 'tab-' + id);
  panel.style.setProperty('--c', c.color);
  const materias = c.plan.reduce((n, cur) => n + cur.length, 0);
  panel.innerHTML = `
    <div class="exp-media"><img src="${img(c.img)}" alt="" width="900" height="640"><div class="exp-media-txt"><p>${esc(c.facultad)}</p><h3>${esc(c.nombre)}</h3></div></div>
    <div class="exp-cuerpo">
      <div>
        <p class="exp-resumen">${esc(c.resumen)}</p>
        <p class="exp-chips">${[...c.destacados, 'Modalidad anual', `${materias} materias`].filter((v, i, a) => a.indexOf(v) === i).map((d) => `<span>${esc(d)}</span>`).join('')}</p>
        <ul class="exp-perfil">${c.perfil.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        <div class="exp-acc">
          <button class="btn rojo" data-preins="${c.id}">Preinscribirme a ${esc(c.corto)} <span class="flecha" aria-hidden="true">→</span></button>
          <a class="btn linea" href="${c.campus}" target="_blank" rel="noopener">Campus virtual</a>
        </div>
      </div>
      <div class="exp-plan">
        <h4>Plan de estudios · ${c.plan.length} cursos</h4>
        ${c.plan.map((curso, i) => `
          <details class="curso" ${i === cursoAbierto ? 'open' : ''} data-curso="${i}">
            <summary>${ROMANOS[i]} curso <small>${curso.length} ${curso.length === 1 ? 'materia' : 'materias'}</small></summary>
            <ul>${curso.map(([s, n]) => `<li data-sig="${esc(s)}"><code>${esc(s)}</code>${esc(n)}</li>`).join('')}</ul>
          </details>`).join('')}
      </div>
    </div>`;
}
tabs.addEventListener('click', (e) => { const t = (e.target as HTMLElement).closest<HTMLButtonElement>('.exp-tab'); if (t) pintarCarrera(t.dataset.c as Carrera['id']); });
tabs.addEventListener('keydown', (e) => {
  const lista = $$<HTMLButtonElement>('.exp-tab', tabs); const i = lista.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  const sig = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  if (!sig) return;
  e.preventDefault();
  const t = lista[(i + sig + lista.length) % lista.length]; t.focus(); pintarCarrera(t.dataset.c as Carrera['id']);
});
panel.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-preins]'); if (b) irAlFormulario(b.dataset.preins as Carrera['id']); });
pintarCarrera('derecho');
$$<HTMLAnchorElement>('[data-carrera]').forEach((a) => a.addEventListener('click', () => pintarCarrera(a.dataset.carrera as Carrera['id'])));

const indice = CARRERAS.flatMap((c) => c.plan.flatMap((curso, ci) => curso.map(([s, n]) => ({ c, ci, s, n, clave: sinTildes(`${s} ${n}`) }))));
const busca = $<HTMLInputElement>('#busca'); const res = $('#busca-res');
let tBusca = 0;
busca.addEventListener('input', () => {
  clearTimeout(tBusca);
  tBusca = window.setTimeout(() => {
    const q = sinTildes(busca.value.trim());
    if (q.length < 2) { res.hidden = true; return; }
    const hallados = indice.filter((x) => x.clave.includes(q)).slice(0, 14);
    const resaltar = (n: string) => {
      const i = sinTildes(n).indexOf(q);
      return i < 0 ? esc(n) : esc(n.slice(0, i)) + '<mark>' + esc(n.slice(i, i + q.length)) + '</mark>' + esc(n.slice(i + q.length));
    };
    res.innerHTML = hallados.length
      ? hallados.map((x) => `<button data-c="${x.c.id}" data-ci="${x.ci}" data-s="${esc(x.s)}"><span class="sig">${esc(x.s)}</span><span>${resaltar(x.n)}</span><span class="car" style="--c:${x.c.color}">${esc(x.c.corto)}</span></button>`).join('')
      : `<p class="nada">No encontramos «${esc(busca.value.trim())}». Prueba con otra palabra.</p>`;
    res.hidden = false;
  }, 120);
});
res.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!b) return;
  pintarCarrera(b.dataset.c as Carrera['id'], Number(b.dataset.ci));
  res.hidden = true;
  const li = panel.querySelector<HTMLElement>(`li[data-sig="${CSS.escape(b.dataset.s!)}"]`);
  li?.classList.add('brillo');
  (li ?? panel).scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'center' });
});
document.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.buscador')) res.hidden = true; });
busca.addEventListener('keydown', (e) => { if (e.key === 'Escape') { res.hidden = true; } if (e.key === 'ArrowDown') { e.preventDefault(); res.querySelector<HTMLElement>('button')?.focus(); } });

/* ═══ Bento: reflejo que sigue al cursor ═══ */
if (punteroFino) $$('.foco').forEach((el) => el.addEventListener('pointermove', (e) => {
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`); el.style.setProperty('--my', `${e.clientY - r.top}px`);
}));
$('#bt-caras').innerHTML = DOCENTES.slice(2, 8).map((d) => `<img src="${img(d.img)}" alt="" width="44" height="44" loading="lazy">`).join('');

/* ═══ Docentes: carrusel con arrastre ═══ */
const carr = $('#carrusel');
carr.innerHTML = DOCENTES.map((d) => `
  <a class="doc" href="${d.url}" target="_blank" rel="noopener" draggable="false">
    <img src="${img(d.img)}" alt="" width="300" height="300" loading="lazy" draggable="false">
    <b>${esc(d.nombre)}</b><span>${esc(d.rol)}</span>
    <span class="ver"><i aria-hidden="true">→</i>Ver trayectoria</span>
  </a>`).join('');
const paso = () => (carr.querySelector<HTMLElement>('.doc')?.offsetWidth ?? 280) + 18;
const prev = $<HTMLButtonElement>('#doc-prev'), next = $<HTMLButtonElement>('#doc-next');
const estadoCarr = () => { prev.disabled = carr.scrollLeft < 8; next.disabled = carr.scrollLeft + carr.clientWidth >= carr.scrollWidth - 8; };
prev.addEventListener('click', () => carr.scrollBy({ left: -paso() * 2, behavior: 'smooth' }));
next.addEventListener('click', () => carr.scrollBy({ left: paso() * 2, behavior: 'smooth' }));
carr.addEventListener('scroll', estadoCarr, { passive: true }); estadoCarr();
carr.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') carr.scrollBy({ left: paso(), behavior: 'smooth' }); if (e.key === 'ArrowLeft') carr.scrollBy({ left: -paso(), behavior: 'smooth' }); });
if (punteroFino) {
  let x0 = 0, s0 = 0, arrastra = false, movio = false;
  carr.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; arrastra = true; movio = false; x0 = e.clientX; s0 = carr.scrollLeft; });
  addEventListener('pointermove', (e: PointerEvent) => {
    if (!arrastra) return;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 5) { movio = true; carr.classList.add('arrastrando'); }
    carr.scrollLeft = s0 - dx;
  });
  addEventListener('pointerup', () => {
    if (!arrastra) return; arrastra = false;
    if (movio) { carr.classList.remove('arrastrando'); const p = paso(); carr.scrollTo({ left: Math.round(carr.scrollLeft / p) * p, behavior: 'smooth' }); }
  });
}

/* ═══ Admisión: línea que se llena y pasos que se encienden ═══ */
const pasos = $('#adm-pasos'); const itemsPaso = $$('.paso', pasos);
function avanzarPasos() {
  const r = pasos.getBoundingClientRect();
  const marca = innerHeight * 0.6;
  const avance = Math.min(1, Math.max(0, (marca - r.top) / r.height));
  pasos.style.setProperty('--avance', avance.toFixed(3));
  itemsPaso.forEach((p) => p.classList.toggle('activo', p.getBoundingClientRect().top < marca));
}

/* ═══ Tutoriales en ventana (sin salir de la página) ═══ */
$('#tutos').innerHTML = TUTORIALES.map((t, i) => `
  <button class="tuto" data-rev style="--d:${i * 0.06}s" data-video="${t.id}" aria-label="Ver tutorial: ${esc(t.titulo)}">
    <span class="tuto-img"><img src="${BASE}landing/tutoriales/${t.img}" alt="" width="480" height="270" loading="lazy"><span class="tuto-play" aria-hidden="true"></span></span>
    <span class="tuto-txt"><small>${esc(t.paso)}</small><b>${esc(t.titulo)}</b></span>
  </button>`).join('');
$$('#tutos [data-rev]').forEach((e) => (reducido ? e.classList.add('vis') : observar(e)));
const video = $<HTMLDialogElement>('#video'); const iframe = $<HTMLIFrameElement>('#video-iframe');
$('#tutos').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-video]'); if (!b) return;
  iframe.src = `https://www.youtube-nocookie.com/embed/${b.dataset.video}?autoplay=1&rel=0&modestbranding=1`;
  video.showModal();
});
const cerrarVideo = () => { video.close(); };
video.addEventListener('close', () => { iframe.src = 'about:blank'; });
$('#video-x').addEventListener('click', cerrarVideo);
video.addEventListener('click', (e) => { if (e.target === video) cerrarVideo(); });

/* ═══ Preguntas: una abierta a la vez ═══ */
const faqs = $$<HTMLDetailsElement>('#faq details');
faqs.forEach((d) => d.addEventListener('toggle', () => { if (d.open) faqs.forEach((o) => { if (o !== d) o.open = false; }); }));

/* ═══ Botones magnéticos ═══ */
if (punteroFino && !reducido) $$('.magnetico').forEach((b) => {
  b.addEventListener('pointermove', (e) => {
    const r = b.getBoundingClientRect();
    b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.28}px)`;
  });
  b.addEventListener('pointerleave', () => { b.style.transform = ''; });
});

/* ═══ Barra móvil fija: visible fuera del héroe y lejos del formulario ═══ */
const barra = $('#barra-movil');
let heroVisible = true, formVisible = false;
const actualizarBarra = () => barra.classList.toggle('ver', !heroVisible && !formVisible);
new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; actualizarBarra(); }, { threshold: 0.05 }).observe(hero);
new IntersectionObserver(([e]) => { formVisible = e.isIntersecting; actualizarBarra(); }, { threshold: 0.05 }).observe($('#preinscripcion'));

/* ═══ Empujón antes de irse (una vez por sesión, nunca a quien ya se preinscribió) ═══ */
const empujon = $('#empujon');
const yaVio = () => { try { return !!sessionStorage.getItem('usfx-empujon'); } catch { return true; } };
function mostrarEmpujon() {
  if (yaVio() || yaPreinscrito() || formVisible || !menuTotal.hidden) return;
  try { sessionStorage.setItem('usfx-empujon', '1'); } catch { /* nada */ }
  empujon.hidden = false;
}
function ocultarEmpujon() { empujon.hidden = true; }
$('#empujon-x').addEventListener('click', ocultarEmpujon);
const t0 = Date.now();
if (punteroFino) document.addEventListener('mouseout', (e) => { if (!e.relatedTarget && e.clientY <= 0 && Date.now() - t0 > 15000) mostrarEmpujon(); });
else setTimeout(() => { if (scrollY > innerHeight * 2) mostrarEmpujon(); }, 50000);

/* ═══ Formulario y prueba social ═══ */
iniciarFormulario();
observar($('#preinscripcion .preins-txt'), mostrarConteo);

alDesplazar();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => null);
}
