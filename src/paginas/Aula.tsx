// Aula virtual: tareas con entregas, foro de la materia y cuestionarios.
// Toda regla (quién ve qué, plazos, calificación) se aplica en la base de datos; aquí solo se muestra.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleCheck, ClipboardList, Clock, Download, ListChecks, Lock, LockOpen, MessagesSquare, Paperclip, Pin, PinOff, Plus, Send, ShieldAlert, Timer, Trash2, Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { dato, rpc, sb } from '../lib/sb';
import { usePerfil } from '../lib/sesion';
import { fecha, hora, tamano } from '../lib/util';
import { subir, urlFirmada } from '../lib/archivos';
import { Campo, Estado, Modal, Pestanas, useAviso, Vacio } from '../ui/ui';

const fh = (d?: string | null) => (d ? `${fecha(d)} ${hora(d)}` : '—');
const aLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
const abrirArchivo = async (bucket: string, ruta: string, aviso: (m: string, e?: boolean) => void) => {
  try { window.open(await urlFirmada(bucket, ruta), '_blank', 'noopener'); } catch (e: any) { aviso(e.message, true); }
};

/* ════════════════ Acceso a clases (contrato y cuotas) ════════════════ */
export function useAcceso() {
  return useQuery({ queryKey: ['mi-acceso'], staleTime: 60_000, queryFn: () => rpc<any>('mi_acceso') });
}
export function AvisoAcceso() {
  const a = useAcceso();
  if (!a.data?.es_estudiante || a.data.habilitado) return null;
  const sinContrato = a.data.exigir_contrato && !a.data.contrato;
  return (
    <div className="aviso mal" role="alert">
      <ShieldAlert size={20} />
      <div className="crece">
        <b>Tu acceso a clases está suspendido.</b>
        <div className="chico">{sinContrato
          ? 'Para entrar a tus materias, firma tu contrato de la gestión y elige tu plan de pagos.'
          : 'Tienes cuotas vencidas. Tu acceso se restituye apenas se confirme tu pago.'}</div>
        <div style={{ marginTop: 8 }}>
          <Link className="boton ch prim" to={sinContrato ? '/contrato' : '/pagos'}>{sinContrato ? 'Firmar mi contrato' : 'Pagar mis cuotas'}</Link>
        </div>
      </div>
    </div>
  );
}

/* ════════════════ Tareas ════════════════ */
export function Tareas({ oferta, gestiona }: { oferta: any; gestiona: boolean }) {
  const p = usePerfil(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tareas', oferta.id], queryFn: async () => dato(await sb.from('tareas').select('*').eq('oferta_id', oferta.id).order('vence_en')) as any[] });
  const mias = useQuery({
    queryKey: ['mis-entregas', oferta.id], enabled: !gestiona && !!q.data?.length,
    queryFn: async () => dato(await sb.from('entregas').select('*').eq('estudiante_id', p.id).in('tarea_id', (q.data ?? []).map((t: any) => t.id))) as any[],
  });
  const [nueva, setNueva] = useState(false); const [abierta, setAbierta] = useState<string | null>(null);
  const ahora = Date.now();
  const inv = () => { qc.invalidateQueries({ queryKey: ['tareas', oferta.id] }); qc.invalidateQueries({ queryKey: ['mis-entregas', oferta.id] }); };
  return (
    <div className="pila">
      {gestiona && <div className="fila"><button className="boton prim" onClick={() => setNueva(true)}><Plus size={16} />Nueva tarea</button></div>}
      <Estado q={q} vacio={<div className="tarjeta"><Vacio icono={<ClipboardList size={34} strokeWidth={1.4} />} titulo="No hay tareas" texto={gestiona ? 'Publica una tarea y tus estudiantes recibirán un aviso.' : 'Cuando tu docente publique una tarea, aparecerá aquí y te llegará un aviso.'} /></div>}>
        {(q.data ?? []).map((t: any) => {
          const e = (mias.data ?? []).find((x: any) => x.tarea_id === t.id);
          const vencida = new Date(t.vence_en).getTime() < ahora;
          const etq = gestiona ? (t.publicada ? ['Publicada', 'ok'] : ['Borrador', 'med'])
            : e?.estado === 'calificada' ? [`Calificada · ${Number(e.calificacion)} / ${Number(t.puntaje)}`, 'ok']
            : e?.estado === 'tardia' ? ['Entregada con retraso', 'med']
            : e ? ['Entregada', 'inf']
            : vencida ? ['Sin entregar', 'mal'] : ['Pendiente', 'med'];
          return (
            <section className="tarjeta" key={t.id}>
              <button className="fila entre envolver" style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: 10, width: '100%', alignItems: 'center' }}
                aria-expanded={abierta === t.id} onClick={() => setAbierta(abierta === t.id ? null : t.id)}>
                <div className="crece" style={{ minWidth: 200 }}>
                  <b>{t.titulo}</b>
                  <div className={'chico ' + (vencida ? '' : 'tenue')}><Clock size={13} style={{ verticalAlign: -2 }} /> Vence {fh(t.vence_en)} · {Number(t.puntaje)} puntos</div>
                </div>
                <span className={'etiqueta ' + etq[1]}>{etq[0]}</span>
              </button>
              {abierta === t.id && (gestiona ? <TareaDocente tarea={t} oferta={oferta} cambio={inv} /> : <TareaEstudiante tarea={t} entrega={e} cambio={inv} />)}
            </section>
          );
        })}
      </Estado>
      {nueva && <FormTarea oferta={oferta} cerrar={() => { setNueva(false); inv(); }} />}
    </div>
  );
}

function Adjuntos({ lista, bucket }: { lista: any[]; bucket: string }) {
  const aviso = useAviso();
  if (!lista?.length) return null;
  return (
    <div className="fila envolver" style={{ gap: 6, marginTop: 8 }}>
      {lista.map((a: any) => <button key={a.ruta} className="boton ch" onClick={() => abrirArchivo(bucket, a.ruta, aviso)}><Paperclip size={14} />{a.nombre}{a.tamano ? ` · ${tamano(a.tamano)}` : ''}</button>)}
    </div>
  );
}

