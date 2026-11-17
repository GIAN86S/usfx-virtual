import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellOff, BookOpen, Building2, File as FileIco, FileText, Megaphone, Mic, Paperclip, Search, Send, Square, SquarePen, Trash2, Users, X } from 'lucide-react';
import { usePerfil } from '../lib/sesion';
import { dato, mensajeError, rpc, sb } from '../lib/sb';
import { subir, useUrl } from '../lib/archivos';
import { fecha, hora, ROL_NOMBRE, tamano, tipoDeArchivo } from '../lib/util';
import { Avatar, Modal, useAviso, Vacio } from '../ui/ui';

const LOTE = 40;
const ICONO_TIPO: Record<string, any> = { materia: BookOpen, carrera: Building2, oficial: Megaphone, grupo: Users };

export default function Chat() {
  const { id } = useParams();
  return (
    <div className="chat" data-sala={id ? 'si' : 'no'}>
      <Bandeja actual={id} />
      <div className="chat-sala">{id ? <Sala key={id} id={id} /> : <div style={{ margin: 'auto' }}><Vacio titulo="Elige una conversación" texto="Tus mensajes oficiales aparecen aquí." /></div>}</div>
    </div>
  );
}

function Bandeja({ actual }: { actual?: string }) {
  const [buscar, setB] = useState(''); const [nueva, setN] = useState(false);
  // La bandeja se actualiza por sondeo espaciado y con variación al azar: 20.000 personas nunca consultan a la vez.
  const q = useQuery({
    queryKey: ['bandeja'], refetchInterval: () => 45_000 + Math.random() * 30_000, refetchOnWindowFocus: true,
    queryFn: () => rpc<any[]>('mis_conversaciones', { p_limite: 60 }),
  });
  const l = (q.data ?? []).filter((c) => (c.titulo ?? '').toLowerCase().includes(buscar.toLowerCase()));
  return (
    <aside className="chat-lista">
      <div className="fila" style={{ padding: '9px 11px', borderBottom: '1px solid var(--linea)' }}>
        <label className="fila crece" style={{ gap: 6 }}><Search size={17} className="tenue" /><input className="ent" style={{ minHeight: 38, padding: '5px 8px' }} aria-label="Buscar conversación" placeholder="Buscar" value={buscar} onChange={(e) => setB(e.target.value)} /></label>
        <button className="icono-btn" aria-label="Nueva conversación" title="Nueva conversación" onClick={() => setN(true)}><SquarePen size={20} /></button>
      </div>
      <div className="chat-items">
        {q.isLoading ? <div className="esq" style={{ margin: 10 }} /> : l.length === 0 ? <Vacio titulo="Sin conversaciones" texto="Empieza una con el botón de arriba." /> : l.map((c) => {
          const I = ICONO_TIPO[c.tipo];
          return (
            <Link key={c.id} className={'chat-item' + (c.id === actual ? ' on' : '')} to={`/chat/${c.id}`}>
              {I ? <span className="avatar" style={{ width: 44, height: 44 }}><I size={20} /></span> : <Avatar ruta={c.foto_path} nombre={c.titulo ?? ''} tam={44} />}
              <div className="crece">
                <div className="fila entre" style={{ gap: 6 }}><b className="corta">{c.titulo}</b><span className="tenue nowrap" style={{ fontSize: 11.5 }}>{hoyOFecha(c.ultimo_en)}</span></div>
                <div className="fila entre" style={{ gap: 6 }}><span className="tenue chico corta">{c.ultimo_resumen ?? 'Sin mensajes'}</span>{c.silenciada && <BellOff size={13} className="tenue" />}{c.no_leidos > 0 && <span className="etiqueta" style={{ background: 'var(--azul)', color: '#fff', padding: '0 7px' }}>{c.no_leidos >= 99 ? '99+' : c.no_leidos}</span>}</div>
              </div>
            </Link>
          );
        })}
      </div>
      {nueva && <NuevaConversacion cerrar={() => setN(false)} />}
    </aside>
  );
}
const hoyOFecha = (d: string) => (new Date(d).toDateString() === new Date().toDateString() ? hora(d) : fecha(d).slice(0, 6));

