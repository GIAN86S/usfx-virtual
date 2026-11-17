export type Rol = 'sistemas' | 'admin' | 'finanzas' | 'director' | 'docente' | 'estudiante' | 'postulante';
export const ROL_NOMBRE: Record<Rol, string> = { sistemas: 'Administrador de sistemas', admin: 'Administración central', finanzas: 'Finanzas', director: 'Dirección de carrera', docente: 'Docente', estudiante: 'Estudiante', postulante: 'Postulante' };
export const MODALIDAD: Record<string, string> = { modular: 'Modular (una materia al mes)', semestral: 'Semestral', anual: 'Anual' };
export const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const fFecha = new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/La_Paz' });
const fHora = new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' });
// Las fechas sin hora son fechas locales: se fijan a mediodía para que nunca cambien de día.
const aDate = (d: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00:00' : d);
export const fecha = (d?: string | null) => (d ? fFecha.format(aDate(d)) : '—');
export const hora = (d?: string | null) => (d ? fHora.format(new Date(d)) : '');
export const bs = (n: number | string | null | undefined) => 'Bs ' + Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n: number) => Number(n || 0).toLocaleString('es-BO');
export const hoyISO = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
export const iniciales = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase();
export const nombreDe = (p?: { nombres?: string; apellidos?: string } | null) => (p ? `${p.nombres ?? ''} ${p.apellidos ?? ''}`.trim() : '');
export const tamano = (b?: number | null) => (!b ? '' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
export const seguro = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
export function tipoDeArchivo(mime: string, nombre = ''): 'imagen' | 'video' | 'audio' | 'pdf' | 'archivo' {
  if (mime.startsWith('image/')) return 'imagen';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || /\.pdf$/i.test(nombre)) return 'pdf';
  return 'archivo';
}
// CSV tolerante: admite coma o punto y coma, y comillas (Excel en español usa punto y coma).
export function leerCSV(texto: string): Record<string, string>[] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return [];
  const sep = (lineas[0].match(/;/g)?.length ?? 0) >= (lineas[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const partir = (l: string) => {
    const out: string[] = []; let c = '', q = false;
    for (let i = 0; i < l.length; i++) {
      if (l[i] === '"') { if (q && l[i + 1] === '"') { c += '"'; i++; } else q = !q; }
      else if (l[i] === sep && !q) { out.push(c); c = ''; } else c += l[i];
    }
    out.push(c); return out.map((x) => x.trim());
  };
  const cab = partir(lineas[0]).map((x) => x.toLowerCase());
  return lineas.slice(1).map((l) => { const v = partir(l); return Object.fromEntries(cab.map((k, i) => [k, v[i] ?? ''])); });
}
