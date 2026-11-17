import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Camera, FileUp, Moon, Plus, Save, Sun, Trash2 } from 'lucide-react';
import { usePerfil, useSesion } from '../lib/sesion';
import { dato, sb } from '../lib/sb';
import { subir, urlFirmada } from '../lib/archivos';
import { fecha, nombreDe, ROL_NOMBRE } from '../lib/util';
import { activarPush, desactivarPush, pushActivo, pushDisponible, pushRequiereInstalar } from '../lib/pwa';
import { Avatar, Campo, Modal, useAviso } from '../ui/ui';
import { CambiarClave } from './Entrada';

export default function Perfil() {
  const p = usePerfil(); const { recargar } = useSesion(); const aviso = useAviso();
  const [cel, setCel] = useState(p.celular ?? ''); const [mail, setMail] = useState(p.email ?? '');
  const [oscuro, setOscuro] = useState(document.documentElement.dataset.tema === 'oscuro');
  const [push, setPush] = useState(false);
  useEffect(() => { pushActivo().then(setPush).catch(() => null); }, []);
  const tema = (o: boolean) => { setOscuro(o); if (o) document.documentElement.dataset.tema = 'oscuro'; else delete document.documentElement.dataset.tema; try { localStorage.setItem('usfx-tema', o ? 'oscuro' : 'claro'); } catch { /* sin almacenamiento */ } };
  const foto = async (e: any) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const r = await subir('perfiles', p.id, f); dato(await sb.from('perfiles').update({ foto_path: r }).eq('id', p.id)); recargar(); aviso('Foto actualizada'); }
    catch (x: any) { aviso(x.message, true); }
  };
  const guardar = async (e: any) => {
    e.preventDefault();
    try { dato(await sb.from('perfiles').update({ celular: cel || null, email: mail || null }).eq('id', p.id)); recargar(); aviso('Datos guardados'); }
    catch (x: any) { aviso(x.message, true); }
  };
  const cambiarPush = async () => {
    try { if (push) { await desactivarPush(); setPush(false); } else { await activarPush(p.id); setPush(true); aviso('Notificaciones activadas'); } }
    catch (x: any) { aviso(x.message, true); }
  };
  return (
    <div className="pila" style={{ maxWidth: 780 }}>
      <section className="tarjeta fila envolver">
        <Avatar ruta={p.foto_path} nombre={nombreDe(p)} tam={78} />
        <div className="crece" style={{ minWidth: 180 }}><h2>{nombreDe(p)}</h2><div className="tenue">{ROL_NOMBRE[p.rol]} · {p.usuario}</div>{p.ci && <div className="tenue chico">CI {p.ci}</div>}</div>
        <label className="boton ch"><Camera size={15} />Cambiar foto<input type="file" accept="image/*" hidden onChange={foto} /></label>
      </section>
      <form className="tarjeta pila" onSubmit={guardar}>
        <h3>Contacto</h3>
        <div className="form">
          <Campo etiqueta="Celular"><input className="ent" inputMode="tel" value={cel} onChange={(e) => setCel(e.target.value)} /></Campo>
          <Campo etiqueta="Correo"><input className="ent" type="email" value={mail} onChange={(e) => setMail(e.target.value)} /></Campo>
        </div>
        <button className="boton" style={{ alignSelf: 'flex-start' }}><Save size={15} />Guardar</button>
      </form>
      <section className="tarjeta pila">
        <h3>Preferencias</h3>
        <div className="fila entre"><span className="fila">{oscuro ? <Moon size={18} /> : <Sun size={18} />}Tema oscuro</span><button className="boton ch" aria-pressed={oscuro} onClick={() => tema(!oscuro)}>{oscuro ? 'Desactivar' : 'Activar'}</button></div>
        <div className="fila entre envolver">
          <span className="fila crece" style={{ minWidth: 200 }}><Bell size={18} /><span>Notificaciones en este dispositivo{pushRequiereInstalar() && <div className="tenue chico">En iPhone, primero instala la app en tu pantalla de inicio.</div>}</span></span>
          <button className="boton ch" disabled={!pushDisponible() || pushRequiereInstalar()} onClick={cambiarPush}>{push ? 'Desactivar' : 'Activar'}</button>
        </div>
      </section>
      {p.rol === 'docente' && <HojaDeVida />}
      <section className="tarjeta pila"><h3>Cambiar contraseña</h3><CambiarClave forzar={false} /></section>
    </div>
  );
}