function FormTarea({ oferta, cerrar }: { oferta: any; cerrar: () => void }) {
  const aviso = useAviso();
  const [f, setF] = useState({ titulo: '', instrucciones: '', vence: aLocal(new Date(Date.now() + 7 * 864e5)), tipo: 'archivo', puntaje: '100', tardias: false });
  const [archivos, setA] = useState<File[]>([]); const [oc, setO] = useState(false);
  const enviar = async (e: any) => {
    e.preventDefault(); setO(true);
    try {
      const adjuntos = [];
      for (const a of archivos) adjuntos.push({ ruta: await subir('materiales', `${oferta.id}/tareas`, a), nombre: a.name, tamano: a.size });
      dato(await sb.from('tareas').insert({
        oferta_id: oferta.id, titulo: f.titulo, instrucciones: f.instrucciones || null, vence_en: new Date(f.vence).toISOString(),
        tipo_entrega: f.tipo, puntaje: Number(f.puntaje), acepta_tardias: f.tardias, adjuntos,
      }));
      aviso('Tarea publicada. Tus estudiantes recibieron un aviso.'); cerrar();
    } catch (x: any) { aviso(x.message, true); setO(false); }
  };
  return (
    <Modal titulo="Nueva tarea" cerrar={cerrar}>
      <form className="pila" onSubmit={enviar}>
        <Campo etiqueta="Título"><input className="ent" required minLength={3} maxLength={160} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
        <Campo etiqueta="Instrucciones"><textarea className="ent" rows={4} value={f.instrucciones} onChange={(e) => setF({ ...f, instrucciones: e.target.value })} /></Campo>
        <div className="fila envolver">
          <Campo etiqueta="Fecha límite"><input className="ent" type="datetime-local" required value={f.vence} onChange={(e) => setF({ ...f, vence: e.target.value })} /></Campo>
          <Campo etiqueta="Puntaje"><input className="ent" type="number" min={1} max={1000} required value={f.puntaje} onChange={(e) => setF({ ...f, puntaje: e.target.value })} /></Campo>
        </div>
        <Campo etiqueta="El estudiante entrega">
          <select className="ent" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            <option value="archivo">Archivos (documentos, fotos o videos)</option><option value="texto">Respuesta escrita</option><option value="ambos">Texto, archivos o ambos</option>
          </select>
        </Campo>
        <Campo etiqueta="Archivos de apoyo (opcional)"><input className="ent" type="file" multiple onChange={(e) => setA([...(e.target.files ?? [])])} /></Campo>
        <label className="fila chico"><input type="checkbox" checked={f.tardias} onChange={(e) => setF({ ...f, tardias: e.target.checked })} />Aceptar entregas después de la fecha límite (quedan marcadas con retraso)</label>
        <button className="boton prim" disabled={oc}>{oc ? 'Publicando…' : 'Publicar tarea'}</button>
      </form>
    </Modal>
  );
}

function TareaEstudiante({ tarea, entrega, cambio }: { tarea: any; entrega?: any; cambio: () => void }) {
  const p = usePerfil(); const aviso = useAviso();
  const [texto, setT] = useState(entrega?.texto ?? ''); const [nuevos, setN] = useState<File[]>([]);
  const [prog, setP] = useState<number | null>(null);
  const cerrada = new Date(tarea.vence_en).getTime() < Date.now() && !tarea.acepta_tardias;
  const calificada = entrega?.estado === 'calificada';
  const enviar = async (e: any) => {
    e.preventDefault();
    try {
      setP(0);
      const archivos = [...(entrega?.archivos ?? [])];
      for (const [i, a] of nuevos.entries()) {
        archivos.push({ ruta: await subir('entregas', `${tarea.oferta_id}/${tarea.id}/${p.id}`, a, undefined, (x) => setP(Math.round(((i + x / 100) / nuevos.length) * 100))), nombre: a.name, tamano: a.size });
      }
      await rpc('entregar_tarea', { p_tarea: tarea.id, p_texto: texto, p_archivos: archivos });
      aviso(entrega ? 'Entrega actualizada' : 'Tarea entregada'); setN([]); setP(null); cambio();
    } catch (x: any) { aviso(x.message, true); setP(null); }
  };
  const quitar = async (a: any) => {
    try { await rpc('entregar_tarea', { p_tarea: tarea.id, p_texto: texto, p_archivos: (entrega?.archivos ?? []).filter((x: any) => x.ruta !== a.ruta) }); await sb.storage.from('entregas').remove([a.ruta]); cambio(); }
    catch (x: any) { aviso(x.message, true); }
  };
  return (
    <div className="pila" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--borde, #e4dccb)' }}>
      {tarea.instrucciones && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{tarea.instrucciones}</p>}
      <Adjuntos lista={tarea.adjuntos} bucket="materiales" />
      {calificada && (
        <div className="aviso ok"><b>Calificación: {Number(entrega.calificacion)} de {Number(tarea.puntaje)}</b>{entrega.comentario && <div style={{ whiteSpace: 'pre-wrap' }}>{entrega.comentario}</div>}</div>
      )}
      {entrega && (
        <div className="chico tenue">Tu entrega · {fh(entrega.enviada_en)}{entrega.version > 1 ? ` · versión ${entrega.version}` : ''}
          {(entrega.archivos ?? []).map((a: any) => (
            <div className="fila" key={a.ruta} style={{ marginTop: 4 }}>
              <button className="boton ch" onClick={() => abrirArchivo('entregas', a.ruta, aviso)}><Paperclip size={14} />{a.nombre}</button>
              {!calificada && !cerrada && <button className="icono-btn" aria-label={`Quitar ${a.nombre}`} onClick={() => quitar(a)}><Trash2 size={16} /></button>}
            </div>
          ))}
        </div>
      )}
      {!calificada && (cerrada ? <div className="aviso mal chico">La fecha límite ya pasó.</div> : (
        <form className="pila" onSubmit={enviar}>
          {tarea.tipo_entrega !== 'archivo' && <Campo etiqueta="Tu respuesta"><textarea className="ent" rows={5} value={texto} onChange={(e) => setT(e.target.value)} /></Campo>}
          {tarea.tipo_entrega !== 'texto' && (
            <Campo etiqueta="Adjuntar archivos" ayuda="Documentos, fotos o videos. Los archivos grandes siguen subiendo aunque se corte la señal.">
              <input className="ent" type="file" multiple onChange={(e) => setN([...(e.target.files ?? [])])} />
            </Campo>
          )}
          {prog !== null && <div className="barra" role="progressbar" aria-valuenow={prog}><i style={{ width: prog + '%' }} /></div>}
          <button className="boton prim" disabled={prog !== null}><Upload size={16} />{prog !== null ? `Subiendo ${prog}%` : entrega ? 'Actualizar entrega' : 'Entregar tarea'}</button>
        </form>
      ))}
    </div>
  );
}

