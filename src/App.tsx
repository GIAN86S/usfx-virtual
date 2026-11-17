import { lazy, Suspense, useMemo, useState, type ComponentType } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, BookOpen, BookOpenCheck, Building2, CalendarDays, ClipboardCheck, ClipboardList, FileCheck2, GraduationCap, History, Home, Layers,
  LogOut, Megaphone, Menu, MessagesSquare, Settings, UserRound, Users, Wallet, FileBarChart, Target,
} from 'lucide-react';
import { useSesion } from './lib/sesion';
import { dato, sb } from './lib/sb';
import { ROL_NOMBRE, type Rol, fecha, hora } from './lib/util';
import { Avatar, Esqueleto, Modal, Vacio } from './ui/ui';
import Entrada, { CambiarClave } from './paginas/Entrada';
import Instalar from './paginas/Instalar';

const Inicio = lazy(() => import('./paginas/Inicio'));
const Materias = lazy(() => import('./paginas/Materias'));
const Materia = lazy(() => import('./paginas/Materia'));
const Chat = lazy(() => import('./paginas/Chat'));
const Comunicados = lazy(() => import('./paginas/Comunicados'));
const Perfil = lazy(() => import('./paginas/Perfil'));
const pag = (m: any, n: string): ComponentType => lazy(() => m().then((x: any) => ({ default: x[n] })));
const Notas = pag(() => import('./paginas/Estudiante'), 'Notas');
const Kardex = pag(() => import('./paginas/Estudiante'), 'Kardex');
const MiAsistencia = pag(() => import('./paginas/Estudiante'), 'MiAsistencia');
const Horario = pag(() => import('./paginas/Estudiante'), 'Horario');
const Postulacion = pag(() => import('./paginas/Tramites'), 'Postulacion');
const Inscripcion = pag(() => import('./paginas/Tramites'), 'Inscripcion');
const Pagos = pag(() => import('./paginas/Tramites'), 'Pagos');
const Usuarios = pag(() => import('./paginas/Admin'), 'Usuarios');
const Carreras = pag(() => import('./paginas/Admin'), 'Carreras');
const Oferta = pag(() => import('./paginas/Admin'), 'Oferta');
const Auditoria = pag(() => import('./paginas/Admin'), 'Auditoria');
const Config = pag(() => import('./paginas/Admin'), 'Config');
const Postulaciones = pag(() => import('./paginas/AdminFinanzas'), 'Postulaciones');
const Finanzas = pag(() => import('./paginas/AdminFinanzas'), 'Finanzas');
const Reportes = pag(() => import('./paginas/AdminFinanzas'), 'Reportes');
const Preinscritos = pag(() => import('./paginas/Preinscritos'), 'Preinscritos');

const APP = document.body.dataset.app as 'campus' | 'chat' | 'notas' | 'matricula';
const NOMBRE = document.body.dataset.nombre || 'USFX Virtual';
const GESTION: Rol[] = ['sistemas', 'admin'];
const ADMINISTRATIVOS: Rol[] = ['sistemas', 'admin', 'finanzas', 'director'];

