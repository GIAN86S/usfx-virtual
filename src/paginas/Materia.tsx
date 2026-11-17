import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, BookOpen, CalendarCheck, ClipboardList, ListChecks, MessagesSquare, Download, ExternalLink, File, FileText, Film, GraduationCap, Image as Img, Link2, Lock, Music, Plus, Presentation, Save, Settings, Trash2, Upload, UserRound, Users, Video,
} from 'lucide-react';
import { dato, rpc, sb } from '../lib/sb';
import { usePerfil } from '../lib/sesion';
import { DIAS, fecha, hoyISO, nombreDe, tamano, tipoDeArchivo } from '../lib/util';
import { subir, urlFirmada } from '../lib/archivos';
import { Avatar, Campo, Estado, Exportar, Modal, Pestanas, useAviso, Vacio } from '../ui/ui';
import { AvisoAcceso, Cuestionarios, Foro, RiesgoAsistencia, Tareas, useAcceso } from './Aula';

const ESTADOS: [string, string, string][] = [['presente', 'P', 'Presente'], ['atraso', 'A', 'Atraso'], ['licencia', 'L', 'Licencia'], ['falta', 'F', 'Falta']];

export default function Materia() {
  const { id } = useParams();
  const p = usePerfil();
  const [tab, setTab] = useState('contenido');
  const q = useQuery({ queryKey: ['oferta', id], queryFn: async () => dato(await sb.from('v_ofertas').select('*').eq('id', id!).single()) as any });
  const o = q.data;
  const gestiona = !!o && (p.id === o.docente_id || ['sistemas', 'admin', 'director'].includes(p.rol));
  const h = useQuery({ queryKey: ['horario', id], queryFn: async () => dato(await sb.from('horarios').select('*').eq('oferta_id', id!).order('dia')) as any[] });
  const acc = useAcceso();
  const suspendido = !gestiona && !!acc.data?.es_estudiante && !acc.data.habilitado;
  const ops: [string, string, any][] = [
    ['contenido', 'Contenido', <BookOpen size={16} />],
    ['tareas', 'Tareas', <ClipboardList size={16} />],
    ['foro', 'Foro', <MessagesSquare size={16} />],
    ['cuestionarios', 'Cuestionarios', <ListChecks size={16} />],
    ...(gestiona ? [['asistencia', 'Asistencia', <CalendarCheck size={16} />], ['notas', 'Notas', <GraduationCap size={16} />], ['lista', 'Estudiantes', <Users size={16} />], ['ajustes', 'Ajustes', <Settings size={16} />]] as any : [['docente', 'Docente', <UserRound size={16} />]]),
  ];
  return (
    <Estado q={q}>
      {o && (
        <div className="pila">
          <div>
            <Link className="fila chico" style={{ textDecoration: 'none', marginBottom: 6 }} to="/materias"><ArrowLeft size={15} />Mis materias</Link>
            <div className="fila entre envolver">
              <div className="crece" style={{ minWidth: 220 }}>
                <span className="etiqueta inf">{o.sigla} · Paralelo {o.paralelo}</span>
                <h1 style={{ marginTop: 5 }}>{o.materia}</h1>
                <div className="tenue chico">{o.periodo} · {o.docente ?? 'Docente por asignar'}</div>
                {!!h.data?.length && <div className="tenue chico">{h.data.map((x: any) => `${DIAS[x.dia]} ${x.inicio.slice(0, 5)}–${x.fin.slice(0, 5)}`).join(' · ')}</div>}
              </div>
              {o.enlace_clase && <a className="boton prim" href={o.enlace_clase} target="_blank" rel="noopener noreferrer"><Video size={17} />Entrar a clase</a>}
            </div>
          </div>
          <AvisoAcceso />
          <div>
            <Pestanas opciones={ops} valor={tab} cambiar={setTab} />
            {suspendido && ['contenido', 'tareas', 'foro', 'cuestionarios'].includes(tab) ? null : <>
            {tab === 'contenido' && <Contenido oferta={o} gestiona={gestiona} />}
            {tab === 'tareas' && <Tareas oferta={o} gestiona={gestiona} />}
            {tab === 'foro' && <Foro oferta={o} gestiona={gestiona} />}
            {tab === 'cuestionarios' && <Cuestionarios oferta={o} gestiona={gestiona} />}
            </>}
            {tab === 'asistencia' && <div className="pila"><RiesgoAsistencia oferta={o} /><Asistencia oferta={o} /></div>}
            {tab === 'notas' && <Planilla oferta={o} />}
            {tab === 'lista' && <Lista oferta={o} />}
            {tab === 'ajustes' && <Ajustes oferta={o} />}
            {tab === 'docente' && <FichaDocente id={o.docente_id} />}
          </div>
        </div>
      )}
    </Estado>
  );
}

