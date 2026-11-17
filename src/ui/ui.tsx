import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, FileText, Inbox, X } from 'lucide-react';
import { useUrl } from '../lib/archivos';
import { iniciales } from '../lib/util';
import { aExcel, aPDF, type Reporte } from '../lib/exportar';

type Toast = { id: number; texto: string; mal?: boolean };
const TC = createContext<(t: string, mal?: boolean) => void>(() => {});
export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [l, setL] = useState<Toast[]>([]);
  const aviso = useCallback((texto: string, mal?: boolean) => {
    const id = Date.now() + Math.random();
    setL((x) => [...x, { id, texto, mal }]);
    setTimeout(() => setL((x) => x.filter((t) => t.id !== id)), mal ? 6000 : 3200);
  }, []);
  return (
    <TC.Provider value={aviso}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {l.map((t) => <div key={t.id} className={'aviso-t' + (t.mal ? ' mal' : '')}>{t.mal ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<span>{t.texto}</span></div>)}
      </div>
    </TC.Provider>
  );
}
export const useAviso = () => useContext(TC);

export function Vacio({ titulo, texto, icono, accion }: { titulo: string; texto?: string; icono?: ReactNode; accion?: ReactNode }) {
  return <div className="vacio">{icono ?? <Inbox size={34} strokeWidth={1.4} />}<b>{titulo}</b>{texto && <span>{texto}</span>}{accion}</div>;
}
export const Esqueleto = ({ n = 3 }: { n?: number }) => <div className="pila" aria-busy="true" aria-label="Cargando">{Array.from({ length: n }, (_, i) => <div key={i} className="esq" />)}</div>;
export function Estado({ q, children, vacio }: { q: { isLoading: boolean; error: any; data: any; refetch?: () => void }; children: ReactNode | (() => ReactNode); vacio?: ReactNode }) {
  if (q.isLoading) return <Esqueleto />;
  if (q.error) return <div className="aviso mal"><AlertCircle size={18} /><div className="crece">{q.error.message}{q.refetch && <div style={{ marginTop: 8 }}><button className="boton ch" onClick={() => q.refetch!()}>Reintentar</button></div>}</div></div>;
  if (vacio && (!q.data || (Array.isArray(q.data) && !q.data.length))) return <>{vacio}</>;
  return <>{typeof children === 'function' ? (children as any)() : children}</>;
}
export function Modal({ titulo, cerrar, children }: { titulo: string; cerrar: () => void; children: ReactNode }) {
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <header><h2>{titulo}</h2><button className="icono-btn" onClick={cerrar} aria-label="Cerrar"><X size={20} /></button></header>
        <div>{children}</div>
      </section>
    </div>
  );
}
export function Campo({ etiqueta, ayuda, children, todo }: { etiqueta: string; ayuda?: string; children: ReactNode; todo?: boolean }) {
  return <label className={'campo' + (todo ? ' todo' : '')}><span>{etiqueta}</span>{children}{ayuda && <small>{ayuda}</small>}</label>;
}
export function Avatar({ ruta, nombre, tam = 40 }: { ruta?: string | null; nombre: string; tam?: number }) {
  const url = useUrl('perfiles', ruta);
  return <span className="avatar" style={{ width: tam, height: tam, fontSize: tam * 0.36 }} aria-hidden="true">{url ? <img src={url} alt="" loading="lazy" /> : iniciales(nombre)}</span>;
}
export function Exportar({ reporte, disabled }: { reporte: () => Reporte; disabled?: boolean }) {
  const aviso = useAviso();
  const [ocupado, setO] = useState(false);
  const correr = async (f: typeof aPDF) => {
    setO(true);
    try { await f(reporte()); aviso('Descarga lista'); } catch (e: any) { aviso(e.message, true); } finally { setO(false); }
  };
  return (
    <span className="fila" style={{ gap: 6 }}>
      <button className="boton ch" disabled={disabled || ocupado} onClick={() => correr(aPDF)}><FileText size={15} />PDF</button>
      <button className="boton ch" disabled={disabled || ocupado} onClick={() => correr(aExcel)}><FileSpreadsheet size={15} />Excel</button>
    </span>
  );
}
export function Pestanas({ opciones, valor, cambiar }: { opciones: [string, string, ReactNode?][]; valor: string; cambiar: (v: string) => void }) {
  return <div className="pestanas" role="tablist">{opciones.map(([k, t, ic]) => <button key={k} role="tab" aria-selected={valor === k} className={valor === k ? 'on' : ''} onClick={() => cambiar(k)}>{ic}{t}</button>)}</div>;
}
export const Kpi = ({ titulo, valor, nota }: { titulo: string; valor: ReactNode; nota?: string }) => <div className="tarjeta kpi"><span>{titulo}</span><b>{valor}</b>{nota && <span>{nota}</span>}</div>;
