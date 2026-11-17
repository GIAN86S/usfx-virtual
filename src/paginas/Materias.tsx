import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { usePerfil } from '../lib/sesion';
import { MODALIDAD, fecha } from '../lib/util';
import { Estado, Vacio } from '../ui/ui';
import { misOfertas } from './datos';
import { AvisoAcceso } from './Aula';

export default function Materias() {
  const p = usePerfil();
  const q = useQuery({ queryKey: ['mis-ofertas', p.id], queryFn: () => misOfertas(p) });
  return (
    <>{p.rol === 'estudiante' && <div style={{ marginBottom: 14 }}><AvisoAcceso /></div>}
    <Estado q={q} vacio={<div className="tarjeta"><Vacio icono={<BookOpen size={34} strokeWidth={1.4} />} titulo={p.rol === 'docente' ? 'No tienes materias asignadas' : 'Aún no inscribiste materias'} accion={p.rol === 'estudiante' ? <Link className="boton prim" to="/inscripcion">Inscribir materias</Link> : undefined} /></div>}>
      <div className="rejilla">
        {(q.data ?? []).map((o: any) => (
          <Link key={o.id} className="tarjeta enlace" to={`/materias/${o.id}`}>
            <div className="fila entre"><span className="etiqueta inf">{o.sigla}</span>{o.acta_cerrada && <span className="etiqueta">Acta cerrada</span>}</div>
            <h3 style={{ margin: '9px 0 3px' }}>{o.materia}</h3>
            <div className="tenue chico">{o.carrera}</div>
            <div className="tenue chico">{MODALIDAD[o.modalidad]} · {o.periodo} · Paralelo {o.paralelo}</div>
            <div className="tenue chico">{fecha(o.inicio)} al {fecha(o.fin)}</div>
            {p.rol === 'estudiante' ? <div className="chico" style={{ marginTop: 6 }}>{o.docente ?? 'Docente por asignar'}</div> : <div className="chico" style={{ marginTop: 6 }}>{o.inscritos} de {o.cupo} inscritos</div>}
          </Link>
        ))}
      </div>
    </Estado></>
  );
}