function TareaDocente({ tarea, oferta, cambio }: { tarea: any; oferta: any; cambio: () => void }) {
  const aviso = useAviso(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['entregas-tarea', tarea.id], queryFn: () => rpc<any[]>('entregas_tarea', { p_tarea: tarea.id }) });
  const [notas, setNotas] = useState<Record<string, { n: string; c: string }>>({});
  const entregaron = (q.data ?? []).filter((x: any) => x.entrega_id).length;
  const calificar = async (fila: any) => {
    const v = notas[fila.entrega_id] ?? { n: String(fila.calificacion ?? ''), c: fila.comentario ?? '' };
    try { await rpc('calificar_entrega', { p_entrega: fila.entrega_id, p_nota: Number(v.n), p_comentario: v.c }); aviso('Calificación guardada y notificada'); qc.invalidateQueries({ queryKey: ['entregas-tarea', tarea.id] }); }
    catch (x: any) { aviso(x.message, true); }
  };
  const borrar = async () => {
    if (!confirm(`¿Borrar la tarea "${tarea.titulo}" y todas sus entregas?`)) return;
    try { dato(await sb.from('tareas').delete().eq('id', tarea.id)); cambio(); } catch (x: any) { aviso(x.message, true); }
  };
  return (
    <div className="pila" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--borde, #e4dccb)' }}>
      {tarea.instrucciones && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{tarea.instrucciones}</p>}
      <Adjuntos lista={tarea.adjuntos} bucket="materiales" />
      <div className="fila entre envolver"><b>{entregaron} de {q.data?.length ?? '…'} entregaron</b><button className="boton ch" onClick={borrar}><Trash2 size={15} />Borrar tarea</button></div>
      <Estado q={q}>
        <div className="tabla-c"><table className="tabla">
          <thead><tr><th>Estudiante</th><th>Estado</th><th>Entrega</th><th>Nota / {Number(tarea.puntaje)}</th><th>Comentario</th><th></th></tr></thead>
          <tbody>{(q.data ?? []).map((x: any) => {
            const v = notas[x.entrega_id] ?? { n: x.calificacion != null ? String(Number(x.calificacion)) : '', c: x.comentario ?? '' };
            return (
              <tr key={x.estudiante_id}>
                <td className="nowrap">{x.apellidos} {x.nombres}</td>
                <td><span className={'etiqueta ' + ({ calificada: 'ok', entregada: 'inf', tardia: 'med', sin_entrega: 'mal', pendiente: '' } as any)[x.estado]}>{({ calificada: 'Calificada', entregada: 'Entregada', tardia: 'Con retraso', sin_entrega: 'Sin entrega', pendiente: 'Pendiente' } as any)[x.estado]}</span>{x.enviada_en && <div className="chico tenue">{fh(x.enviada_en)}</div>}</td>
                <td style={{ maxWidth: 280 }}>
                  {x.texto && <details><summary className="chico">Ver respuesta escrita</summary><p className="chico" style={{ whiteSpace: 'pre-wrap' }}>{x.texto}</p></details>}
                  {(x.archivos ?? []).map((a: any) => <button key={a.ruta} className="boton ch" style={{ margin: 2 }} onClick={() => abrirArchivo('entregas', a.ruta, aviso)}><Download size={13} />{a.nombre}</button>)}
                </td>
                <td>{x.entrega_id && <input className="ent" style={{ width: 80 }} type="number" min={0} max={Number(tarea.puntaje)} step="0.5" aria-label={`Nota de ${x.nombres}`} value={v.n} onChange={(e) => setNotas({ ...notas, [x.entrega_id]: { ...v, n: e.target.value } })} />}</td>
                <td>{x.entrega_id && <input className="ent" placeholder="Retroalimentación" aria-label={`Comentario para ${x.nombres}`} value={v.c} onChange={(e) => setNotas({ ...notas, [x.entrega_id]: { ...v, c: e.target.value } })} />}</td>
                <td>{x.entrega_id && <button className="boton ch prim" disabled={v.n === ''} onClick={() => calificar(x)}>Guardar</button>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </Estado>
      <p className="chico tenue" style={{ margin: 0 }}>La calificación de la tarea se guarda aparte; la integración con la planilla de notas se definirá con el diseño de notas.</p>
    </div>
  );
}

/* ════════════════ Foro ════════════════ */
export function Foro({ oferta, gestiona }: { oferta: any; gestiona: boolean }) {
  const qc = useQueryClient(); const aviso = useAviso();
  const q = useQuery({ queryKey: ['foro', oferta.id], queryFn: async () => dato(await sb.from('foro_temas').select('*').eq('oferta_id', oferta.id).order('fijado', { ascending: false }).order('actividad_en', { ascending: false }).limit(200)) as any[] });
  const [nuevo, setNuevo] = useState(false); const [tema, setTema] = useState<any>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ['foro', oferta.id] });
  const crear = useMutation({
    mutationFn: async (f: { titulo: string; cuerpo: string }) => dato(await sb.from('foro_temas').insert({ oferta_id: oferta.id, ...f })),
    onSuccess: () => { setNuevo(false); inv(); }, onError: (e: any) => aviso(e.message, true),
  });
  if (tema) return <TemaForo tema={tema} gestiona={gestiona} volver={() => { setTema(null); inv(); }} />;
  return (
    <div className="pila">
      <div className="fila"><button className="boton prim" onClick={() => setNuevo(true)}><Plus size={16} />Nuevo tema</button></div>
      <Estado q={q} vacio={<div className="tarjeta"><Vacio icono={<MessagesSquare size={34} strokeWidth={1.4} />} titulo="Aún no hay temas" texto="Abre un tema para preguntar o debatir con tu clase." /></div>}>
        <div className="pila-s">
          {(q.data ?? []).map((t: any) => (
            <button key={t.id} className="tarjeta fila" style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setTema(t)}>
              {t.fijado ? <Pin size={18} className="tenue" /> : <MessagesSquare size={18} className="tenue" />}
              <div className="crece">
                <b>{t.titulo}</b>{t.cerrado && <span className="etiqueta" style={{ marginLeft: 8 }}><Lock size={12} /> Cerrado</span>}
                <div className="chico tenue">{t.autor_nombre ?? 'Participante'}{t.autor_docente ? ' · Docente' : ''} · {t.respuestas} {t.respuestas === 1 ? 'respuesta' : 'respuestas'} · {fh(t.actividad_en)}</div>
              </div>
            </button>
          ))}
        </div>
      </Estado>
      {nuevo && <FormTemaForo cerrar={() => setNuevo(false)} guardar={(f) => crear.mutate(f)} ocupado={crear.isPending} />}
    </div>
  );
}
function FormTemaForo({ cerrar, guardar, ocupado }: { cerrar: () => void; guardar: (f: { titulo: string; cuerpo: string }) => void; ocupado: boolean }) {
  const [f, setF] = useState({ titulo: '', cuerpo: '' });
  return (
    <Modal titulo="Nuevo tema del foro" cerrar={cerrar}>
      <form className="pila" onSubmit={(e) => { e.preventDefault(); guardar(f); }}>
        <Campo etiqueta="Título"><input className="ent" required minLength={3} maxLength={160} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
        <Campo etiqueta="Mensaje"><textarea className="ent" rows={6} required maxLength={8000} value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} /></Campo>
        <button className="boton prim" disabled={ocupado}><Send size={16} />Publicar</button>
      </form>
    </Modal>
  );
}
function TemaForo({ tema, gestiona, volver }: { tema: any; gestiona: boolean; volver: () => void }) {
  const p = usePerfil(); const qc = useQueryClient(); const aviso = useAviso();
  const t = useQuery({ queryKey: ['foro-tema', tema.id], initialData: tema, queryFn: async () => dato(await sb.from('foro_temas').select('*').eq('id', tema.id).single()) as any });
  const r = useQuery({ queryKey: ['foro-resp', tema.id], queryFn: async () => dato(await sb.from('foro_respuestas').select('*').eq('tema_id', tema.id).order('creado_en').limit(500)) as any[] });
  const [txt, setTxt] = useState('');
  const inv = () => { qc.invalidateQueries({ queryKey: ['foro-tema', tema.id] }); qc.invalidateQueries({ queryKey: ['foro-resp', tema.id] }); };
  const responder = async (e: any) => {
    e.preventDefault();
    try { dato(await sb.from('foro_respuestas').insert({ tema_id: tema.id, cuerpo: txt })); setTxt(''); inv(); } catch (x: any) { aviso(x.message, true); }
  };
  const ajustar = async (c: any) => { try { dato(await sb.from('foro_temas').update(c).eq('id', tema.id)); inv(); } catch (x: any) { aviso(x.message, true); } };
  const borrarTema = async () => { if (confirm('¿Borrar este tema y sus respuestas?')) { try { dato(await sb.from('foro_temas').delete().eq('id', tema.id)); volver(); } catch (x: any) { aviso(x.message, true); } } };
  const borrarResp = async (id: string) => { if (confirm('¿Borrar esta respuesta?')) { try { dato(await sb.from('foro_respuestas').delete().eq('id', id)); inv(); } catch (x: any) { aviso(x.message, true); } } };
  const d = t.data;
  return (
    <div className="pila">
      <div className="fila entre envolver">
        <button className="boton ch" onClick={volver}>← Todos los temas</button>
        <span className="fila">
          {gestiona && <button className="boton ch" onClick={() => ajustar({ fijado: !d.fijado })}>{d.fijado ? <PinOff size={15} /> : <Pin size={15} />}{d.fijado ? 'Desfijar' : 'Fijar'}</button>}
          {gestiona && <button className="boton ch" onClick={() => ajustar({ cerrado: !d.cerrado })}>{d.cerrado ? <LockOpen size={15} /> : <Lock size={15} />}{d.cerrado ? 'Reabrir' : 'Cerrar'}</button>}
          {(gestiona || d.autor_id === p.id) && <button className="icono-btn" aria-label="Borrar tema" onClick={borrarTema}><Trash2 size={17} /></button>}
        </span>
      </div>
      <article className="tarjeta">
        <h2 style={{ marginTop: 0 }}>{d.titulo}</h2>
        <div className="chico tenue">{d.autor_nombre}{d.autor_docente ? ' · Docente' : ''} · {fh(d.creado_en)}</div>
        <p style={{ whiteSpace: 'pre-wrap' }}>{d.cuerpo}</p>
      </article>
      <Estado q={r}>
        {(r.data ?? []).map((x: any) => (
          <div className="tarjeta" key={x.id} style={x.autor_docente ? { borderLeft: '3px solid var(--azul, #1E3A6E)' } : undefined}>
            <div className="fila entre"><span className="chico"><b>{x.autor_nombre}</b>{x.autor_docente ? ' · Docente' : ''} · <span className="tenue">{fh(x.creado_en)}</span></span>
              {(gestiona || x.autor_id === p.id) && <button className="icono-btn" aria-label="Borrar respuesta" onClick={() => borrarResp(x.id)}><Trash2 size={15} /></button>}</div>
            <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{x.cuerpo}</p>
          </div>
        ))}
      </Estado>
      {d.cerrado && !gestiona ? <div className="aviso chico"><Lock size={16} />El docente cerró este tema.</div> : (
        <form className="tarjeta pila" onSubmit={responder}>
          <Campo etiqueta="Tu respuesta"><textarea className="ent" rows={3} required maxLength={8000} value={txt} onChange={(e) => setTxt(e.target.value)} /></Campo>
          <button className="boton prim"><Send size={16} />Responder</button>
        </form>
      )}
    </div>
  );
}

