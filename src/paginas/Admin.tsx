import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, KeyRound, Pencil, Plus, Save, Search, Trash2, Upload, UserPlus } from 'lucide-react';
import { usePerfil } from '../lib/sesion';
import { dato, funcion, rpc, sb } from '../lib/sb';
import { DIAS, fecha, leerCSV, MODALIDAD, nombreDe, num, ROL_NOMBRE, type Rol } from '../lib/util';
import { aExcel } from '../lib/exportar';
import { Avatar, Campo, Estado, Modal, Pestanas, useAviso, Vacio } from '../ui/ui';
import { carreras, periodos } from './datos';

const POR_PAGINA = 30;

/* ─── Usuarios ─── */
export function Usuarios() {
  const yo = usePerfil(); const aviso = useAviso(); const qc = useQueryClient();
  const [buscar, setB] = useState(''); const [t, setT] = useState(''); const [rol, setRol] = useState(''); const [pag, setPag] = useState(0);
  const [crear, setCrear] = useState(false); const [masivo, setMasivo] = useState(false); const [editar, setEditar] = useState<any>(null); const [clave, setClave] = useState<any>(null);
  useEffect(() => { const x = setTimeout(() => { setT(buscar.trim().toLowerCase()); setPag(0); }, 300); return () => clearTimeout(x); }, [buscar]);
  const q = useQuery({
    queryKey: ['usuarios', t, rol, pag], placeholderData: (p) => p,
    queryFn: async () => {
      let c = sb.from('perfiles').select('id,usuario,nombres,apellidos,ci,celular,rol,activo,foto_path', { count: 'exact' }).order('apellidos').order('nombres').range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1);
      if (t) c = c.like('busqueda', `%${t}%`);
      if (rol) c = c.eq('rol', rol);
      const r = await c; dato(r as any);
      return { filas: r.data as any[], total: r.count ?? 0 };
    },
  });
  const restablecer = async (u: any) => {
    if (!confirm(`¿Restablecer la contraseña de ${nombreDe(u)}?`)) return;
    try { const r = await funcion<any>('admin-usuarios', { accion: 'restablecer', id: u.id }); setClave({ usuario: u.usuario, clave: r.clave }); }
    catch (e: any) { aviso(e.message, true); }
  };
  const total = q.data?.total ?? 0;
  return (
    <div className="pila">
      <div className="fila envolver entre">
        <span className="fila envolver">
          <label className="fila tarjeta" style={{ padding: '0 10px' }}><Search size={17} className="tenue" /><input className="ent" style={{ border: 0, minWidth: 190 }} aria-label="Buscar usuario" placeholder="Nombre, usuario o CI" value={buscar} onChange={(e) => setB(e.target.value)} /></label>
          <select className="ent" style={{ width: 'auto' }} aria-label="Filtrar por rol" value={rol} onChange={(e) => { setRol(e.target.value); setPag(0); }}><option value="">Todos los roles</option>{Object.entries(ROL_NOMBRE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </span>
        <span className="fila"><button className="boton" onClick={() => setMasivo(true)}><Upload size={16} />Carga masiva</button><button className="boton prim" onClick={() => setCrear(true)}><UserPlus size={16} />Nuevo usuario</button></span>
      </div>
      <Estado q={q}>
        <div className="tabla-c"><table className="tabla">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>CI</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
          <tbody>{(q.data?.filas ?? []).map((u: any) => (
            <tr key={u.id}>
              <td><span className="fila"><Avatar ruta={u.foto_path} nombre={nombreDe(u) || u.usuario} tam={32} /><span className="nowrap">{u.apellidos} {u.nombres}</span></span></td>
              <td>{u.usuario}</td><td>{u.ci}</td><td className="nowrap">{ROL_NOMBRE[u.rol as Rol]}</td>
              <td><span className={'etiqueta ' + (u.activo ? 'ok' : 'mal')}>{u.activo ? 'Activo' : 'Inactivo'}</span></td>
              <td className="nowrap der">
                <button className="icono-btn" aria-label={`Editar ${u.usuario}`} onClick={() => setEditar(u)}><Pencil size={16} /></button>
                <button className="icono-btn" aria-label={`Restablecer contraseña de ${u.usuario}`} title="Restablecer contraseña" onClick={() => restablecer(u)}><KeyRound size={16} /></button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="fila entre"><span className="tenue chico">{num(total)} usuarios</span>
          <span className="fila"><button className="icono-btn" aria-label="Página anterior" disabled={pag === 0} onClick={() => setPag(pag - 1)}><ChevronLeft size={19} /></button><span className="chico">Página {pag + 1} de {Math.max(1, Math.ceil(total / POR_PAGINA))}</span><button className="icono-btn" aria-label="Página siguiente" disabled={(pag + 1) * POR_PAGINA >= total} onClick={() => setPag(pag + 1)}><ChevronRight size={19} /></button></span>
        </div>
      </Estado>
      {crear && <FormUsuario cerrar={() => setCrear(false)} creado={(r) => { setCrear(false); setClave(r); qc.invalidateQueries({ queryKey: ['usuarios'] }); }} sistemas={yo.rol === 'sistemas'} />}
      {masivo && <CargaMasiva cerrar={() => { setMasivo(false); qc.invalidateQueries({ queryKey: ['usuarios'] }); }} />}
      {editar && <EditarUsuario u={editar} sistemas={yo.rol === 'sistemas'} cerrar={() => { setEditar(null); qc.invalidateQueries({ queryKey: ['usuarios'] }); }} />}
      {clave && (
        <Modal titulo="Clave temporal" cerrar={() => setClave(null)}>
          <div className="pila"><div>Usuario: <b>{clave.usuario}</b></div><div>Clave: <b style={{ fontFamily: 'monospace', fontSize: 18 }}>{clave.clave}</b></div>
            <div className="aviso med">Entrégala solo a esa persona. Esta clave no se vuelve a mostrar y se le pedirá cambiarla al entrar.</div></div>
        </Modal>
      )}
    </div>
  );
}
function FormUsuario({ cerrar, creado, sistemas }: { cerrar: () => void; creado: (r: any) => void; sistemas: boolean }) {
  const aviso = useAviso();
  const car = useQuery({ queryKey: ['carreras'], staleTime: 300_000, queryFn: carreras });
  const [f, setF] = useState<any>({ rol: 'estudiante' }); const [oc, setO] = useState(false);
  const set = (k: string) => ({ value: f[k] ?? '', onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  const enviar = async (e: any) => {
    e.preventDefault(); setO(true);
    try {
      const r = await funcion<any>('admin-usuarios', { accion: 'crear', usuarios: [f] });
      const x = r.resultados[0];
      if (!x.ok) throw new Error(x.error);
      creado({ usuario: x.usuario, clave: x.clave });
    } catch (x: any) { aviso(x.message, true); setO(false); }
  };
  return (
    <Modal titulo="Nuevo usuario" cerrar={cerrar}>
      <form className="form" onSubmit={enviar}>
        <Campo etiqueta="Rol" todo><select className="ent" {...set('rol')}>{(['estudiante', 'docente', 'director', 'finanzas', 'admin', ...(sistemas ? ['sistemas'] : [])] as Rol[]).map((r) => <option key={r} value={r}>{ROL_NOMBRE[r]}</option>)}</select></Campo>
        <Campo etiqueta="Usuario" ayuda="Minúsculas, sin espacios."><input className="ent" required pattern="[a-zA-Z0-9._\-]{3,40}" autoCapitalize="none" {...set('usuario')} /></Campo>
        <Campo etiqueta="CI"><input className="ent" {...set('ci')} /></Campo>
        <Campo etiqueta="Nombres"><input className="ent" required {...set('nombres')} /></Campo>
        <Campo etiqueta="Apellidos"><input className="ent" required {...set('apellidos')} /></Campo>
        <Campo etiqueta="Celular"><input className="ent" {...set('celular')} /></Campo>
        {f.rol === 'estudiante' && <Campo etiqueta="Carrera"><select className="ent" required {...set('carrera_codigo')}><option value="">Elige</option>{(car.data ?? []).map((c: any) => <option key={c.id} value={c.codigo}>{c.nombre}</option>)}</select></Campo>}
        <button className="boton prim todo" disabled={oc}>{oc ? 'Creando…' : 'Crear usuario'}</button>
      </form>
    </Modal>
  );
}
function EditarUsuario({ u, cerrar, sistemas }: { u: any; cerrar: () => void; sistemas: boolean }) {
  const aviso = useAviso(); const [f, setF] = useState<any>({ ...u });
  const set = (k: string) => ({ value: f[k] ?? '', onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Modal titulo={`Editar a ${u.usuario}`} cerrar={cerrar}>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault();
        try { await rpc('admin_actualizar_perfil', { p_id: u.id, p_datos: { nombres: f.nombres, apellidos: f.apellidos, ci: f.ci, celular: f.celular, rol: f.rol, activo: f.activo } }); aviso('Guardado'); cerrar(); }
        catch (x: any) { aviso(x.message, true); }
      }}>
        <Campo etiqueta="Nombres"><input className="ent" {...set('nombres')} /></Campo>
        <Campo etiqueta="Apellidos"><input className="ent" {...set('apellidos')} /></Campo>
        <Campo etiqueta="CI"><input className="ent" {...set('ci')} /></Campo>
        <Campo etiqueta="Celular"><input className="ent" {...set('celular')} /></Campo>
        <Campo etiqueta="Rol"><select className="ent" {...set('rol')}>{Object.entries(ROL_NOMBRE).filter(([k]) => sistemas || k !== 'sistemas' || u.rol === 'sistemas').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo etiqueta="Estado"><select className="ent" value={f.activo ? '1' : '0'} onChange={(e) => setF({ ...f, activo: e.target.value === '1' })}><option value="1">Activo</option><option value="0">Inactivo</option></select></Campo>
        <button className="boton prim todo"><Save size={16} />Guardar</button>
      </form>
    </Modal>
  );
}
// Lotes pequeños con pausa: una carga de miles de cuentas no compite con quienes están usando la plataforma.
function CargaMasiva({ cerrar }: { cerrar: () => void }) {
  const aviso = useAviso();
  const [filas, setFilas] = useState<any[]>([]); const [hecho, setH] = useState(0); const [res, setRes] = useState<any[]>([]); const [corre, setC] = useState(false);
  const leer = async (e: any) => { const f = e.target.files?.[0]; if (f) { setFilas(leerCSV(await f.text())); setRes([]); setH(0); } };
  const correr = async () => {
    setC(true); const out: any[] = [];
    try {
      for (let i = 0; i < filas.length; i += 25) {
        const r = await funcion<any>('admin-usuarios', { accion: 'crear', usuarios: filas.slice(i, i + 25) });
        out.push(...r.resultados); setH(Math.min(filas.length, i + 25)); setRes([...out]);
        await new Promise((ok) => setTimeout(ok, 150));
      }
      const oks = out.filter((x) => x.ok);
      await aExcel({ titulo: 'Credenciales temporales', subtitulo: 'Confidencial: entrégalas de forma individual', archivo: 'Credenciales_temporales', columnas: ['Usuario', 'Clave temporal', 'Resultado'], filas: out.map((x) => [x.usuario, x.clave ?? '', x.ok ? 'Creado' : x.error]) });
      aviso(`${oks.length} de ${out.length} cuentas creadas`);
    } catch (e: any) { aviso(e.message, true); } finally { setC(false); }
  };
  const pc = filas.length ? Math.round((hecho / filas.length) * 100) : 0;
  return (
    <Modal titulo="Carga masiva de usuarios" cerrar={corre ? () => {} : cerrar}>
      <div className="pila">
        <p style={{ margin: 0 }}>Sube un CSV con estas columnas:</p>
        <code className="chico" style={{ overflowWrap: 'anywhere' }}>usuario;nombres;apellidos;ci;celular;rol;carrera_codigo</code>
        <span className="tenue chico">rol: estudiante, docente, director, finanzas o admin. La carrera solo se pide a estudiantes. Al terminar se descarga un Excel con las claves temporales.</span>
        <input className="ent" type="file" accept=".csv,text/csv" disabled={corre} onChange={leer} />
        {filas.length > 0 && <div className="neg">{num(filas.length)} filas listas</div>}
        {(corre || hecho > 0) && <div className="barra" role="progressbar" aria-valuenow={pc}><i style={{ width: pc + '%' }} /></div>}
        {res.some((x) => !x.ok) && <div className="aviso mal chico">{res.filter((x) => !x.ok).length} filas con error. Quedarán detalladas en el Excel.</div>}
        <button className="boton prim" disabled={!filas.length || corre} onClick={correr}>{corre ? `Creando ${pc}%` : 'Crear cuentas'}</button>
      </div>
    </Modal>
  );
}

/* ─── Carreras y materias ─── */
export function Carreras() {
  const p = usePerfil(); const qc = useQueryClient(); const aviso = useAviso();
  const q = useQuery({ queryKey: ['carreras'], staleTime: 300_000, queryFn: carreras });
  const [sel, setSel] = useState<any>(null); const [nueva, setN] = useState(false);
  const esAdmin = ['sistemas', 'admin'].includes(p.rol);
  const lista = (q.data ?? []).filter((c: any) => esAdmin || c.director_id === p.id);
  useEffect(() => { if (!sel && lista.length) setSel(lista[0]); }, [lista.length]);
  const directores = useQuery({ queryKey: ['directores'], enabled: esAdmin, queryFn: async () => dato(await sb.from('perfiles').select('id,nombres,apellidos').in('rol', ['director', 'docente', 'admin']).order('apellidos').limit(500)) as any[] });
  return (
    <div className="pila">
      {esAdmin && <div><button className="boton prim" onClick={() => setN(true)}><Plus size={16} />Nueva carrera</button></div>}
      <Estado q={q} vacio={<div className="tarjeta"><Vacio titulo="Todavía no hay carreras" /></div>}>
        <div className="rejilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div className="pila-s">
            {lista.map((c: any) => (
              <button key={c.id} className="tarjeta enlace" style={{ textAlign: 'left', cursor: 'pointer', borderColor: sel?.id === c.id ? 'var(--azul)' : undefined }} onClick={() => setSel(c)}>
                <div className="fila entre"><span className="etiqueta inf">{c.codigo}</span><span className="tenue chico">{MODALIDAD[c.modalidad]}</span></div>
                <div className="neg" style={{ marginTop: 6 }}>{c.nombre}</div>
              </button>
            ))}
          </div>
          {sel && <MateriasDe carrera={sel} key={sel.id} puede={esAdmin} />}
        </div>
      </Estado>
      {nueva && (
        <FormSimple titulo="Nueva carrera" cerrar={() => setN(false)} campos={[['codigo', 'Código'], ['nombre', 'Nombre'], ['modalidad', 'Modalidad', Object.entries(MODALIDAD)], ['duracion_periodos', 'Duración (periodos)', 'number'], ['director_id', 'Dirección', (directores.data ?? []).map((d: any) => [d.id, `${d.apellidos} ${d.nombres}`])]]}
          guardar={async (f) => { dato(await sb.from('carreras').insert({ ...f, director_id: f.director_id || null, duracion_periodos: Number(f.duracion_periodos || 10) })); qc.invalidateQueries({ queryKey: ['carreras'] }); aviso('Carrera creada'); }} />
      )}
    </div>
  );
}
function MateriasDe({ carrera, puede }: { carrera: any; puede: boolean }) {
  const qc = useQueryClient(); const aviso = useAviso(); const [n, setN] = useState(false);
  const q = useQuery({ queryKey: ['materias', carrera.id], queryFn: async () => dato(await sb.from('materias').select('*').eq('carrera_id', carrera.id).order('nivel').order('sigla')) as any[] });
  return (
    <section className="tarjeta pila">
      <div className="fila entre"><h3>Materias de {carrera.nombre}</h3>{puede && <button className="boton ch" onClick={() => setN(true)}><Plus size={15} />Materia</button>}</div>
      <Estado q={q} vacio={<Vacio titulo="Sin materias" />}>
        {(q.data ?? []).map((m: any) => <div className="persona" key={m.id}><span className="etiqueta">{m.nivel}.º</span><div className="crece"><b>{m.sigla}</b> {m.nombre}</div><span className="tenue chico nowrap">{m.creditos} créd.</span></div>)}
      </Estado>
      {n && <FormSimple titulo="Nueva materia" cerrar={() => setN(false)} campos={[['sigla', 'Sigla'], ['nombre', 'Nombre'], ['creditos', 'Créditos', 'number'], ['nivel', 'Nivel o semestre', 'number']]}
        guardar={async (f) => { dato(await sb.from('materias').insert({ carrera_id: carrera.id, sigla: f.sigla, nombre: f.nombre, creditos: Number(f.creditos || 4), nivel: Number(f.nivel || 1) })); qc.invalidateQueries({ queryKey: ['materias', carrera.id] }); aviso('Materia creada'); }} />}
    </section>
  );
}
function FormSimple({ titulo, campos, guardar, cerrar }: { titulo: string; campos: [string, string, any?][]; guardar: (f: any) => Promise<void>; cerrar: () => void }) {
  const aviso = useAviso(); const [f, setF] = useState<any>(() => Object.fromEntries(campos.filter(([, , o]) => Array.isArray(o) && o.length).map(([k, , o]) => [k, k === 'director_id' ? '' : o[0][0]]))); const [oc, setO] = useState(false);
  return (
    <Modal titulo={titulo} cerrar={cerrar}>
      <form className="form" onSubmit={async (e) => { e.preventDefault(); setO(true); try { await guardar(f); cerrar(); } catch (x: any) { aviso(x.message, true); setO(false); } }}>
        {campos.map(([k, t, o]) => (
          <Campo key={k} etiqueta={t}>
            {Array.isArray(o) ? <select className="ent" value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{k === 'director_id' || k === 'docente_id' ? <option value="">Sin asignar</option> : null}{o.map(([v, l]: any) => <option key={v} value={v}>{l}</option>)}</select>
              : <input className="ent" type={o ?? 'text'} required={k !== 'director_id'} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
          </Campo>
        ))}
        <button className="boton prim todo" disabled={oc}>{oc ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  );
}

/* ─── Periodos, ofertas y horarios ─── */
export function Oferta() {
  const p = usePerfil(); const qc = useQueryClient(); const aviso = useAviso();
  const es = ['sistemas', 'admin'].includes(p.rol);
  const pers = useQuery({ queryKey: ['periodos'], staleTime: 120_000, queryFn: periodos });
  const [per, setPer] = useState(''); const [nP, setNP] = useState(false); const [nO, setNO] = useState(false); const [horario, setHor] = useState<any>(null); const [acta, setActa] = useState<any>(null);
  useEffect(() => { if (!per && pers.data?.length) setPer(pers.data[0].id); }, [pers.data]);
  const ofs = useQuery({ queryKey: ['ofertas', per], enabled: !!per, queryFn: async () => dato(await sb.from('v_ofertas').select('*').eq('periodo_id', per).order('carrera').order('materia').limit(500)) as any[] });
  const mats = useQuery({ queryKey: ['todas-materias'], enabled: nO, queryFn: async () => dato(await sb.from('materias').select('id,sigla,nombre').order('sigla').limit(2000)) as any[] });
  const docs = useQuery({ queryKey: ['docentes-lista'], enabled: nO, queryFn: async () => dato(await sb.from('v_docentes').select('id,nombres,apellidos').order('apellidos').limit(2000)) as any[] });
  return (
    <div className="pila">
      <div className="fila envolver entre">
        <select className="ent" style={{ width: 'auto', maxWidth: '100%' }} aria-label="Periodo" value={per} onChange={(e) => setPer(e.target.value)}>{(pers.data ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.nombre} · {x.modalidad}</option>)}</select>
        {es && <span className="fila"><button className="boton" onClick={() => setNP(true)}><Plus size={16} />Periodo</button><button className="boton prim" disabled={!per} onClick={() => setNO(true)}><Plus size={16} />Abrir materia</button></span>}
      </div>
      <Estado q={ofs} vacio={<div className="tarjeta"><Vacio titulo="Sin materias abiertas en este periodo" /></div>}>
        <div className="tabla-c"><table className="tabla">
          <thead><tr><th>Materia</th><th>Carrera</th><th>Docente</th><th className="der">Inscritos</th><th>Acta</th><th></th></tr></thead>
          <tbody>{(ofs.data ?? []).map((o: any) => (
            <tr key={o.id}>
              <td><b>{o.sigla}</b> {o.materia} · {o.paralelo}</td><td>{o.carrera}</td><td className="nowrap">{o.docente ?? <span className="tenue">Sin asignar</span>}</td><td className="der">{o.inscritos}/{o.cupo}</td>
              <td>{o.acta_cerrada ? (es ? <button className="etiqueta" style={{ border: 0, cursor: 'pointer' }} onClick={() => setActa(o)}>Cerrada · reabrir</button> : <span className="etiqueta">Cerrada</span>) : <span className="etiqueta ok">Abierta</span>}</td>
              <td className="der"><button className="boton ch" onClick={() => setHor(o)}>Horario</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </Estado>
      {nP && <FormSimple titulo="Nuevo periodo" cerrar={() => setNP(false)} campos={[['nombre', 'Nombre (ej. 2027-Modular-Marzo)'], ['modalidad', 'Modalidad', Object.entries(MODALIDAD)], ['inicio', 'Inicio de clases', 'date'], ['fin', 'Fin de clases', 'date'], ['inscripcion_desde', 'Inscripción desde', 'date'], ['inscripcion_hasta', 'Inscripción hasta', 'date']]}
        guardar={async (f) => { dato(await sb.from('periodos').insert(f)); qc.invalidateQueries({ queryKey: ['periodos'] }); aviso('Periodo creado'); }} />}
      {nO && mats.data && docs.data && <FormSimple titulo="Abrir materia" cerrar={() => setNO(false)} campos={[['materia_id', 'Materia', mats.data.map((m: any) => [m.id, `${m.sigla} ${m.nombre}`])], ['paralelo', 'Paralelo'], ['docente_id', 'Docente', docs.data.map((d: any) => [d.id, `${d.apellidos} ${d.nombres}`])], ['cupo', 'Cupo', 'number']]}
        guardar={async (f) => { dato(await sb.from('ofertas').insert({ materia_id: f.materia_id, periodo_id: per, paralelo: f.paralelo, docente_id: f.docente_id || null, cupo: Number(f.cupo || 60) })); qc.invalidateQueries({ queryKey: ['ofertas', per] }); aviso('Materia abierta'); }} />}
      {horario && <FormHorario oferta={horario} cerrar={() => setHor(null)} />}
      {acta && <Reabrir oferta={acta} cerrar={() => { setActa(null); qc.invalidateQueries({ queryKey: ['ofertas', per] }); }} />}
    </div>
  );
}
function Reabrir({ oferta, cerrar }: { oferta: any; cerrar: () => void }) {
  const [m, setM] = useState(''); const aviso = useAviso();
  return (
    <Modal titulo="Reabrir acta" cerrar={cerrar}>
      <form className="pila" onSubmit={async (e) => { e.preventDefault(); try { await rpc('reabrir_acta', { p_oferta: oferta.id, p_motivo: m }); aviso('Acta reabierta'); cerrar(); } catch (x: any) { aviso(x.message, true); } }}>
        <div>{oferta.sigla} {oferta.materia}</div>
        <Campo etiqueta="Motivo" ayuda="Queda registrado en auditoría."><textarea className="ent" required value={m} onChange={(e) => setM(e.target.value)} /></Campo>
        <button className="boton peligro">Reabrir acta</button>
      </form>
    </Modal>
  );
}
function FormHorario({ oferta, cerrar }: { oferta: any; cerrar: () => void }) {
  const qc = useQueryClient(); const aviso = useAviso();
  const q = useQuery({ queryKey: ['horario', oferta.id], queryFn: async () => dato(await sb.from('horarios').select('*').eq('oferta_id', oferta.id).order('dia')) as any[] });
  const [f, setF] = useState({ dia: '1', inicio: '19:00', fin: '21:00' });
  const inv = () => { qc.invalidateQueries({ queryKey: ['horario', oferta.id] }); qc.invalidateQueries({ queryKey: ['horarios'] }); };
  return (
    <Modal titulo={`Horario de ${oferta.materia}`} cerrar={cerrar}>
      <div className="pila">
        {(q.data ?? []).map((h: any) => <div className="persona" key={h.id}><span className="crece">{DIAS[h.dia]} {h.inicio.slice(0, 5)} a {h.fin.slice(0, 5)}</span><button className="icono-btn" aria-label="Borrar horario" onClick={async () => { dato(await sb.from('horarios').delete().eq('id', h.id)); inv(); }}><Trash2 size={16} /></button></div>)}
        <form className="form" onSubmit={async (e) => { e.preventDefault(); try { dato(await sb.from('horarios').insert({ oferta_id: oferta.id, dia: Number(f.dia), inicio: f.inicio, fin: f.fin })); inv(); } catch (x: any) { aviso(x.message, true); } }}>
          <Campo etiqueta="Día"><select className="ent" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })}>{DIAS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></Campo>
          <Campo etiqueta="Inicio"><input className="ent" type="time" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Campo>
          <Campo etiqueta="Fin"><input className="ent" type="time" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} /></Campo>
          <button className="boton prim todo"><Plus size={16} />Agregar</button>
        </form>
      </div>
    </Modal>
  );
}

/* ─── Auditoría y configuración ─── */
export function Auditoria() {
  const [pag, setPag] = useState(0);
  const q = useQuery({ queryKey: ['auditoria', pag], placeholderData: (p) => p, queryFn: async () => dato(await sb.from('auditoria').select('*').order('id', { ascending: false }).range(pag * 50, pag * 50 + 49)) as any[] });
  return (
    <Estado q={q} vacio={<div className="tarjeta"><Vacio titulo="Sin registros" /></div>}>
      <div className="tabla-c"><table className="tabla">
        <thead><tr><th>Fecha</th><th>Acción</th><th>Tabla</th><th>Actor</th><th>Detalle</th></tr></thead>
        <tbody>{(q.data ?? []).map((a: any) => <tr key={a.id}><td className="nowrap">{fecha(a.en)}</td><td>{a.accion}</td><td>{a.tabla}</td><td className="chico tenue">{a.actor?.slice(0, 8)}</td><td className="chico tenue" style={{ maxWidth: 420, overflowWrap: 'anywhere' }}>{JSON.stringify(a.datos)?.slice(0, 180)}</td></tr>)}</tbody>
      </table></div>
      <div className="fila entre" style={{ marginTop: 10 }}><button className="boton ch" disabled={pag === 0} onClick={() => setPag(pag - 1)}>Más recientes</button><button className="boton ch" disabled={(q.data?.length ?? 0) < 50} onClick={() => setPag(pag + 1)}>Anteriores</button></div>
    </Estado>
  );
}
export function Config() {
  const qc = useQueryClient(); const aviso = useAviso();
  const q = useQuery({ queryKey: ['config'], queryFn: async () => dato(await sb.from('configuracion').select('*').order('clave')) as any[] });
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => { if (q.data) setV(Object.fromEntries(q.data.map((c: any) => [c.clave, typeof c.valor === 'string' ? c.valor : JSON.stringify(c.valor)]))); }, [q.data]);
  const m = useMutation({
    mutationFn: async () => {
      for (const c of q.data ?? []) {
        const txt = v[c.clave];
        let valor: any = txt; try { valor = JSON.parse(txt); } catch { /* texto */ }
        dato(await sb.from('configuracion').update({ valor }).eq('clave', c.clave));
      }
    },
    onSuccess: () => { aviso('Configuración guardada'); qc.invalidateQueries({ queryKey: ['config'] }); }, onError: (e: any) => aviso(e.message, true),
  });
  return (
    <Estado q={q}>
      <div className="tarjeta pila" style={{ maxWidth: 680 }}>
        {(q.data ?? []).map((c: any) => <Campo key={c.clave} etiqueta={c.descripcion ?? c.clave} ayuda={c.clave}><input className="ent" value={v[c.clave] ?? ''} onChange={(e) => setV({ ...v, [c.clave]: e.target.value })} /></Campo>)}
        <button className="boton prim" disabled={m.isPending} onClick={() => m.mutate()}><Save size={16} />Guardar</button>
      </div>
    </Estado>
  );
}
export default Usuarios;