function NuevaConversacion({ cerrar }: { cerrar: () => void }) {
  const [t, setT] = useState(''); const nav = useNavigate(); const aviso = useAviso(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['buscar-personas', t], enabled: t.trim().length >= 2, queryFn: () => rpc<any[]>('buscar_personas', { q: t }) });
  const abrir = async (id: string) => {
    try { const c = await rpc<string>('abrir_directa', { otro: id }); qc.invalidateQueries({ queryKey: ['bandeja'] }); cerrar(); nav(`/chat/${c}`); }
    catch (e: any) { aviso(e.message, true); }
  };
  return (
    <Modal titulo="Nueva conversación" cerrar={cerrar}>
      <div className="pila">
        <input className="ent" autoFocus aria-label="Buscar persona" placeholder="Nombre de la persona" value={t} onChange={(e) => setT(e.target.value)} />
        <span className="tenue chico">Solo aparecen personas con las que puedes hablar: tus docentes, compañeros de materia y administración.</span>
        {(q.data ?? []).map((p) => (
          <button key={p.id} className="chat-item" onClick={() => abrir(p.id)}>
            <Avatar ruta={p.foto_path} nombre={p.nombre} tam={38} /><div className="crece"><div className="neg corta">{p.nombre}</div><div className="tenue chico">{ROL_NOMBRE[p.rol as keyof typeof ROL_NOMBRE]}</div></div>
          </button>
        ))}
        {q.data?.length === 0 && <Vacio titulo="Sin resultados" />}
      </div>
    </Modal>
  );
}

/* ─── Sala ─── */
interface Msg { id: number; conversacion_id: string; autor_id: string; autor_nombre: string; tipo: string; cuerpo: string | null; adjunto: any; creado_en: string; eliminado?: boolean; _local?: 'enviando' | 'error'; _archivo?: File | Blob }

