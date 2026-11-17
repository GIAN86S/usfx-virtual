import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, FileBarChart, Plus, X } from 'lucide-react';
import { usePerfil } from '../lib/sesion';
import { dato, rpc, sb } from '../lib/sb';
import { useUrl } from '../lib/archivos';
import { bs, fecha, nombreDe, num } from '../lib/util';
import { Campo, Estado, Exportar, Kpi, Modal, Pestanas, useAviso, Vacio } from '../ui/ui';
import { carreras, todas } from './datos';

/* ─── Postulaciones ─── */
const ESTADOS: Record<string, [string, string]> = { enviada: ['Por revisar', 'med'], observada: ['Observada', 'mal'], aprobada: ['Aprobada', 'ok'], rechazada: ['Rechazada', 'mal'], borrador: ['Borrador', ''] };
export function Postulaciones() {
  const [est, setEst] = useState('enviada'); const [sel, setSel] = useState<any>(null);
  const car = useQuery({ queryKey: ['carreras'], staleTime: 300_000, queryFn: carreras });
  const q = useQuery({ queryKey: ['postulaciones', est], queryFn: async () => dato(await sb.from('postulaciones').select('*').eq('estado', est).order('creado_en').limit(100)) as any[] });
  const ids = (q.data ?? []).map((p: any) => p.usuario_id);
  const per = useQuery({ queryKey: ['perfiles-post', ids], enabled: ids.length > 0, queryFn: async () => dato(await sb.from('perfiles').select('id,nombres,apellidos,ci,celular,email').in('id', ids)) as any[] });
  const quien = (id: string) => (per.data ?? []).find((x: any) => x.id === id);
  return (
    <div className="pila">
      <Pestanas opciones={Object.entries(ESTADOS).filter(([k]) => k !== 'borrador').map(([k, [t]]) => [k, t])} valor={est} cambiar={setEst} />
      <Estado q={q} vacio={<div className="tarjeta"><Vacio titulo="No hay postulaciones aquí" /></div>}>
        <div className="pila-s">
          {(q.data ?? []).map((p: any) => (
            <div className="tarjeta fila entre envolver" key={p.id}>
              <div className="crece" style={{ minWidth: 200 }}><b>{nombreDe(quien(p.usuario_id))}</b><div className="tenue chico">CI {quien(p.usuario_id)?.ci} · {(car.data ?? []).find((c: any) => c.id === p.carrera_id)?.nombre} · {fecha(p.creado_en)}</div></div>
              <button className="boton ch" onClick={() => setSel({ ...p, persona: quien(p.usuario_id) })}><Eye size={15} />Revisar</button>
            </div>
          ))}
        </div>
      </Estado>
      {sel && <Revisar p={sel} carrera={(car.data ?? []).find((c: any) => c.id === sel.carrera_id)?.nombre} cerrar={() => setSel(null)} />}
    </div>
  );
}
function Doc({ t, ruta }: { t: string; ruta?: string }) {
  const url = useUrl('postulaciones', ruta);
  return (
    <div className="pila-s"><b className="chico">{t}</b>
      {!url ? <span className="tenue chico">Sin archivo</span> : /\.pdf/i.test(ruta ?? '') ? <a className="boton ch" href={url} target="_blank" rel="noopener noreferrer">Abrir PDF</a>
        : <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={t} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 7, border: '1px solid var(--linea)' }} /></a>}
    </div>
  );
}
function Revisar({ p, carrera, cerrar }: { p: any; carrera?: string; cerrar: () => void }) {
  const aviso = useAviso(); const qc = useQueryClient(); const yo = usePerfil();
  const [obs, setObs] = useState('');
  const m = useMutation({
    mutationFn: (a: string) => rpc('resolver_postulacion', { p_id: p.id, p_accion: a, p_observacion: obs || null }),
    onSuccess: () => { aviso('Postulación actualizada'); qc.invalidateQueries({ queryKey: ['postulaciones'] }); qc.invalidateQueries({ queryKey: ['resumen-admin'] }); cerrar(); },
    onError: (e: any) => aviso(e.message, true),
  });
  const puede = ['sistemas', 'admin'].includes(yo.rol) && p.estado === 'enviada';
  return (
    <Modal titulo={nombreDe(p.persona)} cerrar={cerrar}>
      <div className="pila">
        <div className="chico">CI {p.persona?.ci} · {p.persona?.celular} · {carrera}<br />Nacimiento: {fecha(p.fecha_nacimiento)} · {p.ciudad} · {p.colegio}</div>
        <div className="rejilla" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
          <Doc t="Carnet, anverso" ruta={p.ci_anverso_path} /><Doc t="Carnet, reverso" ruta={p.ci_reverso_path} /><Doc t="Título de bachiller" ruta={p.titulo_path} /><Doc t="Foto 4x4" ruta={p.foto_path} />
        </div>
        {p.declaracion && <div className="aviso chico">Declaración jurada firmada por <b>{p.declaracion.firma}</b> el {fecha(p.declaracion_aceptada_en)}.</div>}
        {puede && (
          <>
            <Campo etiqueta="Observación" ayuda="Obligatoria para observar o rechazar."><textarea className="ent" value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
            <div className="fila envolver">
              <button className="boton bien" disabled={m.isPending} onClick={() => m.mutate('aprobada')}><Check size={16} />Aprobar</button>
              <button className="boton" disabled={m.isPending} onClick={() => m.mutate('observada')}>Observar</button>
              <button className="boton peligro" disabled={m.isPending} onClick={() => { if (confirm('¿Rechazar esta postulación?')) m.mutate('rechazada'); }}><X size={16} />Rechazar</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ─── Finanzas ─── */
export function Finanzas() {
  const [tab, setTab] = useState('revision');
  return (
    <div>
      <Pestanas opciones={[['revision', 'Pagos por revisar'], ['generar', 'Generar cargos'], ['morosos', 'Deudas vencidas']]} valor={tab} cambiar={setTab} />
      {tab === 'revision' && <PagosRevision />}
      {tab === 'generar' && <GenerarCargos />}
      {tab === 'morosos' && <Morosos />}
    </div>
  );
}
function Comprobante({ ruta }: { ruta?: string }) {
  const url = useUrl('comprobantes', ruta);
  if (!ruta) return <span className="tenue chico">Sin comprobante</span>;
  if (!url) return null;
  return /\.pdf/i.test(ruta) ? <a className="boton ch" href={url} target="_blank" rel="noopener noreferrer">Ver PDF</a> : <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="Comprobante" style={{ maxHeight: 170, maxWidth: '100%', borderRadius: 7, border: '1px solid var(--linea)' }} /></a>;
}
function PagosRevision() {
  const aviso = useAviso(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['pagos-revision'], queryFn: async () => dato(await sb.from('pagos').select('*').eq('estado', 'revision').order('creado_en').limit(50)) as any[] });
  const est = (q.data ?? []).map((p: any) => p.estudiante_id); const crg = (q.data ?? []).map((p: any) => p.cargo_id);
  const per = useQuery({ queryKey: ['per-pagos', est], enabled: est.length > 0, queryFn: async () => dato(await sb.from('perfiles').select('id,nombres,apellidos,ci').in('id', est)) as any[] });
  const car = useQuery({ queryKey: ['car-pagos', crg], enabled: crg.length > 0, queryFn: async () => dato(await sb.from('cargos').select('id,descripcion').in('id', crg)) as any[] });
  const m = useMutation({
    mutationFn: async ({ id, ok }: { id: string; ok: boolean }) => {
      let motivo: string | null = null;
      if (!ok) { motivo = prompt('Motivo del rechazo'); if (!motivo) throw new Error('Rechazo cancelado'); }
      await rpc('revisar_pago', { p_pago: id, p_aprobar: ok, p_motivo: motivo });
    },
    onSuccess: () => { aviso('Pago revisado'); qc.invalidateQueries({ queryKey: ['pagos-revision'] }); qc.invalidateQueries({ queryKey: ['resumen-admin'] }); },
    onError: (e: any) => aviso(e.message, true),
  });
  return (
    <Estado q={q} vacio={<div className="tarjeta"><Vacio titulo="No hay pagos por revisar" /></div>}>
      <div className="rejilla">
        {(q.data ?? []).map((p: any) => (
          <section className="tarjeta pila-s" key={p.id}>
            <div className="fila entre"><b className="corta">{nombreDe((per.data ?? []).find((x: any) => x.id === p.estudiante_id))}</b><b className="nowrap">{bs(p.monto)}</b></div>
            <div className="tenue chico">{(car.data ?? []).find((x: any) => x.id === p.cargo_id)?.descripcion}</div>
            <div className="tenue chico">{p.metodo} · Ref. {p.referencia ?? '—'} · {fecha(p.creado_en)}</div>
            <Comprobante ruta={p.comprobante_path} />
            <div className="fila" style={{ marginTop: 6 }}>
              <button className="boton ch bien" disabled={m.isPending} onClick={() => m.mutate({ id: p.id, ok: true })}><Check size={15} />Aprobar</button>
              <button className="boton ch peligro" disabled={m.isPending} onClick={() => m.mutate({ id: p.id, ok: false })}><X size={15} />Rechazar</button>
            </div>
          </section>
        ))}
      </div>
    </Estado>
  );
}
function GenerarCargos() {
  const aviso = useAviso();
  const car = useQuery({ queryKey: ['carreras'], staleTime: 300_000, queryFn: carreras });
  const [f, setF] = useState<any>({ concepto: 'mensualidad', carrera: '' });
  const set = (k: string) => ({ value: f[k] ?? '', onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  const m = useMutation({
    mutationFn: () => rpc<number>('generar_cargos', { p_clave: f.clave, p_concepto: f.concepto, p_descripcion: f.descripcion, p_monto: Number(f.monto), p_vence: f.vence, p_carrera: f.carrera || null }),
    onSuccess: (n) => aviso(`${num(n)} cargos generados`), onError: (e: any) => aviso(e.message, true),
  });
  return (
    <form className="tarjeta form" style={{ maxWidth: 700 }} onSubmit={(e) => { e.preventDefault(); if (confirm('¿Generar este cargo a todos los estudiantes activos del filtro?')) m.mutate(); }}>
      <Campo etiqueta="Concepto"><select className="ent" {...set('concepto')}><option value="mensualidad">Mensualidad</option><option value="matricula">Matrícula</option><option value="otro">Otro</option></select></Campo>
      <Campo etiqueta="Carrera"><select className="ent" {...set('carrera')}><option value="">Todas</option>{(car.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
      <Campo etiqueta="Descripción" ayuda="La verá el estudiante."><input className="ent" required placeholder="Mensualidad de noviembre 2026" {...set('descripcion')} /></Campo>
      <Campo etiqueta="Clave única" ayuda="Evita cobrar dos veces lo mismo."><input className="ent" required placeholder="MENS-2026-11" {...set('clave')} /></Campo>
      <Campo etiqueta="Monto (Bs)"><input className="ent" required type="number" min="0" step="0.01" {...set('monto')} /></Campo>
      <Campo etiqueta="Fecha de vencimiento"><input className="ent" required type="date" {...set('vence')} /></Campo>
      <button className="boton prim todo" disabled={m.isPending}><Plus size={16} />{m.isPending ? 'Generando…' : 'Generar cargos'}</button>
    </form>
  );
}
function Morosos() {
  const hoy = new Date().toISOString().slice(0, 10);
  const q = useQuery({ queryKey: ['morosos'], queryFn: async () => dato(await sb.from('cargos').select('id,estudiante_id,descripcion,monto,vence,estado').in('estado', ['pendiente', 'en_revision']).lt('vence', hoy).order('vence').limit(200)) as any[] });
  const ids = [...new Set((q.data ?? []).map((c: any) => c.estudiante_id))];
  const per = useQuery({ queryKey: ['per-moros', ids], enabled: ids.length > 0, queryFn: async () => dato(await sb.from('perfiles').select('id,nombres,apellidos,celular').in('id', ids)) as any[] });
  const quien = (id: string) => (per.data ?? []).find((x: any) => x.id === id);
  const reporte = () => ({ titulo: 'Deudas vencidas', archivo: 'Deudas_vencidas', columnas: ['Estudiante', 'Celular', 'Concepto', 'Vence', 'Monto (Bs)'], filas: (q.data ?? []).map((c: any) => [nombreDe(quien(c.estudiante_id)), quien(c.estudiante_id)?.celular, c.descripcion, c.vence, Number(c.monto)]) });
  return (
    <Estado q={q} vacio={<div className="tarjeta"><Vacio titulo="No hay deudas vencidas" /></div>}>
      <div className="pila">
        <div className="fila entre"><span className="tenue chico">Muestra las 200 más antiguas. El reporte de Reportes trae todas.</span><Exportar reporte={reporte} /></div>
        <div className="tabla-c"><table className="tabla"><thead><tr><th>Estudiante</th><th>Concepto</th><th>Vence</th><th className="der">Monto</th></tr></thead>
          <tbody>{(q.data ?? []).map((c: any) => <tr key={c.id}><td className="nowrap">{nombreDe(quien(c.estudiante_id))}</td><td>{c.descripcion}</td><td className="nowrap">{fecha(c.vence)}</td><td className="der nowrap">{bs(c.monto)}</td></tr>)}</tbody></table></div>
      </div>
    </Estado>
  );
}

/* ─── Reportes (se traen por páginas de 1000 para no bloquear el servidor) ─── */
export function Reportes() {
  const p = usePerfil();
  const res = useQuery({ queryKey: ['resumen-admin'], staleTime: 120_000, queryFn: () => rpc<any>('resumen_admin') });
  const aviso = useAviso();
  const [datos, setDatos] = useState<Record<string, any[]>>({});
  const [car, setCar] = useState(false);
  const preparar = async () => {
    setCar(true);
    try {
      const [est, per, carr, cargos] = await Promise.all([
        todas(async (a, b) => sb.from('estudiantes').select('id,codigo,carrera_id,estado,gestion_ingreso').order('codigo').range(a, b)),
        todas(async (a, b) => sb.from('perfiles').select('id,nombres,apellidos,ci,celular,rol,activo').order('id').range(a, b)),
        carreras(),
        ['sistemas', 'admin', 'finanzas'].includes(p.rol) ? todas(async (a, b) => sb.from('cargos').select('estudiante_id,descripcion,monto,vence,estado').order('id').range(a, b)) : Promise.resolve([]),
      ]);
      setDatos({ est, per, carr, cargos });
      aviso('Reportes listos para descargar');
    } catch (e: any) { aviso(e.message, true); } finally { setCar(false); }
  };
  const P = (id: string) => (datos.per ?? []).find((x: any) => x.id === id);
  const mapa = () => new Map((datos.per ?? []).map((x: any) => [x.id, x]));
  const rep = {
    estudiantes: () => { const m = mapa(); return { titulo: 'Nómina de estudiantes', archivo: 'Nomina_estudiantes', columnas: ['Código', 'Apellidos', 'Nombres', 'CI', 'Celular', 'Carrera', 'Ingreso', 'Estado'], filas: (datos.est ?? []).map((e: any) => { const x: any = m.get(e.id); return [e.codigo, x?.apellidos, x?.nombres, x?.ci, x?.celular, datos.carr.find((c: any) => c.id === e.carrera_id)?.nombre, e.gestion_ingreso, e.estado]; }) }; },
    docentes: () => ({ titulo: 'Nómina de docentes', archivo: 'Nomina_docentes', columnas: ['Apellidos', 'Nombres', 'CI', 'Celular', 'Estado'], filas: (datos.per ?? []).filter((x: any) => x.rol === 'docente').map((x: any) => [x.apellidos, x.nombres, x.ci, x.celular, x.activo ? 'Activo' : 'Inactivo']) }),
    cartera: () => { const m = mapa(); return { titulo: 'Cartera de cobros', archivo: 'Cartera_cobros', horizontal: true, columnas: ['Estudiante', 'Concepto', 'Vence', 'Monto (Bs)', 'Estado'], filas: (datos.cargos ?? []).map((c: any) => [nombreDe(m.get(c.estudiante_id) as any), c.descripcion, c.vence, Number(c.monto), c.estado]) }; },
  };
  return (
    <div className="pila">
      {res.data && <div className="kpis"><Kpi titulo="Estudiantes" valor={num(res.data.estudiantes)} /><Kpi titulo="Docentes" valor={num(res.data.docentes)} /><Kpi titulo="Recaudado este mes" valor={bs(res.data.recaudado_mes)} /><Kpi titulo="Deuda vencida" valor={bs(res.data.deuda_vencida)} /></div>}
      {!datos.est ? (
        <div className="tarjeta"><Vacio icono={<FileBarChart size={34} strokeWidth={1.4} />} titulo="Reportes institucionales" texto="Se preparan por partes para no afectar a quienes usan la plataforma." accion={<button className="boton prim" disabled={car} onClick={preparar}>{car ? 'Preparando…' : 'Preparar reportes'}</button>} /></div>
      ) : (
        <div className="rejilla">
          <section className="tarjeta pila-s"><h3>Nómina de estudiantes</h3><span className="tenue chico">{num(datos.est.length)} registros</span><Exportar reporte={rep.estudiantes} /></section>
          <section className="tarjeta pila-s"><h3>Nómina de docentes</h3><span className="tenue chico">{num(datos.per.filter((x: any) => x.rol === 'docente').length)} registros</span><Exportar reporte={rep.docentes} /></section>
          {datos.cargos.length > 0 && <section className="tarjeta pila-s"><h3>Cartera de cobros</h3><span className="tenue chico">{num(datos.cargos.length)} cargos</span><Exportar reporte={rep.cartera} /></section>}
        </div>
      )}
    </div>
  );
}
export default Postulaciones;
