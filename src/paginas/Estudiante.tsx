import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, GraduationCap, Lock } from 'lucide-react';
import { usePerfil } from '../lib/sesion';
import { dato, rpc, sb } from '../lib/sb';
import { bs, DIAS, fecha, nombreDe } from '../lib/util';
import { Estado, Exportar, Kpi, Vacio } from '../ui/ui';
import { horariosDe, misOfertas } from './datos';

function Bloqueo({ deuda }: { deuda: number }) {
  return (
    <div className="tarjeta">
      <Vacio icono={<Lock size={36} strokeWidth={1.4} />} titulo="Tus notas están bloqueadas" texto={`Tienes ${bs(deuda)} vencidos. Se desbloquean apenas Finanzas confirme tu pago.`} accion={<Link className="boton prim" to="/pagos">Ir a mis pagos</Link>} />
    </div>
  );
}
const useFin = () => useQuery({ queryKey: ['estado-fin'], queryFn: () => rpc<any>('mi_estado_financiero') });
const useEst = (id: string) => useQuery({ queryKey: ['mi-estudiante', id], queryFn: async () => dato(await sb.from('estudiantes').select('*').eq('id', id).maybeSingle()) as any });

export function Notas() {
  const p = usePerfil();
  const fin = useFin();
  const of = useQuery({ queryKey: ['mis-ofertas', p.id], queryFn: () => misOfertas(p) });
  const notas = useQuery({ queryKey: ['mis-notas', p.id], enabled: !!fin.data?.al_dia, queryFn: async () => dato(await sb.from('v_mis_notas').select('*').eq('estudiante_id', p.id).order('orden')) as any[] });
  const finales = useQuery({ queryKey: ['kardex', p.id], enabled: !!fin.data?.al_dia, queryFn: async () => dato(await sb.from('v_kardex').select('*').eq('estudiante_id', p.id)) as any[] });
  if (fin.data && !fin.data.al_dia) return <Bloqueo deuda={fin.data.deuda_vencida} />;
  const ofertas = of.data ?? [];
  const reporte = () => ({
    titulo: 'Notas del periodo', subtitulo: `${nombreDe(p)} · ${p.usuario}`, archivo: `Notas_${p.usuario}`,
    columnas: ['Materia', 'Evaluación', 'Ponderación', 'Nota'],
    filas: (notas.data ?? []).map((n: any) => { const o = ofertas.find((x: any) => x.id === n.oferta_id); return [o ? `${o.sigla} ${o.materia}` : '', n.evaluacion, `${Number(n.ponderacion)}%`, n.nota == null ? '' : Number(n.nota)]; }),
  });
  return (
    <Estado q={of} vacio={<div className="tarjeta"><Vacio icono={<GraduationCap size={34} strokeWidth={1.4} />} titulo="Aún no tienes materias" /></div>}>
      <div className="pila">
        <div className="fila entre"><span className="tenue chico">Solo ves evaluaciones publicadas por tu docente.</span><Exportar reporte={reporte} disabled={!notas.data?.length} /></div>
        <div className="rejilla">
          {ofertas.map((o: any) => {
            const m = (notas.data ?? []).filter((n: any) => n.oferta_id === o.id);
            const f = (finales.data ?? []).find((x: any) => x.oferta_id === o.id);
            return (
              <section className="tarjeta" key={o.id}>
                <div className="fila entre"><span className="etiqueta inf">{o.sigla}</span>{f && <span className={'etiqueta ' + (f.aprobado ? 'ok' : 'mal')}>{f.aprobado ? 'Aprobado' : 'Reprobado'} · {Number(f.nota)}</span>}</div>
                <h3 style={{ margin: '8px 0 6px' }}>{o.materia}</h3>
                {m.length === 0 ? <p className="tenue chico" style={{ margin: 0 }}>Sin notas publicadas todavía.</p> : m.map((n: any) => (
                  <div className="fila entre chico" key={n.evaluacion_id} style={{ padding: '4px 0' }}><span>{n.evaluacion} <span className="tenue">({Number(n.ponderacion)}%)</span></span><b>{n.nota == null ? '—' : Number(n.nota)}</b></div>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </Estado>
  );
}

export function Kardex() {
  const p = usePerfil();
  const fin = useFin(); const est = useEst(p.id);
  const q = useQuery({ queryKey: ['kardex', p.id], enabled: !!fin.data?.al_dia, queryFn: async () => dato(await sb.from('v_kardex').select('*').eq('estudiante_id', p.id).order('inicio')) as any[] });
  if (fin.data && !fin.data.al_dia) return <Bloqueo deuda={fin.data.deuda_vencida} />;
  const f = q.data ?? [];
  const aprob = f.filter((x: any) => x.aprobado);
  const prom = f.length ? f.reduce((a: number, x: any) => a + Number(x.nota), 0) / f.length : 0;
  const cred = aprob.reduce((a: number, x: any) => a + x.creditos, 0);
  const reporte = () => ({
    titulo: 'Kardex académico', subtitulo: `${nombreDe(p)} · Código ${est.data?.codigo ?? ''} · CI ${p.ci ?? ''}`, archivo: `Kardex_${est.data?.codigo ?? p.usuario}`,
    columnas: ['Periodo', 'Sigla', 'Materia', 'Créditos', 'Nota', 'Situación'],
    filas: f.map((x: any) => [x.periodo, x.sigla, x.materia, x.creditos, Number(x.nota), x.aprobado ? 'Aprobado' : 'Reprobado']),
    pie: `Promedio: ${prom.toFixed(2)} · Materias aprobadas: ${aprob.length} de ${f.length} · Créditos: ${cred}. Documento informativo, no reemplaza a un certificado oficial.`,
  });
  return (
    <div className="pila">
      <div className="kpis">
        <Kpi titulo="Promedio" valor={prom.toFixed(1)} />
        <Kpi titulo="Materias aprobadas" valor={`${aprob.length} de ${f.length}`} />
        <Kpi titulo="Créditos" valor={cred} />
      </div>
      <div className="fila entre"><h2>Historial</h2><Exportar reporte={reporte} disabled={!f.length} /></div>
      <Estado q={q} vacio={<div className="tarjeta"><Vacio titulo="Sin materias concluidas" texto="Aparecerán cuando tus docentes cierren sus actas." /></div>}>
        <div className="tabla-c"><table className="tabla">
          <thead><tr><th>Periodo</th><th>Materia</th><th className="der">Créditos</th><th className="der">Nota</th><th>Situación</th></tr></thead>
          <tbody>{f.map((x: any) => <tr key={x.oferta_id}><td className="nowrap">{x.periodo}</td><td><b>{x.sigla}</b> {x.materia}</td><td className="der">{x.creditos}</td><td className="der neg">{Number(x.nota)}</td><td><span className={'etiqueta ' + (x.aprobado ? 'ok' : 'mal')}>{x.aprobado ? 'Aprobado' : 'Reprobado'}</span></td></tr>)}</tbody>
        </table></div>
      </Estado>
    </div>
  );
}

const TXT: Record<string, [string, string]> = { presente: ['Presente', 'ok'], atraso: ['Atraso', 'med'], licencia: ['Licencia', 'inf'], falta: ['Falta', 'mal'] };
export function MiAsistencia() {
  const p = usePerfil();
  const of = useQuery({ queryKey: ['mis-ofertas', p.id], queryFn: () => misOfertas(p) });
  const q = useQuery({ queryKey: ['mi-asistencia', p.id], queryFn: async () => dato(await sb.from('v_asistencia_estudiante').select('*').eq('estudiante_id', p.id).order('fecha', { ascending: false }).limit(500)) as any[] });
  const reporte = () => ({
    titulo: 'Registro de asistencia', subtitulo: nombreDe(p), archivo: `Asistencia_${p.usuario}`,
    columnas: ['Fecha', 'Materia', 'Tema', 'Estado'],
    filas: (q.data ?? []).map((a: any) => [a.fecha, (of.data ?? []).find((o: any) => o.id === a.oferta_id)?.materia, a.tema, TXT[a.estado][0]]),
  });
  return (
    <Estado q={q} vacio={<div className="tarjeta"><Vacio titulo="Aún no hay asistencia registrada" /></div>}>
      <div className="pila">
        <div className="fila entre"><span /><Exportar reporte={reporte} /></div>
        <div className="rejilla">
          {(of.data ?? []).map((o: any) => {
            const m = (q.data ?? []).filter((a: any) => a.oferta_id === o.id);
            if (!m.length) return null;
            const va = m.filter((a: any) => a.estado !== 'falta').length;
            const pc = Math.round((va / m.length) * 100);
            return (
              <section className="tarjeta" key={o.id}>
                <div className="fila entre"><h3 className="corta">{o.materia}</h3><b>{pc}%</b></div>
                <div className="barra" style={{ margin: '8px 0' }}><i style={{ width: pc + '%', background: pc < 75 ? 'var(--rojo)' : 'var(--verde)' }} /></div>
                {m.slice(0, 8).map((a: any) => <div className="fila entre chico" key={a.fecha} style={{ padding: '3px 0' }}><span>{fecha(a.fecha)}</span><span className={'etiqueta ' + TXT[a.estado][1]}>{TXT[a.estado][0]}</span></div>)}
              </section>
            );
          })}
        </div>
      </div>
    </Estado>
  );
}

export function Horario() {
  const p = usePerfil();
  const of = useQuery({ queryKey: ['mis-ofertas', p.id], queryFn: () => misOfertas(p) });
  const ids = (of.data ?? []).map((o: any) => o.id);
  const h = useQuery({ queryKey: ['horarios', ids], enabled: ids.length > 0, queryFn: () => horariosDe(ids) });
  const nombre = (id: string) => (of.data ?? []).find((o: any) => o.id === id);
  const reporte = () => ({
    titulo: 'Horario de clases', subtitulo: nombreDe(p), archivo: `Horario_${p.usuario}`, columnas: ['Día', 'Inicio', 'Fin', 'Materia', 'Paralelo'],
    filas: (h.data ?? []).map((x: any) => [DIAS[x.dia], x.inicio.slice(0, 5), x.fin.slice(0, 5), nombre(x.oferta_id)?.materia, nombre(x.oferta_id)?.paralelo]),
  });
  if (!of.isLoading && !ids.length) return <div className="tarjeta"><Vacio icono={<CalendarDays size={34} strokeWidth={1.4} />} titulo="Sin horario todavía" /></div>;
  return (
    <div className="pila">
      <div className="fila entre"><span /><Exportar reporte={reporte} disabled={!h.data?.length} /></div>
      <div className="rejilla">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const l = (h.data ?? []).filter((x: any) => x.dia === d);
          if (!l.length) return null;
          return (
            <section className="tarjeta" key={d}>
              <h3 style={{ marginBottom: 6 }}>{DIAS[d]}</h3>
              {l.map((x: any) => <div className="persona" key={x.id}><b className="chico nowrap">{x.inicio.slice(0, 5)}–{x.fin.slice(0, 5)}</b><Link className="crece corta" style={{ textDecoration: 'none' }} to={`/materias/${x.oferta_id}`}>{nombre(x.oferta_id)?.materia}</Link></div>)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
export default Notas;
