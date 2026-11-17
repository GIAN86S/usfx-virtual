import { createClient } from '@supabase/supabase-js';

// En modo demo no hay claves: el servidor local responde en el mismo origen.
export const DEMO = import.meta.env.VITE_DEMO === '1';
const URL_SB = import.meta.env.VITE_SUPABASE_URL || location.origin;
const CLAVE = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo';
export const DOMINIO = import.meta.env.VITE_AUTH_DOMINIO || 'usuarios.usfx.invalid';
export const VAPID = import.meta.env.VITE_VAPID_PUBLICA as string | undefined;

export const sb = createClient(URL_SB, CLAVE, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'usfx-sesion' },
  realtime: { params: { eventsPerSecond: 5 } },
});

export const correoDe = (usuario: string) => `${usuario.trim().toLowerCase()}@${DOMINIO}`;

export function mensajeError(e: any): string {
  const m: string = e?.message || String(e);
  if (/Invalid login/i.test(m)) return 'Usuario o contraseña incorrectos.';
  if (/already registered|duplicate key.*usuario/i.test(m)) return 'Ese usuario ya existe.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
  if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer esto.';
  if (/JWT expired/i.test(m)) return 'Tu sesión venció. Vuelve a entrar.';
  if (/Password should be/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.';
  return m;
}

export async function rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(mensajeError(error));
  return data as T;
}
export function dato<T>(r: { data: T | null; error: any }): T {
  if (r.error) throw new Error(mensajeError(r.error));
  return r.data as T;
}
export async function funcion<T = any>(nombre: string, body: unknown): Promise<T> {
  const { data, error } = await sb.functions.invoke(nombre, { body: body as any });
  if (error) {
    let m = error.message;
    try { const j = await (error as any).context?.json(); if (j?.error) m = j.error; } catch { /* sin detalle */ }
    throw new Error(mensajeError({ message: m }));
  }
  return data as T;
}