const TIPOS: Record<string, string> = { formacion: 'Formación académica', experiencia: 'Experiencia', publicacion: 'Publicación', certificacion: 'Certificación' };
function HojaDeVida() {
  const p = usePerfil(); const aviso = useAviso(); const qc = useQueryClient();
  const d = useQuery({ queryKey: ['mi-docente', p.id], queryFn: async () => dato(await sb.from('docentes').select('*').eq('id', p.id).maybeSingle()) as any });
  const cv = useQuery({ queryKey: ['cv', p.id], queryFn: async () => dato(await sb.from('cv_items').select('*').eq('docente_id', p.id).order('desde', { ascending: false })) as any[] });
  const [f, setF] = useState<any>({}); const [nuevo, setN] = useState(false);
  useEffect(() => { if (d.data) setF(d.data); }, [d.data]);
  const set = (k: string) => ({ value: f[k] ?? '', onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  const guardar = async (e: any) => {
    e.preventDefault();
    try {
      dato(await sb.from('docentes').upsert({ id: p.id, titulo: f.titulo || null, especialidad: f.especialidad || null, biografia: f.biografia || null, enlace_profesional: f.enlace_profesional || null }));
      aviso('Hoja de vida guardada'); qc.invalidateQueries({ queryKey: ['mi-docente', p.id] });
    } catch (x: any) { aviso(x.message, true); }
  };
  const subirCV = async (e: any) => {
    const a = e.target.files?.[0]; if (!a) return;
    try { const r = await subir('perfiles', `${p.id}/cv`, a); dato(await sb.from('docentes').upsert({ id: p.id, cv_path: r })); aviso('Hoja de vida subida'); qc.invalidateQueries({ queryKey: ['mi-docente', p.id] }); }
    catch (x: any) { aviso(x.message, true); }
  };
  return (
    <section className="tarjeta pila">
      <h3>Datos profesionales y currículo</h3>
      <form className="form" onSubmit={guardar}>
        <Campo etiqueta="Título"><input className="ent" placeholder="Ing., Lic., M.Sc., Ph.D." {...set('titulo')} /></Campo>
        <Campo etiqueta="Especialidad"><input className="ent" {...set('especialidad')} /></Campo>
        <Campo etiqueta="Presentación" todo><textarea className="ent" {...set('biografia')} /></Campo>
        <Campo etiqueta="Enlace profesional" todo><input className="ent" type="url" placeholder="https://" {...set('enlace_profesional')} /></Campo>
        <div className="fila todo envolver">
          <button className="boton prim"><Save size={15} />Guardar</button>
          <label className="boton"><FileUp size={15} />{f.cv_path ? 'Reemplazar' : 'Subir'} hoja de vida en PDF<input type="file" accept="application/pdf" hidden onChange={subirCV} /></label>
          {f.cv_path && <button type="button" className="boton" onClick={async () => { try { window.open(await urlFirmada('perfiles', f.cv_path), '_blank', 'noopener'); } catch (x: any) { aviso(x.message, true); } }}>Ver PDF</button>}
        </div>
      </form>
      <div className="fila entre"><b>Trayectoria</b><button className="boton ch" onClick={() => setN(true)}><Plus size={15} />Agregar</button></div>
      {(cv.data ?? []).map((c: any) => (
        <div className="persona" key={c.id}>
          <div className="crece"><div className="neg">{c.titulo}</div><div className="tenue chico">{TIPOS[c.tipo]}{c.institucion ? ' · ' + c.institucion : ''}{c.desde ? ' · ' + fecha(c.desde) : ''}{c.hasta ? ' a ' + fecha(c.hasta) : ''}</div></div>
          <button className="icono-btn" aria-label={`Borrar ${c.titulo}`} onClick={async () => { dato(await sb.from('cv_items').delete().eq('id', c.id)); qc.invalidateQueries({ queryKey: ['cv', p.id] }); }}><Trash2 size={17} /></button>
        </div>
      ))}
      {nuevo && <FormCV cerrar={() => { setN(false); qc.invalidateQueries({ queryKey: ['cv', p.id] }); }} />}
    </section>
  );
}
function FormCV({ cerrar }: { cerrar: () => void }) {
  const p = usePerfil(); const aviso = useAviso();
  const [f, setF] = useState<any>({ tipo: 'formacion' });
  const set = (k: string) => ({ value: f[k] ?? '', onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Modal titulo="Agregar a la trayectoria" cerrar={cerrar}>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault();
        try {
          dato(await sb.from('docentes').upsert({ id: p.id }, { onConflict: 'id', ignoreDuplicates: true }));
          dato(await sb.from('cv_items').insert({ docente_id: p.id, tipo: f.tipo, titulo: f.titulo, institucion: f.institucion || null, desde: f.desde || null, hasta: f.hasta || null }));
          cerrar();
        } catch (x: any) { aviso(x.message, true); }
      }}>
        <Campo etiqueta="Tipo" todo><select className="ent" {...set('tipo')}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo etiqueta="Título o cargo" todo><input className="ent" required {...set('titulo')} /></Campo>
        <Campo etiqueta="Institución" todo><input className="ent" {...set('institucion')} /></Campo>
        <Campo etiqueta="Desde"><input className="ent" type="date" {...set('desde')} /></Campo>
        <Campo etiqueta="Hasta"><input className="ent" type="date" {...set('hasta')} /></Campo>
        <button className="boton prim todo">Agregar</button>
      </form>
    </Modal>
  );
}
