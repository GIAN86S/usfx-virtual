import { dato, sb } from '../lib/sb';
import type { Perfil } from '../lib/sesion';

export async function misOfertas(p: Perfil): Promise<any[]> {
  if (p.rol === 'docente') {
    return dato(await sb.from('v_ofertas').select('*').eq('docente_id', p.id).order('inicio', { ascending: false }).limit(100)) as any[];
  }
  const ins = dato(await sb.from('inscripciones').select('oferta_id').eq('estudiante_id', p.id).eq('estado', 'inscrito').limit(200)) as any[];
  if (!ins.length) return [];
  return dato(await sb.from('v_ofertas').select('*').in('id', ins.map((i) => i.oferta_id)).order('inicio', { ascending: false })) as any[];
}
export async function horariosDe(ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  return dato(await sb.from('horarios').select('*').in('oferta_id', ids).order('dia').order('inicio')) as any[];
}
export const carreras = async () => dato(await sb.from('carreras').select('*').order('nombre')) as any[];
export const periodos = async () => dato(await sb.from('periodos').select('*').order('inicio', { ascending: false })) as any[];

// Trae todo por páginas pequeñas: una lista larga no bloquea la base de datos ni el navegador.
export async function todas<T = any>(armar: (desde: number, hasta: number) => PromiseLike<{ data: any; error: any }>, lote = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += lote) {
    const filas = dato(await armar(i, i + lote - 1)) as T[];
    out.push(...filas);
    if (filas.length < lote) return out;
  }
}
