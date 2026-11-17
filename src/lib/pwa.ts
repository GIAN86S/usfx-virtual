import { useEffect, useState } from 'react';
import { sb, VAPID } from './sb';

export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const instalada = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

let evento: any = null;
const oyentes = new Set<() => void>();
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); evento = e; oyentes.forEach((f) => f()); });
addEventListener('appinstalled', () => { evento = null; oyentes.forEach((f) => f()); });

export function useInstalar() {
  const [, tic] = useState(0);
  useEffect(() => { const f = () => tic((x) => x + 1); oyentes.add(f); return () => { oyentes.delete(f); }; }, []);
  return {
    disponible: !!evento,
    instalada: instalada(),
    ios: esIOS(),
    instalar: async () => { if (!evento) return false; evento.prompt(); const r = await evento.userChoice; evento = null; tic((x) => x + 1); return r.outcome === 'accepted'; },
  };
}

export function registrarSW() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }).catch(() => null);
}

const claveBin = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
export const pushDisponible = () => 'PushManager' in window && 'serviceWorker' in navigator && 'Notification' in window;
// En iPhone el push solo existe con la app instalada en la pantalla de inicio.
export const pushRequiereInstalar = () => esIOS() && !instalada();

export async function activarPush(usuario: string): Promise<void> {
  if (!VAPID) throw new Error('Las notificaciones aún no están configuradas en este servidor.');
  if (!pushDisponible()) throw new Error('Este navegador no permite notificaciones.');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('Permiso de notificaciones denegado. Actívalo en los ajustes del navegador.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBin(VAPID) }));
  const j = sub.toJSON();
  const { error } = await sb.from('push_suscripciones').upsert(
    { usuario_id: usuario, endpoint: j.endpoint!, p256dh: j.keys!.p256dh, auth: j.keys!.auth, agente: navigator.userAgent.slice(0, 180) }, { onConflict: 'endpoint' });
  if (error) throw new Error(error.message);
}
export async function desactivarPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await sb.from('push_suscripciones').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
}
export async function pushActivo() {
  if (!pushDisponible() || !navigator.serviceWorker.controller) return false;
  const reg = await navigator.serviceWorker.ready;
  return !!(await reg.pushManager.getSubscription());
}