function Sala({ id }: { id: string }) {
  const p = usePerfil(); const qc = useQueryClient(); const aviso = useAviso();
  const caja = useRef<HTMLDivElement>(null);
  const [nuevos, setNuevos] = useState<Msg[]>([]);
  const [locales, setLocales] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const ultimoRef = useRef(0);

  const info = useQuery({
    queryKey: ['conv', id],
    queryFn: async () => { const l = await rpc<any[]>('mis_conversaciones', { p_limite: 100 }); return l.find((c) => c.id === id) ?? dato(await sb.from('conversaciones').select('*').eq('id', id).single()); },
  });
  const hist = useInfiniteQuery({
    queryKey: ['mensajes', id], initialPageParam: null as number | null, staleTime: Infinity,
    queryFn: async ({ pageParam }) => {
      // Paginación por id, nunca OFFSET: abrir un chat con un millón de mensajes cuesta lo mismo.
      let c = sb.from('mensajes').select('id,conversacion_id,autor_id,autor_nombre,tipo,cuerpo,adjunto,creado_en,eliminado').eq('conversacion_id', id).order('id', { ascending: false }).limit(LOTE);
      if (pageParam) c = c.lt('id', pageParam);
      return dato(await c) as Msg[];
    },
    getNextPageParam: (u) => (u.length === LOTE ? u[u.length - 1].id : undefined),
  });
  const viejos = (hist.data?.pages ?? []).flat();
  const vistos = new Set<number>();
  const todos = [...[...viejos].reverse(), ...nuevos].filter((m) => (vistos.has(m.id) ? false : (vistos.add(m.id), true)));
  const ultimoId = todos.length ? todos[todos.length - 1].id : 0;
  ultimoRef.current = ultimoId;

  const alFondo = useCallback(() => { const c = caja.current; if (c) c.scrollTop = c.scrollHeight; }, []);
  const n = todos.length + locales.length;
  const previo = useRef(0);
  useLayoutEffect(() => { if (n > previo.current && (previo.current === 0 || cercaDelFondo(caja.current))) alFondo(); previo.current = n; }, [n, alFondo]);

  const marcar = useCallback((u: number) => {
    if (!u) return;
    rpc('marcar_leido', { p_conv: id, p_ultimo: u }).then(() => qc.invalidateQueries({ queryKey: ['bandeja'] })).catch(() => null);
  }, [id, qc]);
  useEffect(() => { marcar(ultimoId); }, [ultimoId, marcar]);

  // Tiempo real por canal privado; si la conexión no entra (o el servidor está al tope), pasa a sondeo y el chat sigue funcionando.
  useEffect(() => {
    let vivo = false, parar = false;
    const canal = sb.channel(`conv:${id}`, { config: { private: true } })
      .on('broadcast', { event: 'nuevo' }, ({ payload }) => setNuevos((x) => (x.some((m) => m.id === payload.id) ? x : [...x, payload as Msg])))
      .subscribe((s) => { vivo = s === 'SUBSCRIBED'; });
    const sondear = async () => {
      if (parar || vivo || document.hidden) return;
      const { data } = await sb.from('mensajes').select('id,conversacion_id,autor_id,autor_nombre,tipo,cuerpo,adjunto,creado_en,eliminado').eq('conversacion_id', id).gt('id', ultimoRef.current).order('id').limit(50);
      if (data?.length) setNuevos((x) => [...x, ...(data as Msg[]).filter((m) => !x.some((y) => y.id === m.id))]);
    };
    const t = setInterval(sondear, 5000 + Math.random() * 2000);
    return () => { parar = true; clearInterval(t); sb.removeChannel(canal); };
  }, [id]);

  const enviar = async (m: Partial<Msg>, archivo?: File | Blob, nombreArchivo?: string) => {
    const idLocal = -Date.now();
    const loc: Msg = { id: idLocal, conversacion_id: id, autor_id: p.id, autor_nombre: '', tipo: m.tipo ?? 'texto', cuerpo: m.cuerpo ?? null, adjunto: m.adjunto ?? null, creado_en: new Date().toISOString(), _local: 'enviando', _archivo: archivo };
    setLocales((l) => [...l, loc]);
    setTimeout(alFondo, 30);
    try {
      let adjunto = m.adjunto ?? null;
      if (archivo) {
        const ruta = await subir('chat', id, archivo, nombreArchivo ?? (archivo as File).name ?? 'archivo');
        adjunto = { ruta, nombre: nombreArchivo ?? (archivo as File).name ?? 'archivo', mime: archivo.type, tamano: archivo.size };
      }
      const r = dato(await sb.from('mensajes').insert({ conversacion_id: id, autor_id: p.id, tipo: m.tipo ?? 'texto', cuerpo: m.cuerpo ?? null, adjunto }).select('id,conversacion_id,autor_id,autor_nombre,tipo,cuerpo,adjunto,creado_en,eliminado').single()) as Msg;
      setNuevos((x) => (x.some((y) => y.id === r.id) ? x : [...x, r]));
      setLocales((l) => l.filter((y) => y.id !== idLocal));
    } catch (e) {
      setLocales((l) => l.map((y) => (y.id === idLocal ? { ...y, _local: 'error' } : y)));
      aviso(mensajeError(e), true);
    }
  };
  const mandarTexto = () => { const t = texto.trim(); if (!t) return; setTexto(''); enviar({ tipo: 'texto', cuerpo: t }); };
  const alScroll = () => { const c = caja.current; if (c && c.scrollTop < 60 && hist.hasNextPage && !hist.isFetchingNextPage) { const h = c.scrollHeight; hist.fetchNextPage().then(() => requestAnimationFrame(() => { if (caja.current) caja.current.scrollTop = caja.current.scrollHeight - h; })); } };
  const c = info.data;
  const puede = c?.puede_publicar !== false;
  const borrar = async (mid: number) => {
    if (!confirm('¿Eliminar este mensaje?')) return;
    try { await rpc('eliminar_mensaje', { p_id: mid }); setNuevos((x) => x.map((m) => (m.id === mid ? { ...m, eliminado: true, cuerpo: null, adjunto: null } : m))); qc.setQueryData(['mensajes', id], (d: any) => d && ({ ...d, pages: d.pages.map((pg: Msg[]) => pg.map((m) => (m.id === mid ? { ...m, eliminado: true, cuerpo: null, adjunto: null } : m))) })); }
    catch (e: any) { aviso(e.message, true); }
  };
  return (
    <>
      <header className="chat-cab">
        <Link to="/chat" className="icono-btn" aria-label="Volver a conversaciones"><ArrowLeft size={20} /></Link>
        <Avatar ruta={c?.foto_path} nombre={c?.titulo ?? ''} tam={38} />
        <div className="crece"><b className="corta" style={{ display: 'block' }}>{c?.titulo ?? ''}</b><span className="tenue chico">{c?.tipo === 'oficial' ? 'Comunicado oficial' : c?.tipo === 'materia' ? 'Grupo de la materia' : ''}</span></div>
      </header>
      <div className="chat-msgs" ref={caja} onScroll={alScroll} role="log" aria-live="polite">
        {hist.isFetchingNextPage && <div className="tenue chico" style={{ textAlign: 'center' }}>Cargando mensajes anteriores…</div>}
        {todos.map((m, i) => {
          const mio = m.autor_id === p.id;
          const cambia = i === 0 || todos[i - 1].autor_id !== m.autor_id;
          return <Burbuja key={m.id} m={m} mio={mio} nombre={!mio && cambia && c?.tipo !== 'directa'} borrar={() => borrar(m.id)} />;
        })}
        {locales.map((m) => <Burbuja key={m.id} m={m} mio nombre={false} reintentar={() => { setLocales((l) => l.filter((y) => y.id !== m.id)); enviar(m, m._archivo, m.adjunto?.nombre); }} />)}
        {!hist.isLoading && !todos.length && !locales.length && <div style={{ margin: 'auto' }}><Vacio titulo="Sin mensajes" texto="Escribe el primero." /></div>}
      </div>
      {puede ? (
        <div className="chat-pie">
          <Adjuntar enviar={enviar} />
          <textarea aria-label="Mensaje" placeholder="Escribe un mensaje" rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); mandarTexto(); } }} />
          {texto.trim() ? <button className="icono-btn" style={{ background: 'var(--azul)', color: '#fff', borderRadius: '50%' }} aria-label="Enviar" onClick={mandarTexto}><Send size={18} /></button> : <Grabar enviar={enviar} />}
        </div>
      ) : <div className="tenue chico" style={{ padding: 13, textAlign: 'center', borderTop: '1px solid var(--linea)' }}>Solo los responsables pueden escribir en este canal.</div>}
    </>
  );
}
const cercaDelFondo = (c: HTMLDivElement | null) => !c || c.scrollHeight - c.scrollTop - c.clientHeight < 180;

