import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, BookOpen, FileCheck2, MessagesSquare, Video } from 'lucide-react';
import { usePerfil } from '../lib/sesion';
import { dato, rpc, sb } from '../lib/sb';
import { bs, DIAS, num } from '../lib/util';
import { Esqueleto, Kpi, Vacio } from '../ui/ui';
import { misOfertas, horariosDe } from './datos';

function InicioAdmin() {
  const q = useQuery({ queryKey: ['resumen-admin'], staleTime: 120_000, queryFn: () => rpc<any>('resumen_admin') });
  const d = q.data;
  if (q.isLoading) return <Esqueleto />;
  if (!d) return null;
  return (
    <div className="pila">
      <div className="kpis">
        <Kpi titulo="Estudiantes activos" valor={num(d.estudiantes)} />
        <Kpi titulo="Docentes" valor={num(d.docentes)} />
        <Kpi titulo="Carreras" valor={num(d.carreras)} />
        <Kpi titulo="Recaudado este mes" valor={bs(d.recaudado_mes)} />
        <Kpi titulo="Deuda vencida" valor={bs(d.deuda_vencida)} />
      </div>
      <div className="rejilla">
        <Link className="tarjeta enlace" to="/postulaciones"><div className="fila entre"><b>Postulaciones por revisar</b><span className="etiqueta med">{num(d.postulaciones)}</span></div></Link>
        <Link className="tarjeta enlace" to="/finanzas"><div className="fila entre"><b>Pagos por revisar</b><span className="etiqueta med">{num(d.pagos_revision)}</span></div></Link>
      </div>
    </div>
  );
}

function ClasesHoy({ ofertas }: { ofertas: any[] }) {
  const ids = ofertas.map((o) => o.id);
  const h = useQuery({ queryKey: ['horarios', ids], enabled: ids.length > 0, queryFn: () => horariosDe(ids) });
  const dia = ((new Date().getDay() + 6) % 7) + 1;
  const hoy = (h.data ?? []).filter((x: any) => x.dia === dia).sort((a: any, b: any) => a.inicio.localeCompare(b.inicio));
  return (
    <section className="tarjeta">
      <h2 style={{ marginBottom: 10 }}>Clases de hoy, {DIAS[dia].toLowerCase()}</h2>
      {hoy.length === 0 ? <p className="tenue" style={{ margin: 0 }}>Hoy no tienes clases programadas.</p> : hoy.map((x: any) => {
        const o = ofertas.find((y) => y.id === x.oferta_id);
        return (
          <div className="persona" key={x.id}>
            <div className="crece"><div className="neg corta">{o?.materia}</div><div className="tenue chico">{x.inicio.slice(0, 5)} a {x.fin.slice(0, 5)}</div></div>
            {o?.enlace_clase && <a className="boton ch prim" href={o.enlace_clase} target="_blank" rel="noopener noreferrer"><Video size={15} />Entrar</a>}
          </div>
        );
      })}
    </section>
  );
}

export default function Inicio() {
  const p = usePerfil();
  const es = p.rol === 'estudiante';
  const ofertas = useQuery({ queryKey: ['mis-ofertas', p.id], enabled: es || p.rol === 'docente', queryFn: () => misOfertas(p) });
  const fin = useQuery({ queryKey: ['estado-fin'], enabled: es, queryFn: () => rpc<any>('mi_estado_financiero') });
  const post = useQuery({ queryKey: ['mi-post', p.id], enabled: p.rol === 'postulante', queryFn: async () => dato(await sb.from('postulaciones').select('estado').eq('usuario_id', p.id).maybeSingle()) as any });

  return (
    <div className="pila">
      <div>
        <h1>Hola, {p.nombres.split(' ')[0] || p.usuario}</h1>
        <p className="tenue" style={{ margin: '4px 0 0' }}>Te damos la bienvenida a USFX Virtual.</p>
      </div>
      {['sistemas', 'admin', 'finanzas', 'director'].includes(p.rol) && <InicioAdmin />}
      {p.rol === 'postulante' && (
        <Link className="tarjeta enlace" to="/postulacion">
          <div className="fila"><FileCheck2 size={24} /><div className="crece"><b>Tu postulación</b><div className="tenue chico">{post.data ? 'Estado: ' + post.data.estado : 'Completa tus datos y sube tus documentos.'}</div></div><ArrowRight size={18} /></div>
        </Link>
      )}
      {es && fin.data && !fin.data.al_dia && (
        <div className="aviso mal"><AlertTriangle size={20} /><div className="crece"><b>Tienes {bs(fin.data.deuda_vencida)} vencidos.</b> Tus notas y kardex están bloqueados hasta que regularices tu pago. <Link to="/pagos">Ver mis pagos</Link></div></div>
      )}
      {(es || p.rol === 'docente') && (ofertas.isLoading ? <Esqueleto /> : (
        <>
          {!!ofertas.data?.length && <ClasesHoy ofertas={ofertas.data} />}
          <section>
            <div className="fila entre" style={{ marginBottom: 8 }}><h2>Mis materias</h2><Link className="chico" to="/materias">Ver todas</Link></div>
            {!ofertas.data?.length ? (
              <div className="tarjeta"><Vacio icono={<BookOpen size={34} strokeWidth={1.4} />} titulo={es ? 'Aún no inscribiste materias' : 'No tienes materias asignadas'} accion={es ? <Link className="boton prim" to="/inscripcion">Inscribir materias</Link> : undefined} /></div>
            ) : (
              <div className="rejilla">
                {ofertas.data.slice(0, 6).map((o: any) => (
                  <Link key={o.id} className="tarjeta enlace" to={`/materias/${o.id}`}>
                    <span className="etiqueta inf">{o.sigla}</span>
                    <h3 style={{ margin: '8px 0 3px' }}>{o.materia}</h3>
                    <div className="tenue chico">{o.periodo} · Paralelo {o.paralelo}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      ))}
      <Link className="tarjeta enlace" to="/chat"><div className="fila"><MessagesSquare size={22} /><b className="crece">Ir al chat oficial</b><ArrowRight size={18} /></div></Link>
    </div>
  );
}