/* ════════════════ Cuestionarios ════════════════ */
const TIPOS: Record<string, string> = { unica: 'Opción única', multiple: 'Opción múltiple', vf: 'Verdadero o falso', abierta: 'Respuesta abierta' };
export function Cuestionarios({ oferta, gestiona }: { oferta: any; gestiona: boolean }) {
  const p = usePerfil(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cuestionarios', oferta.id], queryFn: async () => dato(await sb.from('cuestionarios').select('*').eq('oferta_id', oferta.id).order('cierra_en')) as any[] });
  const ints = useQuery({ queryKey: ['mis-intentos', oferta.id], enabled: !gestiona && !!q.data?.length,
    queryFn: async () => dato(await sb.from('intentos').select('*').eq('estudiante_id', p.id).in('cuestionario_id', (q.data ?? []).map((c: any) => c.id))) as any[] });
  const [nuevo, setNuevo] = useState(false); const [editar, setEditar] = useState<any>(null); const [rendir, setRendir] = useState<any>(null);
  const inv = () => { qc.invalidateQueries({ queryKey: ['cuestionarios', oferta.id] }); qc.invalidateQueries({ queryKey: ['mis-intentos', oferta.id] }); };
  if (editar) return <EditorCuestionario c={editar} volver={() => { setEditar(null); inv(); }} />;
  return (
    <div className="pila">
      {gestiona && <div className="fila"><button className="boton prim" onClick={() => setNuevo(true)}><Plus size={16} />Nuevo cuestionario</button></div>}
      <Estado q={q} vacio={<div className="tarjeta"><Vacio icono={<ListChecks size={34} strokeWidth={1.4} />} titulo="No hay cuestionarios" texto={gestiona ? 'Crea un cuestionario: se califica solo.' : 'Cuando tu docente publique un cuestionario, aparecerá aquí.'} /></div>}>
        {(q.data ?? []).map((c: any) => {
          const mios = (ints.data ?? []).filter((x: any) => x.cuestionario_id === c.id && x.enviado_en);
          const mejor = mios.length ? Math.max(...mios.map((x: any) => Number(x.puntaje ?? 0))) : null;
          const abierto = new Date(c.abre_en).getTime() <= Date.now() && new Date(c.cierra_en).getTime() > Date.now();
          const quedan = c.intentos - mios.length;
          return (
            <section className="tarjeta fila entre envolver" key={c.id}>
              <div className="crece" style={{ minWidth: 200 }}>
                <b>{c.titulo}</b>{gestiona && !c.publicado && <span className="etiqueta med" style={{ marginLeft: 8 }}>Borrador</span>}
                <div className="chico tenue"><Clock size={13} style={{ verticalAlign: -2 }} /> Cierra {fh(c.cierra_en)}{c.duracion_min ? ` · ${c.duracion_min} min` : ''} · {c.intentos} {c.intentos === 1 ? 'intento' : 'intentos'}</div>
                {!gestiona && mejor !== null && <div className="chico"><b>Tu mejor resultado: {mejor} / {Number(mios[0].puntaje_max)}</b>{mios.some((x: any) => x.pendiente_revision) ? ' · con respuestas en revisión' : ''}</div>}
              </div>
              {gestiona ? <button className="boton ch prim" onClick={() => setEditar(c)}>Preguntas y resultados</button>
                : abierto && quedan > 0 ? <button className="boton ch prim" onClick={() => setRendir(c)}><Timer size={15} />{mios.length ? 'Nuevo intento' : 'Comenzar'}</button>
                : <span className="etiqueta">{abierto ? 'Sin intentos' : 'Cerrado'}</span>}
            </section>
          );
        })}
      </Estado>
      {nuevo && <FormCuestionario oferta={oferta} cerrar={(c) => { setNuevo(false); inv(); if (c) setEditar(c); }} />}
      {rendir && <Rendir c={rendir} cerrar={() => { setRendir(null); inv(); }} />}
    </div>
  );
}

function FormCuestionario({ oferta, cerrar }: { oferta: any; cerrar: (c?: any) => void }) {
  const aviso = useAviso();
  const [f, setF] = useState({ titulo: '', instrucciones: '', abre: aLocal(new Date()), cierra: aLocal(new Date(Date.now() + 7 * 864e5)), duracion: '20', intentos: '1' });
  const enviar = async (e: any) => {
    e.preventDefault();
    try {
      const c = dato(await sb.from('cuestionarios').insert({
        oferta_id: oferta.id, titulo: f.titulo, instrucciones: f.instrucciones || null, abre_en: new Date(f.abre).toISOString(), cierra_en: new Date(f.cierra).toISOString(),
        duracion_min: f.duracion ? Number(f.duracion) : null, intentos: Number(f.intentos), publicado: false,
      }).select().single());
      cerrar(c);
    } catch (x: any) { aviso(x.message, true); }
  };
  return (
    <Modal titulo="Nuevo cuestionario" cerrar={() => cerrar()}>
      <form className="pila" onSubmit={enviar}>
        <Campo etiqueta="Título"><input className="ent" required minLength={3} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
        <Campo etiqueta="Instrucciones"><textarea className="ent" rows={3} value={f.instrucciones} onChange={(e) => setF({ ...f, instrucciones: e.target.value })} /></Campo>
        <div className="fila envolver">
          <Campo etiqueta="Abre"><input className="ent" type="datetime-local" required value={f.abre} onChange={(e) => setF({ ...f, abre: e.target.value })} /></Campo>
          <Campo etiqueta="Cierra"><input className="ent" type="datetime-local" required value={f.cierra} onChange={(e) => setF({ ...f, cierra: e.target.value })} /></Campo>
        </div>
        <div className="fila envolver">
          <Campo etiqueta="Minutos para resolverlo" ayuda="Vacío = sin límite de tiempo"><input className="ent" type="number" min={1} max={600} value={f.duracion} onChange={(e) => setF({ ...f, duracion: e.target.value })} /></Campo>
          <Campo etiqueta="Intentos permitidos"><input className="ent" type="number" min={1} max={10} required value={f.intentos} onChange={(e) => setF({ ...f, intentos: e.target.value })} /></Campo>
        </div>
        <button className="boton prim">Crear y agregar preguntas</button>
      </form>
    </Modal>
  );
}

function EditorCuestionario({ c, volver }: { c: any; volver: () => void }) {
  const aviso = useAviso(); const qc = useQueryClient();
  const cq = useQuery({ queryKey: ['cuestionario', c.id], initialData: c, queryFn: async () => dato(await sb.from('cuestionarios').select('*').eq('id', c.id).single()) as any });
  const pq = useQuery({ queryKey: ['preguntas', c.id], queryFn: async () => dato(await sb.from('preguntas').select('*').eq('cuestionario_id', c.id).order('orden')) as any[] });
  const rq = useQuery({ queryKey: ['resultados', c.id], queryFn: () => rpc<any[]>('resultados_cuestionario', { p_cuest: c.id }) });
  const [tab, setTab] = useState('preguntas'); const [nueva, setNueva] = useState(false); const [revisar, setRevisar] = useState<string | null>(null);
  const inv = () => { for (const k of ['cuestionario', 'preguntas', 'resultados']) qc.invalidateQueries({ queryKey: [k, c.id] }); };
  const total = (pq.data ?? []).reduce((s: number, x: any) => s + Number(x.puntaje), 0);
  const publicar = async () => {
    if (!cq.data.publicado && !(pq.data ?? []).length) return aviso('Agrega al menos una pregunta', true);
    try { dato(await sb.from('cuestionarios').update({ publicado: !cq.data.publicado }).eq('id', c.id)); inv(); } catch (x: any) { aviso(x.message, true); }
  };
  const borrarPregunta = async (id: string) => { try { dato(await sb.from('preguntas').delete().eq('id', id)); inv(); } catch (x: any) { aviso(x.message, true); } };
  return (
    <div className="pila">
      <div className="fila entre envolver">
        <button className="boton ch" onClick={volver}>← Cuestionarios</button>
        <button className={'boton ch ' + (cq.data.publicado ? '' : 'prim')} onClick={publicar}>{cq.data.publicado ? 'Volver a borrador' : 'Publicar para la clase'}</button>
      </div>
      <h2 style={{ margin: 0 }}>{cq.data.titulo}</h2>
      <Pestanas opciones={[['preguntas', `Preguntas (${pq.data?.length ?? 0})`], ['resultados', 'Resultados']]} valor={tab} cambiar={setTab} />
      {tab === 'preguntas' ? (
        <div className="pila">
          <div className="fila entre"><span className="tenue">Puntaje total: {total}</span><button className="boton prim" onClick={() => setNueva(true)}><Plus size={16} />Agregar pregunta</button></div>
          <Estado q={pq}>
            {(pq.data ?? []).map((x: any, i: number) => (
              <div className="tarjeta" key={x.id}>
                <div className="fila entre"><span className="chico tenue">{i + 1}. {TIPOS[x.tipo]} · {Number(x.puntaje)} pts</span><button className="icono-btn" aria-label="Borrar pregunta" onClick={() => borrarPregunta(x.id)}><Trash2 size={16} /></button></div>
                <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{x.enunciado}</p>
                {x.tipo === 'vf' && <div className="chico">Correcta: <b>{x.correcta ? 'Verdadero' : 'Falso'}</b></div>}
                {(x.opciones ?? []).map((o: any) => {
                  const ok = x.tipo === 'unica' ? x.correcta === o.id : (x.correcta ?? []).includes(o.id);
                  return <div className="chico fila" key={o.id} style={ok ? { fontWeight: 700, color: 'var(--verde, #1f7a4b)' } : undefined}>{ok ? <CircleCheck size={14} /> : <span style={{ width: 14 }} />} {o.texto}</div>;
                })}
              </div>
            ))}
          </Estado>
        </div>
      ) : (
        <Estado q={rq}>
          <div className="tabla-c"><table className="tabla">
            <thead><tr><th>Estudiante</th><th>Intentos</th><th>Mejor puntaje</th><th></th></tr></thead>
            <tbody>{(rq.data ?? []).map((x: any) => (
              <tr key={x.estudiante_id}>
                <td>{x.apellidos} {x.nombres}</td><td>{Number(x.intentos)}</td>
                <td>{x.mejor != null ? `${Number(x.mejor)} / ${Number(x.puntaje_max)}` : '—'}{x.pendiente && <span className="etiqueta med" style={{ marginLeft: 6 }}>Por revisar</span>}</td>
                <td>{x.ultimo_intento && <button className="boton ch" onClick={() => setRevisar(x.ultimo_intento)}>Revisar</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Estado>
      )}
      {nueva && <FormPregunta cuest={c.id} orden={(pq.data?.length ?? 0) + 1} cerrar={() => { setNueva(false); inv(); }} />}
      {revisar && <RevisarIntento id={revisar} preguntas={pq.data ?? []} cerrar={() => { setRevisar(null); inv(); }} />}
    </div>
  );
}

function FormPregunta({ cuest, orden, cerrar }: { cuest: string; orden: number; cerrar: () => void }) {
  const aviso = useAviso();
  const [tipo, setTipo] = useState('unica'); const [enun, setE] = useState(''); const [pts, setPts] = useState('1');
  const [ops, setOps] = useState(['', '', '']); const [ok, setOk] = useState<number[]>([0]); const [vf, setVf] = useState(true);
  const guardar = async (e: any) => {
    e.preventDefault();
    const opciones = ops.map((t, i) => ({ id: String.fromCharCode(97 + i), texto: t.trim() })).filter((o) => o.texto);
    if ((tipo === 'unica' || tipo === 'multiple') && opciones.length < 2) return aviso('Escribe al menos dos opciones', true);
    const ids = ok.map((i) => String.fromCharCode(97 + i)).filter((id) => opciones.some((o) => o.id === id));
    if ((tipo === 'unica' || tipo === 'multiple') && !ids.length) return aviso('Marca la respuesta correcta', true);
    const correcta = tipo === 'unica' ? ids[0] : tipo === 'multiple' ? ids : tipo === 'vf' ? vf : null;
    try {
      dato(await sb.from('preguntas').insert({ cuestionario_id: cuest, orden, tipo, enunciado: enun, opciones: tipo === 'unica' || tipo === 'multiple' ? opciones : [], correcta, puntaje: Number(pts) }));
      cerrar();
    } catch (x: any) { aviso(x.message, true); }
  };
  return (
    <Modal titulo="Nueva pregunta" cerrar={cerrar}>
      <form className="pila" onSubmit={guardar}>
        <div className="fila envolver">
          <Campo etiqueta="Tipo"><select className="ent" value={tipo} onChange={(e) => { setTipo(e.target.value); setOk([0]); }}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo etiqueta="Puntaje"><input className="ent" type="number" min={0.5} step="0.5" required value={pts} onChange={(e) => setPts(e.target.value)} /></Campo>
        </div>
        <Campo etiqueta="Enunciado"><textarea className="ent" rows={3} required value={enun} onChange={(e) => setE(e.target.value)} /></Campo>
        {(tipo === 'unica' || tipo === 'multiple') && (
          <fieldset className="pila-s" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="chico tenue">Opciones · marca {tipo === 'unica' ? 'la correcta' : 'todas las correctas'}</legend>
            {ops.map((t, i) => (
              <label className="fila" key={i}>
                <input type={tipo === 'unica' ? 'radio' : 'checkbox'} name="correcta" checked={ok.includes(i)} onChange={(e) => setOk(tipo === 'unica' ? [i] : e.target.checked ? [...ok, i] : ok.filter((x) => x !== i))} aria-label={`Opción ${i + 1} correcta`} />
                <input className="ent" placeholder={`Opción ${String.fromCharCode(65 + i)}`} value={t} onChange={(e) => setOps(ops.map((x, j) => (j === i ? e.target.value : x)))} />
              </label>
            ))}
            {ops.length < 8 && <button type="button" className="boton ch" onClick={() => setOps([...ops, ''])}><Plus size={14} />Otra opción</button>}
          </fieldset>
        )}
        {tipo === 'vf' && <Campo etiqueta="Respuesta correcta"><select className="ent" value={String(vf)} onChange={(e) => setVf(e.target.value === 'true')}><option value="true">Verdadero</option><option value="false">Falso</option></select></Campo>}
        {tipo === 'abierta' && <p className="chico tenue" style={{ margin: 0 }}>Las respuestas abiertas las calificas tú al revisar cada intento.</p>}
        <button className="boton prim">Guardar pregunta</button>
      </form>
    </Modal>
  );
}

function RevisarIntento({ id, preguntas, cerrar }: { id: string; preguntas: any[]; cerrar: () => void }) {
  const aviso = useAviso();
  const q = useQuery({ queryKey: ['intento', id], queryFn: async () => dato(await sb.from('intentos').select('*').eq('id', id).single()) as any });
  const [pts, setPts] = useState(''); const [com, setCom] = useState('');
  useEffect(() => { if (q.data) { setPts(String(Number(q.data.puntaje ?? 0))); setCom(q.data.comentario ?? ''); } }, [q.data]);
  const resp = (p: any) => {
    const r = q.data?.respuestas?.[p.id];
    if (r == null || r === '') return <i className="tenue">Sin responder</i>;
    if (p.tipo === 'vf') return r ? 'Verdadero' : 'Falso';
    if (p.tipo === 'abierta') return <span style={{ whiteSpace: 'pre-wrap' }}>{String(r)}</span>;
    const lista = Array.isArray(r) ? r : [r];
    return lista.map((x: string) => p.opciones.find((o: any) => o.id === x)?.texto ?? x).join(', ');
  };
  const guardar = async () => {
    try { await rpc('revisar_intento', { p_intento: id, p_puntaje: Number(pts), p_comentario: com }); aviso('Revisión guardada y notificada'); cerrar(); }
    catch (x: any) { aviso(x.message, true); }
  };
  return (
    <Modal titulo="Revisar intento" cerrar={cerrar}>
      <Estado q={q}>
        {() => (
          <div className="pila">
            {preguntas.map((p: any, i: number) => (
              <div key={p.id} className="tarjeta"><div className="chico tenue">{i + 1}. {TIPOS[p.tipo]} · {Number(p.puntaje)} pts</div><div>{p.enunciado}</div><div className="chico" style={{ marginTop: 4 }}><b>Respuesta:</b> {resp(p)}</div></div>
            ))}
            <Campo etiqueta={`Puntaje final (máximo ${Number(q.data.puntaje_max)})`}><input className="ent" type="number" min={0} max={Number(q.data.puntaje_max)} step="0.5" value={pts} onChange={(e) => setPts(e.target.value)} /></Campo>
            <Campo etiqueta="Comentario para el estudiante"><textarea className="ent" rows={2} value={com} onChange={(e) => setCom(e.target.value)} /></Campo>
            <button className="boton prim" onClick={guardar}>Guardar revisión</button>
          </div>
        )}
      </Estado>
    </Modal>
  );
}

function Rendir({ c, cerrar }: { c: any; cerrar: () => void }) {
  const aviso = useAviso();
  const ini = useQuery({ queryKey: ['rendir', c.id], gcTime: 0, retry: false, queryFn: () => rpc<any>('iniciar_intento', { p_cuest: c.id }) });
  const [resp, setResp] = useState<Record<string, any>>({}); const [res, setRes] = useState<any>(null); const [oc, setO] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { if (ini.data?.respuestas) setResp(ini.data.respuestas); }, [ini.data]);
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t); }, []);
  const limite = ini.data?.limite_en ? new Date(ini.data.limite_en).getTime() : null;
  const resta = limite ? Math.max(0, limite - ahora) : null;
  const enviar = async () => {
    if (oc || res) return;
    setO(true);
    try { setRes(await rpc<any>('enviar_intento', { p_intento: ini.data.intento_id, p_respuestas: resp })); }
    catch (x: any) { aviso(x.message, true); } finally { setO(false); }
  };
  // Se envía solo al acabarse el tiempo.
  useEffect(() => { if (resta === 0 && ini.data && !res) enviar(); }, [resta === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const mm = resta != null ? `${Math.floor(resta / 60000)}:${String(Math.floor((resta % 60000) / 1000)).padStart(2, '0')}` : null;
  return (
    <Modal titulo={c.titulo} cerrar={() => { if (res || confirm('¿Salir? Puedes volver a entrar mientras te quede tiempo.')) cerrar(); }}>
      <Estado q={ini}>
        {() => res ? (
          <div className="pila" style={{ textAlign: 'center' }}>
            <h2 style={{ margin: 0 }}>Cuestionario enviado</h2>
            {res.puntaje != null ? <p style={{ fontSize: 28, margin: 0 }}><b>{Number(res.puntaje)}</b> / {Number(res.puntaje_max)}</p> : <p>Tu docente publicará el resultado.</p>}
            {res.pendiente_revision && <p className="chico tenue">Tus respuestas abiertas serán revisadas por tu docente.</p>}
            <button className="boton prim" onClick={cerrar}>Listo</button>
          </div>
        ) : (
          <div className="pila">
            {c.instrucciones && <p className="tenue" style={{ margin: 0 }}>{c.instrucciones}</p>}
            {mm && <div className={'aviso ' + (resta! < 60000 ? 'mal' : '')} style={{ position: 'sticky', top: 0, zIndex: 1 }}><Timer size={18} /><b>Tiempo restante: {mm}</b></div>}
            {(ini.data.preguntas ?? []).map((p: any, i: number) => (
              <fieldset className="tarjeta" key={p.id} style={{ margin: 0 }}>
                <legend className="chico tenue">Pregunta {i + 1} · {Number(p.puntaje)} pts</legend>
                <p style={{ margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{p.enunciado}</p>
                {p.tipo === 'unica' && p.opciones.map((o: any) => <label className="fila" key={o.id}><input type="radio" name={p.id} checked={resp[p.id] === o.id} onChange={() => setResp({ ...resp, [p.id]: o.id })} />{o.texto}</label>)}
                {p.tipo === 'multiple' && p.opciones.map((o: any) => {
                  const sel: string[] = resp[p.id] ?? [];
                  return <label className="fila" key={o.id}><input type="checkbox" checked={sel.includes(o.id)} onChange={(e) => setResp({ ...resp, [p.id]: e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id) })} />{o.texto}</label>;
                })}
                {p.tipo === 'vf' && [true, false].map((v) => <label className="fila" key={String(v)}><input type="radio" name={p.id} checked={resp[p.id] === v} onChange={() => setResp({ ...resp, [p.id]: v })} />{v ? 'Verdadero' : 'Falso'}</label>)}
                {p.tipo === 'abierta' && <textarea className="ent" rows={4} value={resp[p.id] ?? ''} onChange={(e) => setResp({ ...resp, [p.id]: e.target.value })} />}
              </fieldset>
            ))}
            <button className="boton prim" disabled={oc} onClick={() => { if (confirm('¿Enviar tus respuestas? Ya no podrás cambiarlas.')) enviar(); }}><Send size={16} />{oc ? 'Enviando…' : 'Enviar respuestas'}</button>
          </div>
        )}
      </Estado>
    </Modal>
  );
}

/* ════════════════ Asistencia obligatoria (vista del docente) ════════════════ */
export function RiesgoAsistencia({ oferta }: { oferta: any }) {
  const q = useQuery({ queryKey: ['resumen-asistencia', oferta.id], queryFn: () => rpc<any[]>('resumen_asistencia', { p_oferta: oferta.id }) });
  const enRiesgo = useMemo(() => (q.data ?? []).filter((x: any) => x.en_riesgo), [q.data]);
  if (!q.data?.length || !Number(q.data[0].sesiones)) return null;
  return (
    <section className="tarjeta">
      <h3 style={{ marginTop: 0 }}>Asistencia obligatoria</h3>
      {enRiesgo.length === 0 ? <p className="tenue chico" style={{ margin: 0 }}>Todos los estudiantes están sobre el mínimo de asistencia.</p> : (
        <>
          <p className="chico" style={{ marginTop: 0 }}>{enRiesgo.length} {enRiesgo.length === 1 ? 'estudiante está' : 'estudiantes están'} bajo el mínimo. Ya recibieron un aviso en su celular.</p>
          {enRiesgo.map((x: any) => (
            <div className="fila entre chico" key={x.estudiante_id} style={{ padding: '4px 0' }}>
              <span>{x.apellidos} {x.nombres}</span><span className="etiqueta mal">{Number(x.porcentaje)}% · {Number(x.faltas)} {Number(x.faltas) === 1 ? 'falta' : 'faltas'}</span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