function Burbuja({ m, mio, nombre, borrar, reintentar }: { m: Msg; mio: boolean; nombre: boolean; borrar?: () => void; reintentar?: () => void }) {
  const url = useUrl('chat', m.adjunto?.ruta);
  return (
    <div className={'burbuja' + (mio ? ' mia' : '')}>
      {nombre && <div className="quien">{m.autor_nombre}</div>}
      {m.eliminado ? <i className="tenue">Mensaje eliminado</i> : (
        <>
          {m.tipo === 'imagen' && url && <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={m.adjunto?.nombre ?? 'Foto'} loading="lazy" /></a>}
          {m.tipo === 'video' && url && <video src={url} controls preload="metadata" />}
          {m.tipo === 'audio' && url && <audio src={url} controls preload="metadata" />}
          {(m.tipo === 'pdf' || m.tipo === 'archivo') && m.adjunto && (
            <a className="fila" style={{ textDecoration: 'none', color: 'inherit', padding: '4px 0' }} href={url} target="_blank" rel="noopener noreferrer">
              {m.tipo === 'pdf' ? <FileText size={26} /> : <FileIco size={26} />}<span className="crece"><b className="corta" style={{ display: 'block', maxWidth: 240 }}>{m.adjunto.nombre}</b><span className="tenue chico">{tamano(m.adjunto.tamano)}</span></span>
            </a>
          )}
          {m._local && !m.cuerpo && m.tipo !== 'texto' && <span className="tenue chico">{m._local === 'enviando' ? 'Subiendo archivo…' : ''}</span>}
          {m.cuerpo && <span style={{ whiteSpace: 'pre-wrap' }}>{m.cuerpo}</span>}
        </>
      )}
      <span className="hora">
        {m._local === 'enviando' ? 'Enviando…' : m._local === 'error' ? <button className="boton ch peligro" onClick={reintentar}>No se envió. Reintentar</button> : hora(m.creado_en)}
        {mio && borrar && !m.eliminado && <button aria-label="Eliminar mensaje" onClick={borrar} style={{ border: 0, background: 'none', cursor: 'pointer', padding: '0 0 0 6px', color: 'var(--suave)', verticalAlign: -2 }}><Trash2 size={12} /></button>}
      </span>
    </div>
  );
}