/* ─── Contenido: temario y materiales ─── */
const ICONO: Record<string, any> = { pdf: FileText, presentacion: Presentation, video: Film, audio: Music, imagen: Img, documento: File, enlace: Link2 };
function Contenido({ oferta, gestiona }: { oferta: any; gestiona: boolean }) {
  const qc = useQueryClient(); const aviso = useAviso();
  const temas = useQuery({ queryKey: ['temas', oferta.id], queryFn: async () => dato(await sb.from('temas').select('*').eq('oferta_id', oferta.id).order('orden')) as any[] });
  const mats = useQuery({ queryKey: ['materiales', oferta.id], queryFn: async () => dato(await sb.from('materiales').select('*').eq('oferta_id', oferta.id).order('creado_en', { ascending: false }).limit(300)) as any[] });
  const [nuevoTema, setNT] = useState(false); const [nuevoMat, setNM] = useState(false);
  const inv = () => { qc.invalidateQueries({ queryKey: ['temas', oferta.id] }); qc.invalidateQueries({ queryKey: ['materiales', oferta.id] }); };
  const abrir = async (m: any) => {
    try {
      if (m.url) return void window.open(m.url, '_blank', 'noopener');
      window.open(await urlFirmada('materiales', m.storage_path), '_blank', 'noopener');
    } catch (e: any) { aviso(e.message, true); }
  };
  const borrar = async (m: any) => {
    if (!confirm(`¿Borrar "${m.titulo}"?`)) return;
    try {
      dato(await sb.from('materiales').delete().eq('id', m.id));
      if (m.storage_path) await sb.storage.from('materiales').remove([m.storage_path]);
      inv();
    } catch (e: any) { aviso(e.message, true); }
  };
  const sinTema = (mats.data ?? []).filter((m: any) => !m.tema_id);
  const fila = (m: any) => {
    const I = ICONO[m.tipo] ?? File;
    return (
      <div className="persona" key={m.id}>
        <I size={20} className="tenue" />
        <div className="crece"><div className="neg corta">{m.titulo}</div><div className="tenue chico">{m.tipo}{m.tamano ? ' · ' + tamano(m.tamano) : ''}{m.descripcion ? ' · ' + m.descripcion : ''}</div></div>
        <button className="boton ch" onClick={() => abrir(m)}>{m.url ? <ExternalLink size={15} /> : <Download size={15} />}Abrir</button>
        {gestiona && <button className="icono-btn" aria-label={`Borrar ${m.titulo}`} onClick={() => borrar(m)}><Trash2 size={17} /></button>}
      </div>
    );
  };
  return (
    <div className="pila">
      {gestiona && (
        <div className="fila envolver">
          <button className="boton prim" onClick={() => setNM(true)}><Upload size={16} />Subir material</button>
          <button className="boton" onClick={() => setNT(true)}><Plus size={16} />Agregar tema</button>
        </div>
      )}
      <Estado q={temas}>
        {!temas.data?.length && !sinTema.length ? <div className="tarjeta"><Vacio titulo="Todavía no hay contenido" texto={gestiona ? 'Agrega tu temario y sube tus materiales.' : 'Tu docente aún no publicó materiales.'} /></div> : (
          <>
            {(temas.data ?? []).map((t: any, i: number) => (
              <section className="tarjeta" key={t.id}>
                <div className="fila entre"><h3>Tema {i + 1}. {t.titulo}</h3>
                  {gestiona && <button className="icono-btn" aria-label={`Borrar tema ${t.titulo}`} onClick={async () => { if (confirm('¿Borrar este tema? Sus materiales se conservan.')) { dato(await sb.from('temas').delete().eq('id', t.id)); inv(); } }}><Trash2 size={17} /></button>}
                </div>
                {t.descripcion && <p className="tenue" style={{ margin: '4px 0 8px', whiteSpace: 'pre-wrap' }}>{t.descripcion}</p>}
                {(mats.data ?? []).filter((m: any) => m.tema_id === t.id).map(fila)}
              </section>
            ))}
            {sinTema.length > 0 && <section className="tarjeta"><h3>Materiales generales</h3>{sinTema.map(fila)}</section>}
          </>
        )}
      </Estado>
      {nuevoTema && <FormTema oferta={oferta} orden={(temas.data?.length ?? 0) + 1} cerrar={() => { setNT(false); inv(); }} />}
      {nuevoMat && <FormMaterial oferta={oferta} temas={temas.data ?? []} cerrar={() => { setNM(false); inv(); }} />}
    </div>
  );
}
function FormTema({ oferta, orden, cerrar }: { oferta: any; orden: number; cerrar: () => void }) {
  const [t, setT] = useState(''); const [d, setD] = useState(''); const aviso = useAviso();
  return (
    <Modal titulo="Nuevo tema" cerrar={cerrar}>
      <form className="pila" onSubmit={async (e) => { e.preventDefault(); try { dato(await sb.from('temas').insert({ oferta_id: oferta.id, titulo: t, descripcion: d || null, orden })); cerrar(); } catch (x: any) { aviso(x.message, true); } }}>
        <Campo etiqueta="Título"><input className="ent" required value={t} onChange={(e) => setT(e.target.value)} /></Campo>
        <Campo etiqueta="Descripción"><textarea className="ent" value={d} onChange={(e) => setD(e.target.value)} /></Campo>
        <button className="boton prim">Guardar tema</button>
      </form>
    </Modal>
  );
}
function FormMaterial({ oferta, temas, cerrar }: { oferta: any; temas: any[]; cerrar: () => void }) {
  const aviso = useAviso();
  const [modo, setModo] = useState<'archivo' | 'enlace'>('archivo');
  const [titulo, setT] = useState(''); const [tema, setTema] = useState(''); const [arch, setA] = useState<File | null>(null); const [url, setU] = useState('');
  const [prog, setP] = useState<number | null>(null);
  const enviar = async (e: any) => {
    e.preventDefault();
    try {
      let f: any = { oferta_id: oferta.id, titulo: titulo || arch?.name, tema_id: tema || null };
      if (modo === 'archivo') {
        if (!arch) return aviso('Elige un archivo', true);
        setP(0);
        const ruta = await subir('materiales', oferta.id, arch, undefined, setP);
        const t = tipoDeArchivo(arch.type, arch.name);
        const tipo = t === 'archivo' ? (/\.(pptx?|odp|key)$/i.test(arch.name) ? 'presentacion' : 'documento') : t;
        f = { ...f, tipo, storage_path: ruta, mime: arch.type, tamano: arch.size };
      } else {
        if (!/^https:\/\//.test(url)) return aviso('El enlace debe empezar con https://', true);
        f = { ...f, tipo: /youtu|vimeo|stream/i.test(url) ? 'video' : 'enlace', url };
      }
      dato(await sb.from('materiales').insert(f));
      aviso('Material publicado'); cerrar();
    } catch (x: any) { aviso(x.message, true); setP(null); }
  };
  return (
    <Modal titulo="Subir material" cerrar={cerrar}>
      <form className="pila" onSubmit={enviar}>
        <Pestanas opciones={[['archivo', 'Archivo'], ['enlace', 'Enlace o video externo']]} valor={modo} cambiar={(v) => setModo(v as any)} />
        {modo === 'archivo' ? (
          <Campo etiqueta="PDF, presentación, video, audio o documento" ayuda="Los archivos grandes siguen subiendo aunque se corte la señal.">
            <input className="ent" type="file" required onChange={(e) => setA(e.target.files?.[0] ?? null)} />
          </Campo>
        ) : <Campo etiqueta="Dirección" ayuda="Recomendado para clases grabadas largas."><input className="ent" type="url" required placeholder="https://" value={url} onChange={(e) => setU(e.target.value)} /></Campo>}
        <Campo etiqueta="Título"><input className="ent" required={modo === 'enlace'} value={titulo} onChange={(e) => setT(e.target.value)} /></Campo>
        <Campo etiqueta="Tema"><select className="ent" value={tema} onChange={(e) => setTema(e.target.value)}><option value="">Material general</option>{temas.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}</select></Campo>
        {prog !== null && <div className="barra" role="progressbar" aria-valuenow={prog}><i style={{ width: prog + '%' }} /></div>}
        <button className="boton prim" disabled={prog !== null}>{prog !== null ? `Subiendo ${prog}%` : 'Publicar'}</button>
      </form>
    </Modal>
  );
}

/* ─── Llamar lista ─── */
function useLista(id: string) {
  return useQuery({ queryKey: ['lista', id], queryFn: () => rpc<any[]>('lista_oferta', { p_oferta: id }) });
}
function Asistencia({ oferta }: { oferta: any }) {
  const aviso = useAviso(); const qc = useQueryClient();
  const lista = useLista(oferta.id);
  const reg = useQuery({ queryKey: ['registro', oferta.id], queryFn: () => rpc<any>('registro_asistencia', { p_oferta: oferta.id }) });
  const [f, setF] = useState(hoyISO()); const [tema, setTema] = useState('');
  const [marcas, setM] = useState<Record<string, string>>({});
  useEffect(() => {
    const s = (reg.data?.sesiones ?? []).find((x: any) => x.fecha === f);
    const m: Record<string, string> = {};
    if (s) for (const a of reg.data.marcas) if (a.sesion_id === s.id) m[a.estudiante_id] = a.estado;
    setM(m); setTema(s?.tema ?? '');
  }, [f, reg.data]);
  const guardar = useMutation({
    mutationFn: () => rpc('pasar_asistencia', { p_oferta: oferta.id, p_fecha: f, p_tema: tema || null, p_marcas: (lista.data ?? []).map((e: any) => ({ estudiante_id: e.estudiante_id, estado: marcas[e.estudiante_id] ?? 'falta' })) }),
    onSuccess: () => { aviso('Asistencia guardada'); qc.invalidateQueries({ queryKey: ['registro', oferta.id] }); },
    onError: (e: any) => aviso(e.message, true),
  });
  const todos = () => setM(Object.fromEntries((lista.data ?? []).map((e: any) => [e.estudiante_id, 'presente'])));
  const cuenta = useMemo(() => Object.values(marcas).filter((x) => x === 'presente' || x === 'atraso').length, [marcas]);
  const reporte = () => {
    const ses: any[] = reg.data?.sesiones ?? [];
    const letra: any = { presente: 'P', atraso: 'A', licencia: 'L', falta: 'F' };
    return {
      titulo: 'Registro de asistencia', subtitulo: `${oferta.sigla} ${oferta.materia} · Paralelo ${oferta.paralelo} · ${oferta.periodo} · Docente: ${oferta.docente ?? ''}`,
      archivo: `Asistencia_${oferta.sigla}_${oferta.paralelo}`, horizontal: true,
      columnas: ['Código', 'Estudiante', ...ses.map((s) => s.fecha.slice(5)), '% Asist.'],
      filas: (lista.data ?? []).map((e: any) => {
        const ms = ses.map((s) => reg.data.marcas.find((a: any) => a.sesion_id === s.id && a.estudiante_id === e.estudiante_id)?.estado);
        const va = ms.filter((x) => x === 'presente' || x === 'atraso' || x === 'licencia').length;
        return [e.codigo, `${e.apellidos} ${e.nombres}`, ...ms.map((x) => (x ? letra[x] : '')), ses.length ? Math.round((va / ses.length) * 100) : ''];
      }),
      pie: 'P: presente · A: atraso · L: licencia · F: falta',
    };
  };
  return (
    <Estado q={lista} vacio={<div className="tarjeta"><Vacio titulo="Aún no hay estudiantes inscritos" /></div>}>
      <div className="pila">
        <div className="tarjeta form">
          <Campo etiqueta="Fecha de la clase"><input className="ent" type="date" value={f} max={hoyISO()} onChange={(e) => setF(e.target.value)} /></Campo>
          <Campo etiqueta="Tema de la clase"><input className="ent" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Opcional" /></Campo>
        </div>
        <div className="fila entre envolver">
          <span className="tenue chico">{cuenta} de {lista.data?.length ?? 0} presentes · sin marcar cuenta como falta</span>
          <span className="fila"><button className="boton ch" onClick={todos}>Marcar todos presentes</button><Exportar reporte={reporte} disabled={!reg.data} /></span>
        </div>
        <div className="tarjeta" style={{ padding: '4px 14px' }}>
          {(lista.data ?? []).map((e: any) => (
            <div className="persona" key={e.estudiante_id}>
              <Avatar ruta={e.foto_path} nombre={`${e.nombres} ${e.apellidos}`} tam={36} />
              <div className="crece"><div className="neg corta">{e.apellidos} {e.nombres}</div><div className="tenue chico">{e.codigo}</div></div>
              <div className="marcas" role="radiogroup" aria-label={`Asistencia de ${e.nombres}`}>
                {ESTADOS.map(([k, l, t]) => <button key={k} type="button" role="radio" aria-checked={marcas[e.estudiante_id] === k} aria-label={t} title={t} className={(marcas[e.estudiante_id] === k ? 'on ' : '') + k} onClick={() => setM({ ...marcas, [e.estudiante_id]: k })}>{l}</button>)}
              </div>
            </div>
          ))}
        </div>
        <button className="boton prim" disabled={guardar.isPending || oferta.acta_cerrada} onClick={() => guardar.mutate()}><Save size={17} />{guardar.isPending ? 'Guardando…' : 'Guardar asistencia'}</button>
        {oferta.acta_cerrada && <div className="aviso med"><Lock size={18} />El acta está cerrada: la asistencia ya no se puede cambiar.</div>}
      </div>
    </Estado>
  );
}

/* ─── Planilla de notas ─── */
function Planilla({ oferta }: { oferta: any }) {
  const aviso = useAviso(); const qc = useQueryClient();
  const lista = useLista(oferta.id);
  const pl = useQuery({ queryKey: ['planilla', oferta.id], queryFn: () => rpc<any>('planilla_notas', { p_oferta: oferta.id }) });
  const [val, setVal] = useState<Record<string, string>>({});
  const [nueva, setN] = useState(false);
  const llave = (ev: string, es: string) => ev + '|' + es;
  useEffect(() => {
    if (!pl.data) return;
    setVal(Object.fromEntries(pl.data.notas.map((n: any) => [llave(n.evaluacion_id, n.estudiante_id), n.nota == null ? '' : String(n.nota)])));
  }, [pl.data]);
  const evs: any[] = pl.data?.evaluaciones ?? [];
  const suma = evs.reduce((a, e) => a + Number(e.ponderacion), 0);
  const cerrada = oferta.acta_cerrada;
  const inv = () => { qc.invalidateQueries({ queryKey: ['planilla', oferta.id] }); qc.invalidateQueries({ queryKey: ['oferta', oferta.id] }); };
  const guardar = useMutation({
    mutationFn: async () => {
      for (const v of Object.values(val)) { if (v !== '' && !(Number(v) >= 0 && Number(v) <= 100)) throw new Error('Las notas van de 0 a 100.'); }
      for (const e of evs) {
        const notas = (lista.data ?? []).map((x: any) => ({ estudiante_id: x.estudiante_id, nota: val[llave(e.id, x.estudiante_id)] ?? '' }));
        await rpc('guardar_notas', { p_evaluacion: e.id, p_notas: notas });
      }
    },
    onSuccess: () => { aviso('Notas guardadas'); inv(); },
    onError: (e: any) => aviso(e.message, true),
  });
  const cerrar = useMutation({
    mutationFn: async () => { await guardar.mutateAsync(); return rpc<number>('cerrar_acta', { p_oferta: oferta.id }); },
    onSuccess: (n) => { aviso(`Acta cerrada: ${n} notas finales publicadas`); inv(); },
    onError: (e: any) => aviso(e.message, true),
  });
  const publicar = async (e: any) => { try { dato(await sb.from('evaluaciones').update({ publicada: !e.publicada }).eq('id', e.id)); inv(); } catch (x: any) { aviso(x.message, true); } };
  const finalDe = (es: string) => pl.data?.finales.find((f: any) => f.estudiante_id === es);
  const parcial = (es: string) => evs.reduce((a, e) => a + (Number(val[llave(e.id, es)] || 0) * Number(e.ponderacion)) / 100, 0);
  const reporte = () => ({
    titulo: cerrada ? 'Acta de notas' : 'Planilla de notas', subtitulo: `${oferta.sigla} ${oferta.materia} · Paralelo ${oferta.paralelo} · ${oferta.periodo} · Docente: ${oferta.docente ?? ''}`,
    archivo: `Notas_${oferta.sigla}_${oferta.paralelo}`, horizontal: evs.length > 3,
    columnas: ['Código', 'Estudiante', ...evs.map((e) => `${e.nombre} (${Number(e.ponderacion)}%)`), 'Final', 'Situación'],
    filas: (lista.data ?? []).map((x: any) => {
      const f = finalDe(x.estudiante_id);
      return [x.codigo, `${x.apellidos} ${x.nombres}`, ...evs.map((e) => { const v = val[llave(e.id, x.estudiante_id)]; return v === '' || v == null ? '' : Number(v); }), f ? Number(f.nota) : Number(parcial(x.estudiante_id).toFixed(2)), f ? (f.aprobado ? 'Aprobado' : 'Reprobado') : 'En curso'];
    }),
  });
  return (
    <Estado q={pl}>
      <div className="pila">
        <div className="fila entre envolver">
          <span className={'etiqueta ' + (suma === 100 ? 'ok' : 'med')}>Ponderación: {suma} de 100</span>
          <span className="fila envolver">
            {!cerrada && <button className="boton ch" onClick={() => setN(true)}><Plus size={15} />Evaluación</button>}
            <Exportar reporte={reporte} disabled={!lista.data} />
          </span>
        </div>
        {!evs.length ? <div className="tarjeta"><Vacio icono={<ClipboardList size={34} strokeWidth={1.4} />} titulo="Crea tus evaluaciones" texto="Por ejemplo: Primer parcial 30, Segundo parcial 30, Final 40." /></div> : (
          <>
            <div className="tabla-c" style={{ maxHeight: '62vh' }}>
              <table className="tabla">
                <thead><tr><th>Estudiante</th>{evs.map((e) => (
                  <th key={e.id} className="der">
                    <div>{e.nombre} · {Number(e.ponderacion)}%</div>
                    {!cerrada && <button className={'etiqueta ' + (e.publicada ? 'ok' : '')} style={{ border: 0, cursor: 'pointer', marginTop: 3 }} onClick={() => publicar(e)}>{e.publicada ? 'Publicada' : 'Sin publicar'}</button>}
                  </th>
                ))}<th className="der">Final</th></tr></thead>
                <tbody>
                  {(lista.data ?? []).map((x: any) => {
                    const f = finalDe(x.estudiante_id);
                    return (
                      <tr key={x.estudiante_id}>
                        <td className="nowrap"><div className="neg">{x.apellidos} {x.nombres}</div><div className="tenue chico">{x.codigo}</div></td>
                        {evs.map((e) => (
                          <td key={e.id} className="der">
                            <input className="nota" inputMode="decimal" aria-label={`${e.nombre} de ${x.nombres}`} disabled={cerrada} value={val[llave(e.id, x.estudiante_id)] ?? ''} onChange={(ev) => setVal({ ...val, [llave(e.id, x.estudiante_id)]: ev.target.value.replace(',', '.') })} />
                          </td>
                        ))}
                        <td className="der neg">{f ? <span className={'etiqueta ' + (f.aprobado ? 'ok' : 'mal')}>{Number(f.nota)}</span> : parcial(x.estudiante_id).toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {cerrada ? <div className="aviso med"><Lock size={18} />Acta cerrada. Solo administración puede reabrirla, y queda registrado.</div> : (
              <div className="fila envolver">
                <button className="boton prim" disabled={guardar.isPending} onClick={() => guardar.mutate()}><Save size={17} />{guardar.isPending ? 'Guardando…' : 'Guardar notas'}</button>
                <button className="boton peligro" disabled={cerrar.isPending || suma !== 100} onClick={() => { if (confirm('Al cerrar el acta se publican las notas finales y ya no podrás cambiarlas. ¿Continuar?')) cerrar.mutate(); }}><Lock size={16} />Cerrar acta</button>
              </div>
            )}
          </>
        )}
        {nueva && <FormEval oferta={oferta} resto={100 - suma} orden={evs.length + 1} cerrar={() => { setN(false); inv(); }} />}
      </div>
    </Estado>
  );
}
function FormEval({ oferta, resto, orden, cerrar }: { oferta: any; resto: number; orden: number; cerrar: () => void }) {
  const [n, setN] = useState(''); const [p, setP] = useState(String(resto > 0 ? resto : '')); const aviso = useAviso();
  return (
    <Modal titulo="Nueva evaluación" cerrar={cerrar}>
      <form className="pila" onSubmit={async (e) => { e.preventDefault(); try { dato(await sb.from('evaluaciones').insert({ oferta_id: oferta.id, nombre: n, ponderacion: Number(p), orden })); cerrar(); } catch (x: any) { aviso(x.message, true); } }}>
        <Campo etiqueta="Nombre"><input className="ent" required value={n} onChange={(e) => setN(e.target.value)} placeholder="Primer parcial" /></Campo>
        <Campo etiqueta="Ponderación (%)" ayuda={`Disponible: ${resto}`}><input className="ent" required type="number" min="1" max={Math.max(resto, 1)} value={p} onChange={(e) => setP(e.target.value)} /></Campo>
        <button className="boton prim">Crear</button>
      </form>
    </Modal>
  );
}

/* ─── Estudiantes y ajustes ─── */
function Lista({ oferta }: { oferta: any }) {
  const lista = useLista(oferta.id);
  const reporte = () => ({
    titulo: 'Lista de inscritos', subtitulo: `${oferta.sigla} ${oferta.materia} · Paralelo ${oferta.paralelo} · ${oferta.periodo}`, archivo: `Lista_${oferta.sigla}_${oferta.paralelo}`,
    columnas: ['N.º', 'Código', 'Apellidos', 'Nombres', 'Celular'],
    filas: (lista.data ?? []).map((e: any, i: number) => [i + 1, e.codigo, e.apellidos, e.nombres, e.celular]),
  });
  return (
    <Estado q={lista} vacio={<div className="tarjeta"><Vacio titulo="Aún no hay estudiantes inscritos" /></div>}>
      <div className="pila">
        <div className="fila entre"><span className="tenue chico">{lista.data?.length} estudiantes</span><Exportar reporte={reporte} /></div>
        <div className="tarjeta" style={{ padding: '4px 14px' }}>
          {(lista.data ?? []).map((e: any) => <div className="persona" key={e.estudiante_id}><Avatar ruta={e.foto_path} nombre={`${e.nombres} ${e.apellidos}`} tam={36} /><div className="crece"><div className="neg corta">{e.apellidos} {e.nombres}</div><div className="tenue chico">{e.codigo}{e.celular ? ' · ' + e.celular : ''}</div></div></div>)}
        </div>
      </div>
    </Estado>
  );
}
function Ajustes({ oferta }: { oferta: any }) {
  const [url, setU] = useState(oferta.enlace_clase ?? ''); const aviso = useAviso(); const qc = useQueryClient();
  return (
    <form className="tarjeta pila" onSubmit={async (e) => {
      e.preventDefault();
      try {
        if (url && !/^https:\/\//.test(url)) throw new Error('El enlace debe empezar con https://');
        dato(await sb.from('ofertas').update({ enlace_clase: url || null }).eq('id', oferta.id));
        aviso('Enlace guardado'); qc.invalidateQueries({ queryKey: ['oferta', oferta.id] });
      } catch (x: any) { aviso(x.message, true); }
    }}>
      <Campo etiqueta="Enlace de la clase en vivo" ayuda="Meet, Zoom o Teams. Solo lo ven tus estudiantes inscritos."><input className="ent" type="url" placeholder="https://" value={url} onChange={(e) => setU(e.target.value)} /></Campo>
      <button className="boton prim" style={{ alignSelf: 'flex-start' }}>Guardar</button>
    </form>
  );
}
function FichaDocente({ id }: { id?: string }) {
  const aviso = useAviso();
  const d = useQuery({ queryKey: ['docente', id], enabled: !!id, queryFn: async () => dato(await sb.from('v_docentes').select('*').eq('id', id!).maybeSingle()) as any });
  const cv = useQuery({ queryKey: ['cv', id], enabled: !!id, queryFn: async () => dato(await sb.from('cv_items').select('*').eq('docente_id', id!).order('desde', { ascending: false })) as any[] });
  if (!id) return <div className="tarjeta"><Vacio titulo="Docente por asignar" /></div>;
  return (
    <Estado q={d}>
      {d.data && (
        <div className="tarjeta pila">
          <div className="fila"><Avatar ruta={d.data.foto_path} nombre={nombreDe(d.data)} tam={64} /><div><h2>{d.data.titulo ? d.data.titulo + ' ' : ''}{nombreDe(d.data)}</h2><div className="tenue">{d.data.especialidad}</div></div></div>
          {d.data.biografia && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.data.biografia}</p>}
          {(cv.data ?? []).map((c: any) => <div key={c.id}><div className="neg">{c.titulo}</div><div className="tenue chico">{c.institucion}{c.desde ? ' · ' + fecha(c.desde) : ''}</div></div>)}
          {d.data.cv_path && <button className="boton" style={{ alignSelf: 'flex-start' }} onClick={async () => { try { window.open(await urlFirmada('perfiles', d.data.cv_path), '_blank', 'noopener'); } catch (e: any) { aviso(e.message, true); } }}><Download size={16} />Hoja de vida</button>}
        </div>
      )}
    </Estado>
  );
}