interface Item { ruta: string; titulo: string; corto?: string; icono: any; roles?: Rol[]; apps: string[]; grupo?: string; comp: ComponentType }
const ITEMS: Item[] = [
  { ruta: '/inicio', titulo: 'Inicio', icono: Home, apps: ['campus'], comp: Inicio },
  { ruta: '/materias', titulo: 'Mis materias', corto: 'Materias', icono: BookOpen, roles: ['estudiante', 'docente'], apps: ['campus', 'notas'], comp: Materias },
  { ruta: '/notas', titulo: 'Mis notas', corto: 'Notas', icono: GraduationCap, roles: ['estudiante'], apps: ['campus', 'notas'], comp: Notas },
  { ruta: '/kardex', titulo: 'Kardex', icono: BookOpenCheck, roles: ['estudiante'], apps: ['campus', 'notas'], comp: Kardex },
  { ruta: '/asistencia', titulo: 'Mi asistencia', corto: 'Asistencia', icono: ClipboardCheck, roles: ['estudiante'], apps: ['campus', 'notas'], comp: MiAsistencia },
  { ruta: '/horario', titulo: 'Horario', icono: CalendarDays, roles: ['estudiante', 'docente'], apps: ['campus', 'notas'], comp: Horario },
  { ruta: '/postulacion', titulo: 'Mi postulación', corto: 'Postulación', icono: FileCheck2, roles: ['postulante'], apps: ['campus', 'matricula'], comp: Postulacion },
  { ruta: '/inscripcion', titulo: 'Inscribir materias', corto: 'Inscribir', icono: ClipboardList, roles: ['estudiante'], apps: ['campus', 'matricula'], comp: Inscripcion },
  { ruta: '/pagos', titulo: 'Matrícula y pagos', corto: 'Pagos', icono: Wallet, roles: ['estudiante'], apps: ['campus', 'matricula'], comp: Pagos },
  { ruta: '/chat', titulo: 'Chat', icono: MessagesSquare, roles: ['sistemas', 'admin', 'finanzas', 'director', 'docente', 'estudiante'], apps: ['campus', 'chat'], comp: Chat },
  { ruta: '/comunicados', titulo: 'Comunicados', icono: Megaphone, roles: ['sistemas', 'admin', 'finanzas', 'director', 'docente'], apps: ['campus', 'chat'], comp: Comunicados },
  { ruta: '/usuarios', titulo: 'Usuarios', icono: Users, roles: GESTION, apps: ['campus'], grupo: 'Administración', comp: Usuarios },
  { ruta: '/carreras', titulo: 'Carreras y materias', corto: 'Carreras', icono: Building2, roles: [...GESTION, 'director'], apps: ['campus'], grupo: 'Administración', comp: Carreras },
  { ruta: '/oferta', titulo: 'Periodos y horarios', corto: 'Horarios', icono: Layers, roles: [...GESTION, 'director'], apps: ['campus'], grupo: 'Administración', comp: Oferta },
  { ruta: '/preinscritos', titulo: 'Preinscritos', icono: Target, roles: [...GESTION, 'director'], apps: ['campus', 'matricula'], grupo: 'Administración', comp: Preinscritos },
  { ruta: '/postulaciones', titulo: 'Postulaciones', icono: FileCheck2, roles: [...GESTION, 'director'], apps: ['campus', 'matricula'], grupo: 'Administración', comp: Postulaciones },
  { ruta: '/finanzas', titulo: 'Finanzas', icono: Wallet, roles: ['sistemas', 'admin', 'finanzas'], apps: ['campus', 'matricula'], grupo: 'Administración', comp: Finanzas },
  { ruta: '/reportes', titulo: 'Reportes', icono: FileBarChart, roles: ADMINISTRATIVOS, apps: ['campus', 'notas'], grupo: 'Administración', comp: Reportes },
  { ruta: '/auditoria', titulo: 'Auditoría', icono: History, roles: GESTION, apps: ['campus'], grupo: 'Sistema', comp: Auditoria },
  { ruta: '/configuracion', titulo: 'Configuración', icono: Settings, roles: ['sistemas'], apps: ['campus'], grupo: 'Sistema', comp: Config },
  { ruta: '/perfil', titulo: 'Mi perfil', corto: 'Perfil', icono: UserRound, apps: ['campus', 'chat', 'notas', 'matricula'], comp: Perfil },
];

function Notificaciones({ uid }: { uid: string }) {
  const [abierta, setA] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ['notifs', uid], refetchInterval: 90_000 + Math.random() * 30_000,
    queryFn: async () => dato(await sb.from('notificaciones').select('id,titulo,cuerpo,url,leida,creado_en').order('id', { ascending: false }).limit(30)) as any[],
  });
  const sin = (q.data ?? []).filter((n) => !n.leida).length;
  const abrir = async () => {
    setA(true);
    if (sin) { await sb.from('notificaciones').update({ leida: true }).eq('usuario_id', uid).eq('leida', false); qc.invalidateQueries({ queryKey: ['notifs', uid] }); }
  };
  return (
    <>
      <button className="icono-btn" onClick={abrir} aria-label={`Notificaciones${sin ? `, ${sin} sin leer` : ''}`}><Bell size={21} />{sin > 0 && <span className="punto">{sin > 9 ? '9+' : sin}</span>}</button>
      {abierta && (
        <Modal titulo="Notificaciones" cerrar={() => setA(false)}>
          {(q.data ?? []).length === 0 ? <Vacio titulo="Sin notificaciones" /> : (q.data ?? []).map((n) => (
            <button key={n.id} className="chat-item" onClick={() => { setA(false); if (n.url) nav(n.url); }}>
              <div className="crece"><div className="neg">{n.titulo}</div><div className="tenue chico">{n.cuerpo}</div><div className="tenue chico">{fecha(n.creado_en)} {hora(n.creado_en)}</div></div>
            </button>
          ))}
        </Modal>
      )}
    </>
  );
}