function Adjuntar({ enviar }: { enviar: (m: Partial<Msg>, f?: File | Blob, n?: string) => void }) {
  const aviso = useAviso();
  const elegir = (e: any) => {
    const lista: File[] = [...(e.target.files ?? [])]; e.target.value = '';
    for (const f of lista.slice(0, 10)) {
      if (f.size > 100 * 1024 * 1024) { aviso(`${f.name} supera los 100 MB`, true); continue; }
      enviar({ tipo: tipoDeArchivo(f.type, f.name) }, f, f.name);
    }
  };
  return <label className="icono-btn" aria-label="Adjuntar archivo" title="Adjuntar foto, video, PDF o cualquier archivo"><Paperclip size={20} /><input type="file" multiple hidden onChange={elegir} /></label>;
}

function Grabar({ enviar }: { enviar: (m: Partial<Msg>, f?: File | Blob, n?: string) => void }) {
  const aviso = useAviso();
  const [g, setG] = useState(false); const [s, setS] = useState(0);
  const rec = useRef<MediaRecorder | null>(null); const cancelado = useRef(false);
  useEffect(() => { if (!g) return; const t = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(t); }, [g]);
  const empezar = async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((x) => MediaRecorder.isTypeSupported(x)) ?? '';
      const r = new MediaRecorder(st, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined);
      const trozos: Blob[] = [];
      r.ondataavailable = (e) => trozos.push(e.data);
      r.onstop = () => {
        st.getTracks().forEach((x) => x.stop());
        if (cancelado.current) return;
        const b = new Blob(trozos, { type: (r.mimeType || 'audio/webm').split(';')[0] });
        enviar({ tipo: 'audio' }, b, `audio-${Date.now()}.${b.type.includes('mp4') ? 'm4a' : 'webm'}`);
      };
      cancelado.current = false; r.start(); rec.current = r; setS(0); setG(true);
    } catch { aviso('Permite el uso del micrófono para grabar audios.', true); }
  };
  if (g) return (
    <span className="fila" style={{ gap: 4 }}>
      <span className="chico neg" style={{ color: 'var(--rojo)' }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
      <button className="icono-btn" aria-label="Cancelar audio" onClick={() => { cancelado.current = true; rec.current?.stop(); setG(false); }}><X size={19} /></button>
      <button className="icono-btn" style={{ background: 'var(--rojo)', color: '#fff', borderRadius: '50%' }} aria-label="Terminar y enviar audio" onClick={() => { rec.current?.stop(); setG(false); }}><Square size={16} /></button>
    </span>
  );
  return <button className="icono-btn" aria-label="Grabar audio" title="Grabar audio" onClick={empezar}><Mic size={20} /></button>;
}
