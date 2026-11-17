/// <reference lib="webworker" />
// Service worker único para todas las apps: abre rápido, funciona con mala señal y recibe notificaciones.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Las páginas: red primero, copia guardada si no hay señal.
registerRoute(({ request }) => request.mode === 'navigate', new NetworkFirst({ cacheName: 'paginas', networkTimeoutSeconds: 4 }));
// Tipos de letra y estáticos con hash: nunca cambian.
registerRoute(({ url, request }) => url.origin === self.location.origin && ['font', 'image'].includes(request.destination),
  new CacheFirst({ cacheName: 'estaticos', plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 60 })] }));
// Datos personales (API y archivos): nunca se guardan en caché del service worker.

self.addEventListener('push', (e) => {
  let d: any = {};
  try { d = e.data?.json() ?? {}; } catch { d = { titulo: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'USFX Virtual', {
    body: d.cuerpo || '', icon: new URL('icons/campus-192.png', self.registration.scope).href,
    badge: new URL('icons/campus-192.png', self.registration.scope).href, tag: d.tag, data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const ruta: string = e.notification.data?.url || '/';
  // Avisos a preinscritos ("#seccion") abren la landing; el resto, la app que corresponde.
  const app = ruta.startsWith('#') ? '' : ruta.startsWith('/chat') ? 'chat/' : 'campus/';
  const destino = new URL(app ? `${app}#${ruta}` : ruta, self.registration.scope).href;
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const raiz = new URL(self.registration.scope).pathname;
    const c = app
      ? abiertas.find((x) => x.url.includes('/' + app)) ?? abiertas[0]
      : abiertas.find((x) => new URL(x.url).pathname === raiz); // no secuestra una ventana del campus
    if (!app && !c) return self.clients.openWindow(destino);
    if (c) { await (c as WindowClient).navigate(destino).catch(() => null); return (c as WindowClient).focus(); }
    return self.clients.openWindow(destino);
  })());
});