export default function App() {
  const { sesion, perfil, cargando, salir } = useSesion();
  const loc = useLocation();
  const [mas, setMas] = useState(false);
  const instalar = new URLSearchParams(location.search).has('instalar');
  const items = useMemo(() => ITEMS.filter((i) => i.apps.includes(APP) && (!i.roles || (perfil && i.roles.includes(perfil.rol)))), [perfil]);

  if (cargando) return <div style={{ padding: 24 }}><Esqueleto n={4} /></div>;
  if (!sesion || !perfil) return <><Entrada />{instalar && <Instalar />}</>;
  if (!perfil.activo) return <div className="entrada"><div className="forma" style={{ gridColumn: '1/-1' }}><div className="caja"><Vacio titulo="Cuenta desactivada" texto="Comunícate con administración." accion={<button className="boton" onClick={salir}>Salir</button>} /></div></div></div>;
  if (perfil.debe_cambiar_clave) return <CambiarClave />;

  const inicio = items[0]?.ruta ?? '/perfil';
  const actual = items.find((i) => loc.pathname === i.ruta || loc.pathname.startsWith(i.ruta + '/'));
  const tabs = items.slice(0, 4);
  const resto = items.slice(4);
  const enChat = loc.pathname.startsWith('/chat');
  const grupos = [...new Set(items.map((i) => i.grupo ?? ''))];

  return (
    <div className="app">
      <aside className="lateral">
        <Link className="marca" to={inicio}>
          <img src={import.meta.env.BASE_URL + 'logos/usfx-emblema.png'} alt="" width="33" height="44" />
          <span><b>{NOMBRE}</b><small>{ROL_NOMBRE[perfil.rol]}</small></span>
        </Link>
        <nav aria-label="Principal">
          {grupos.map((g) => (
            <div key={g}>
              {g && <div className="grupo">{g}</div>}
              {items.filter((i) => (i.grupo ?? '') === g).map((i) => <NavLink key={i.ruta} className={({ isActive }) => 'item' + (isActive ? ' activo' : '')} to={i.ruta}><i.icono size={18} />{i.titulo}</NavLink>)}
            </div>
          ))}
        </nav>
      </aside>
      <div className="central">
        <header className="superior">
          <h1 className="crece corta">{actual?.titulo ?? NOMBRE}</h1>
          <Notificaciones uid={perfil.id} />
          <Link to="/perfil" aria-label="Mi perfil" style={{ textDecoration: 'none' }}><Avatar ruta={perfil.foto_path} nombre={`${perfil.nombres} ${perfil.apellidos}`} tam={34} /></Link>
          <button className="icono-btn" onClick={salir} aria-label="Salir" title="Salir"><LogOut size={20} /></button>
        </header>
        <main className={'contenido' + (enChat ? ' sin-margen' : '')}>
          <div className={enChat ? '' : 'ancho'} style={enChat ? { height: '100%' } : undefined}>
            <Suspense fallback={<Esqueleto />}>
              <Routes>
                {items.map((i) => <Route key={i.ruta} path={i.ruta} element={<i.comp />} />)}
                <Route path="/materias/:id" element={<Materia />} />
                <Route path="/chat/:id" element={<Chat />} />
                <Route path="*" element={<Navigate to={inicio} replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>
        <nav className="tabs-movil" aria-label="Principal">
          {tabs.map((i) => <NavLink key={i.ruta} to={i.ruta} className={({ isActive }) => (isActive ? 'activo' : '')}><i.icono size={22} />{i.corto ?? i.titulo}</NavLink>)}
          {resto.length > 0 && <button onClick={() => setMas(true)}><Menu size={22} />Más</button>}
        </nav>
        {mas && (
          <Modal titulo="Más opciones" cerrar={() => setMas(false)}>
            {resto.map((i) => <Link key={i.ruta} className="chat-item" to={i.ruta} onClick={() => setMas(false)}><i.icono size={20} /><span>{i.titulo}</span></Link>)}
          </Modal>
        )}
        {instalar && <Instalar />}
      </div>
    </div>
  );
}
