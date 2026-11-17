import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Camera, Check, CheckCircle2, ClipboardList, FileCheck2, Receipt, Search, Upload, Wallet } from 'lucide-react';
import { usePerfil, useSesion } from '../lib/sesion';
import { dato, rpc, sb } from '../lib/sb';
import { bs, DIAS, fecha, MODALIDAD, nombreDe } from '../lib/util';
import { subir, useUrl } from '../lib/archivos';
import { Campo, Estado, Exportar, Kpi, Modal, useAviso, Vacio } from '../ui/ui';
import { carreras, horariosDe } from './datos';

/* ─── Las fotos se reducen en el celular: suben rápido y ocupan menos en el servidor ─── */
async function reducirImagen(f: File, lado = 1800): Promise<File> {
  if (!f.type.startsWith('image/') || f.type === 'image/heic' || f.size < 500_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
    return b ? new File([b], f.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : f;
  } catch { return f; }
}
// Ayuda, no control final: revisa si los bordes de la foto 4x4 son rojos. La decisión es de administración.
async function fondoRojo(f: File): Promise<boolean | null> {
  try {
    const bmp = await createImageBitmap(f);
    const c = document.createElement('canvas'); c.width = 40; c.height = 40;
    const x = c.getContext('2d')!; x.drawImage(bmp, 0, 0, 40, 40);
    const d = x.getImageData(0, 0, 40, 40).data;
    let rojos = 0, total = 0;
    for (let i = 0; i < 40; i++) for (const [a, b] of [[i, 0], [0, i], [39, i]]) {
      const p = (b * 40 + a) * 4; total++;
      if (d[p] > 120 && d[p] > d[p + 1] * 1.8 && d[p] > d[p + 2] * 1.8) rojos++;
    }
    return rojos / total > 0.5;
  } catch { return null; }
}

function Documento({ titulo, ayuda, ruta, alSubir, bloqueado, chequeo }: { titulo: string; ayuda: string; ruta?: string | null; alSubir: (r: string, f: File) => void | Promise<void>; bloqueado: boolean; chequeo?: (f: File) => Promise<string | null> }) {
  const p = usePerfil(); const aviso = useAviso();
  const url = useUrl('postulaciones', ruta);
  const [subiendo, setS] = useState(false); const [alerta, setAlerta] = useState<string | null>(null);
  const elegir = async (ev: any) => {
    const f: File | undefined = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    setS(true); setAlerta(null);
    try {
      if (chequeo) setAlerta(await chequeo(f));
      const r = await subir('postulaciones', p.id, await reducirImagen(f));
      await alSubir(r, f);
    } catch (e: any) { aviso(e.message, true); } finally { setS(false); }
  };
  return (
    <div className="tarjeta pila-s">
      <div className="fila entre"><b>{titulo}</b>{ruta ? <span className="etiqueta ok"><Check size={13} />Subido</span> : <span className="etiqueta med">Falta</span>}</div>
      <span className="tenue chico">{ayuda}</span>
      {url && /\.(jpe?g|png|webp)/i.test(ruta ?? '') && <img src={url} alt={titulo} style={{ maxHeight: 130, maxWidth: '100%', borderRadius: 7, alignSelf: 'flex-start' }} />}
      {alerta && <div className="aviso med chico"><AlertTriangle size={16} />{alerta}</div>}
      {!bloqueado && (
        <label className="boton ch" style={{ alignSelf: 'flex-start' }}>
          <Camera size={15} />{subiendo ? 'Subiendo…' : ruta ? 'Cambiar' : 'Tomar foto o elegir archivo'}
          <input type="file" accept="image/*,application/pdf" hidden disabled={subiendo} onChange={elegir} />
        </label>
      )}
    </div>
  );
}

const DECLARACION = 'Declaro bajo juramento que los datos y documentos que presento son verdaderos y auténticos. Acepto que cualquier falsedad anula mi admisión y mi registro académico, sin perjuicio de las acciones que correspondan, y me comprometo a cumplir la normativa de la Universidad San Francisco Xavier de Chuquisaca.';

const ESTADO_POST: Record<string, [string, string]> = { borrador: ['Borrador', ''], enviada: ['En revisión', 'med'], observada: ['Con observaciones', 'mal'], aprobada: ['Aprobada', 'ok'], rechazada: ['Rechazada', 'mal'] };

export function Postulacion() {
  const p = usePerfil(); const aviso = useAviso(); const qc = useQueryClient();
  const { recargar } = useSesion();
  const q = useQuery({ queryKey: ['mi-post', p.id], queryFn: async () => dato(await sb.from('postulaciones').select('*').eq('usuario_id', p.id).maybeSingle()) as any });
  const car = useQuery({ queryKey: ['carreras'], staleTime: 300_000, queryFn: carreras });
  const [d, setD] = useState<any>({}); const [firma, setFirma] = useState(''); const [acepto, setAcepto] = useState(false);
  // Solo la primera carga llena el formulario: subir un documento no debe borrar lo que se está escribiendo.
  const cargado = useRef(false);
  useEffect(() => { if (q.data && !cargado.current) { cargado.current = true; setD((local: any) => ({ ...q.data, ...local })); } }, [q.data]);
  const bloqueado = !!q.data && !['borrador', 'observada'].includes(q.data.estado);
  const inv = () => { qc.invalidateQueries({ queryKey: ['mi-post', p.id] }); };
  const guardar = async (cambios: any) => {
    const fila = { ...cambios, usuario_id: p.id };
    const r = q.data ? await sb.from('postulaciones').update(cambios).eq('usuario_id', p.id) : await sb.from('postulaciones').upsert(fila, { onConflict: 'usuario_id' });
    dato(r as any); inv();
  };
  const datos = useMutation({
    mutationFn: () => guardar({ carrera_id: d.carrera_id || null, fecha_nacimiento: d.fecha_nacimiento || null, direccion: d.direccion || null, ciudad: d.ciudad || null, colegio: d.colegio || null }),
    onSuccess: () => aviso('Datos guardados'), onError: (e: any) => aviso(e.message, true),
  });
  const enviar = useMutation({
    mutationFn: async () => {
      await guardar({ carrera_id: d.carrera_id || null, fecha_nacimiento: d.fecha_nacimiento || null, direccion: d.direccion || null, ciudad: d.ciudad || null, colegio: d.colegio || null });
      if (!q.data?.declaracion_aceptada_en) {
        if (!acepto || firma.trim().length < 5) throw new Error('Acepta la declaración jurada y escribe tu nombre completo.');
        await guardar({ declaracion: { texto: DECLARACION, firma: firma.trim(), ci: p.ci }, declaracion_aceptada_en: new Date().toISOString() });
      }
      await rpc('enviar_postulacion');
    },
    onSuccess: () => { aviso('Postulación enviada'); inv(); recargar(); },
    onError: (e: any) => aviso(e.message, true),
  });
  const set = (k: string) => ({ value: d[k] ?? '', disabled: bloqueado, onChange: (e: any) => setD({ ...d, [k]: e.target.value }) });
  const est = q.data?.estado ?? 'borrador';
  return (
    <Estado q={q}>
      <div className="pila">
        <div className="tarjeta fila entre"><div><h2>Postulación de {nombreDe(p)}</h2><div className="tenue chico">CI {p.ci}</div></div><span className={'etiqueta ' + ESTADO_POST[est][1]}>{ESTADO_POST[est][0]}</span></div>
        {q.data?.observacion && <div className={'aviso ' + (est === 'rechazada' ? 'mal' : 'med')}><AlertTriangle size={18} /><div><b>Observación de administración:</b> {q.data.observacion}</div></div>}
        <section className="tarjeta pila">
          <h3>1. Tus datos</h3>
          <div className="form">
            <Campo etiqueta="Carrera a la que postulas"><select className="ent" {...set('carrera_id')}><option value="">Elige una carrera</option>{(car.data ?? []).filter((c: any) => c.activa).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
            <Campo etiqueta="Fecha de nacimiento"><input className="ent" type="date" {...set('fecha_nacimiento')} /></Campo>
            <Campo etiqueta="Ciudad"><input className="ent" {...set('ciudad')} /></Campo>
            <Campo etiqueta="Dirección"><input className="ent" {...set('direccion')} /></Campo>
            <Campo etiqueta="Colegio de egreso" todo><input className="ent" {...set('colegio')} /></Campo>
          </div>
          {!bloqueado && <button className="boton" style={{ alignSelf: 'flex-start' }} disabled={datos.isPending} onClick={() => datos.mutate()}>Guardar datos</button>}
        </section>
        <section className="pila">
          <h3>2. Tus documentos</h3>
          <div className="rejilla">
            <Documento titulo="Carnet, anverso" ayuda="Foto nítida y completa." ruta={q.data?.ci_anverso_path} bloqueado={bloqueado} alSubir={(r) => guardar({ ci_anverso_path: r })} />
            <Documento titulo="Carnet, reverso" ayuda="Foto nítida y completa." ruta={q.data?.ci_reverso_path} bloqueado={bloqueado} alSubir={(r) => guardar({ ci_reverso_path: r })} />
            <Documento titulo="Título de bachiller" ayuda="Foto o PDF del título." ruta={q.data?.titulo_path} bloqueado={bloqueado} alSubir={(r) => guardar({ titulo_path: r })} />
            <Documento titulo="Foto 4x4 con fondo rojo" ayuda="De frente, con el fondo completamente rojo." ruta={q.data?.foto_path} bloqueado={bloqueado} alSubir={(r) => guardar({ foto_path: r })}
              chequeo={async (f) => (f.type.startsWith('image/') && (await fondoRojo(f)) === false ? 'El fondo no parece rojo. Administración podría observar esta foto.' : null)} />
          </div>
        </section>
        <section className="tarjeta pila">
          <h3>3. Declaración jurada</h3>
          <p style={{ margin: 0 }}>{DECLARACION}</p>
          {q.data?.declaracion_aceptada_en ? <div className="aviso ok"><CheckCircle2 size={18} />Firmada por {q.data.declaracion?.firma} el {fecha(q.data.declaracion_aceptada_en)}.</div> : (
            <>
              <label className="fila"><input type="checkbox" style={{ width: 20, height: 20 }} checked={acepto} onChange={(e) => setAcepto(e.target.checked)} /><span>Acepto y declaro bajo juramento</span></label>
              <Campo etiqueta="Escribe tu nombre completo como firma"><input className="ent" value={firma} onChange={(e) => setFirma(e.target.value)} /></Campo>
            </>
          )}
        </section>
        {!bloqueado ? <button className="boton prim" style={{ minHeight: 50 }} disabled={enviar.isPending} onClick={() => enviar.mutate()}><FileCheck2 size={19} />{enviar.isPending ? 'Enviando…' : 'Enviar postulación'}</button>
          : est === 'enviada' && <div className="aviso"><FileCheck2 size={18} />Recibimos tu postulación. Te avisaremos cuando administración la revise.</div>}
      </div>
    </Estado>
  );
}

/* ─── Inscripción de materias ─── */
export function Inscripcion() {
  const p = usePerfil(); const aviso = useAviso(); const qc = useQueryClient();
  const est = useQuery({ queryKey: ['mi-estudiante', p.id], queryFn: async () => dato(await sb.from('estudiantes').select('*').eq('id', p.id).maybeSingle()) as any });
  const [buscar, setB] = useState('');
  const hoy = new Date().toISOString().slice(0, 10);
  const ofertas = useQuery({
    queryKey: ['catalogo', est.data?.carrera_id], enabled: !!est.data,
    queryFn: async () => dato(await sb.from('v_ofertas').select('*').eq('carrera_id', est.data.carrera_id).lte('inscripcion_desde', hoy).gte('inscripcion_hasta', hoy).order('nivel').order('materia').limit(300)) as any[],
  });
  const mias = useQuery({ queryKey: ['mis-inscripciones', p.id], queryFn: async () => dato(await sb.from('inscripciones').select('oferta_id').eq('estudiante_id', p.id).eq('estado', 'inscrito')) as any[] });
  const ids = (ofertas.data ?? []).map((o: any) => o.id);
  const h = useQuery({ queryKey: ['horarios', ids], enabled: ids.length > 0, queryFn: () => horariosDe(ids) });
  const inv = () => { for (const k of ['mis-inscripciones', 'mis-ofertas', 'catalogo']) qc.invalidateQueries({ queryKey: [k] }); };
  const ins = useMutation({ mutationFn: (id: string) => rpc('inscribir_materia', { p_oferta: id }), onSuccess: () => { aviso('Inscripción registrada'); inv(); }, onError: (e: any) => aviso(e.message, true) });
  const ret = useMutation({ mutationFn: (id: string) => rpc('retirar_materia', { p_oferta: id }), onSuccess: () => { aviso('Materia retirada'); inv(); }, onError: (e: any) => aviso(e.message, true) });
  const lista = useMemo(() => (ofertas.data ?? []).filter((o: any) => (o.materia + ' ' + o.sigla).toLowerCase().includes(buscar.toLowerCase())), [ofertas.data, buscar]);
  return (
    <Estado q={ofertas} vacio={<div className="tarjeta"><Vacio icono={<ClipboardList size={34} strokeWidth={1.4} />} titulo="No hay inscripciones abiertas" texto="Te avisaremos cuando abra el próximo periodo." /></div>}>
      <div className="pila">
        <label className="fila tarjeta" style={{ padding: '4px 12px' }}><Search size={18} className="tenue" /><input className="ent" style={{ border: 0 }} aria-label="Buscar materia" placeholder="Buscar materia" value={buscar} onChange={(e) => setB(e.target.value)} /></label>
        <div className="rejilla">
          {lista.map((o: any) => {
            const ya = (mias.data ?? []).some((m: any) => m.oferta_id === o.id);
            const lleno = o.inscritos >= o.cupo;
            return (
              <section className="tarjeta pila-s" key={o.id}>
                <div className="fila entre"><span className="etiqueta inf">{o.sigla} · {o.paralelo}</span>{ya ? <span className="etiqueta ok">Inscrito</span> : lleno ? <span className="etiqueta mal">Sin cupos</span> : <span className="etiqueta">{o.cupo - o.inscritos} cupos</span>}</div>
                <h3>{o.materia}</h3>
                <div className="tenue chico">{MODALIDAD[o.modalidad]} · {o.periodo}</div>
                <div className="tenue chico">{o.docente ?? 'Docente por asignar'} · {o.creditos} créditos</div>
                <div className="tenue chico">{(h.data ?? []).filter((x: any) => x.oferta_id === o.id).map((x: any) => `${DIAS[x.dia].slice(0, 3)} ${x.inicio.slice(0, 5)}`).join(' · ') || 'Horario flexible'}</div>
                {ya ? <button className="boton ch peligro" disabled={ret.isPending} onClick={() => { if (confirm(`¿Retirar ${o.materia}?`)) ret.mutate(o.id); }}>Retirar</button>
                  : <button className="boton ch prim" disabled={lleno || ins.isPending} onClick={() => ins.mutate(o.id)}>Inscribirme</button>}
              </section>
            );
          })}
        </div>
      </div>
    </Estado>
  );
}

/* ─── Matrícula y pagos ─── */
const EST_CARGO: Record<string, [string, string]> = { pendiente: ['Pendiente', 'med'], en_revision: ['En revisión', 'inf'], pagado: ['Pagado', 'ok'], anulado: ['Anulado', ''] };
export function Pagos() {
  const p = usePerfil();
  const fin = useQuery({ queryKey: ['estado-fin'], queryFn: () => rpc<any>('mi_estado_financiero') });
  const q = useQuery({ queryKey: ['mis-cargos', p.id], queryFn: async () => dato(await sb.from('cargos').select('*').eq('estudiante_id', p.id).order('vence', { ascending: false }).limit(200)) as any[] });
  const pagos = useQuery({ queryKey: ['mis-pagos', p.id], queryFn: async () => dato(await sb.from('pagos').select('*').eq('estudiante_id', p.id).order('creado_en', { ascending: false }).limit(200)) as any[] });
  const inst = useQuery({ queryKey: ['config-pago'], staleTime: 600_000, queryFn: async () => dato(await sb.from('configuracion').select('valor').eq('clave', 'instrucciones_pago').maybeSingle()) as any });
  const [pagar, setPagar] = useState<any>(null);
  const hoy = new Date().toISOString().slice(0, 10);
  const reporte = () => ({
    titulo: 'Estado de cuenta', subtitulo: `${nombreDe(p)} · CI ${p.ci ?? ''}`, archivo: `Estado_cuenta_${p.usuario}`,
    columnas: ['Concepto', 'Vence', 'Monto (Bs)', 'Estado'],
    filas: (q.data ?? []).map((c: any) => [c.descripcion, c.vence, Number(c.monto), EST_CARGO[c.estado][0]]),
  });
  return (
    <div className="pila">
      <div className="kpis">
        <Kpi titulo="Vencido" valor={bs(fin.data?.deuda_vencida)} />
        <Kpi titulo="Por vencer" valor={bs(fin.data?.por_vencer)} />
        <Kpi titulo="Acceso a notas" valor={fin.data ? (fin.data.al_dia ? 'Habilitado' : 'Bloqueado') : '—'} />
      </div>
      {inst.data?.valor && <div className="aviso"><Wallet size={18} /><span style={{ whiteSpace: 'pre-wrap' }}>{String(inst.data.valor)}</span></div>}
      <div className="fila entre"><h2>Cargos</h2><Exportar reporte={reporte} disabled={!q.data?.length} /></div>
      <Estado q={q} vacio={<div className="tarjeta"><Vacio icono={<Receipt size={34} strokeWidth={1.4} />} titulo="No tienes cargos" /></div>}>
        <div className="pila-s">
          {(q.data ?? []).map((c: any) => {
            const vencido = c.vence < hoy && ['pendiente', 'en_revision'].includes(c.estado);
            const rech = (pagos.data ?? []).find((x: any) => x.cargo_id === c.id && x.estado === 'rechazado');
            return (
              <div className="tarjeta" key={c.id}>
                <div className="fila entre envolver">
                  <div className="crece" style={{ minWidth: 160 }}><b>{c.descripcion}</b><div className={'chico ' + (vencido ? '' : 'tenue')} style={vencido ? { color: 'var(--rojo)' } : undefined}>Vence {fecha(c.vence)}</div></div>
                  <b>{bs(c.monto)}</b>
                  <span className={'etiqueta ' + (vencido ? 'mal' : EST_CARGO[c.estado][1])}>{vencido && c.estado === 'pendiente' ? 'Vencido' : EST_CARGO[c.estado][0]}</span>
                  {c.estado === 'pendiente' && <button className="boton ch prim" onClick={() => setPagar(c)}><Upload size={15} />Reportar pago</button>}
                </div>
                {c.estado === 'pendiente' && rech && <div className="aviso mal chico" style={{ marginTop: 8 }}>Tu último comprobante fue rechazado: {rech.motivo}</div>}
              </div>
            );
          })}
        </div>
      </Estado>
      {pagar && <ReportarPago cargo={pagar} cerrar={() => setPagar(null)} />}
    </div>
  );
}
function ReportarPago({ cargo, cerrar }: { cargo: any; cerrar: () => void }) {
  const p = usePerfil(); const aviso = useAviso(); const qc = useQueryClient();
  const [ref, setR] = useState(''); const [met, setM] = useState('qr'); const [arch, setA] = useState<File | null>(null); const [oc, setO] = useState(false);
  const enviar = async (e: any) => {
    e.preventDefault();
    if (!arch) return aviso('Adjunta la foto del comprobante', true);
    setO(true);
    try {
      const ruta = await subir('comprobantes', p.id, await reducirImagen(arch));
      dato(await sb.from('pagos').insert({ cargo_id: cargo.id, estudiante_id: p.id, monto: cargo.monto, metodo: met, referencia: ref || null, comprobante_path: ruta }));
      aviso('Comprobante enviado a revisión');
      for (const k of ['mis-cargos', 'mis-pagos', 'estado-fin']) qc.invalidateQueries({ queryKey: [k] });
      cerrar();
    } catch (x: any) { aviso(x.message, true); setO(false); }
  };
  return (
    <Modal titulo={`Reportar pago · ${bs(cargo.monto)}`} cerrar={cerrar}>
      <form className="pila" onSubmit={enviar}>
        <div className="neg">{cargo.descripcion}</div>
        <Campo etiqueta="Forma de pago"><select className="ent" value={met} onChange={(e) => setM(e.target.value)}><option value="qr">QR</option><option value="transferencia">Transferencia</option><option value="caja">Caja</option></select></Campo>
        <Campo etiqueta="N.º de transacción"><input className="ent" value={ref} onChange={(e) => setR(e.target.value)} /></Campo>
        <Campo etiqueta="Foto del comprobante"><input className="ent" type="file" accept="image/*,application/pdf" required onChange={(e) => setA(e.target.files?.[0] ?? null)} /></Campo>
        <button className="boton prim" disabled={oc}>{oc ? 'Enviando…' : 'Enviar a revisión'}</button>
      </form>
    </Modal>
  );
}
export default Pagos;
