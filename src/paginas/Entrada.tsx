import { useState, type FormEvent } from 'react';
import { Download, Eye, EyeOff, KeyRound, UserPlus } from 'lucide-react';
import { correoDe, mensajeError, sb } from '../lib/sb';
import { useSesion } from '../lib/sesion';
import { Campo, useAviso } from '../ui/ui';
import { useInstalar } from '../lib/pwa';

const NOMBRE = document.body.dataset.nombre || 'USFX Virtual';
const LOGO = import.meta.env.BASE_URL + 'logos/usfx-emblema.png';

function CampoClave({ valor, cambiar, etiqueta, nueva }: { valor: string; cambiar: (s: string) => void; etiqueta: string; nueva?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <Campo etiqueta={etiqueta} ayuda={nueva ? 'Mínimo 8 caracteres.' : undefined}>
      <span style={{ position: 'relative', display: 'block' }}>
        <input className="ent" style={{ paddingRight: 44 }} type={ver ? 'text' : 'password'} value={valor} required minLength={nueva ? 8 : undefined}
          autoComplete={nueva ? 'new-password' : 'current-password'} onChange={(e) => cambiar(e.target.value)} />
        <button type="button" className="icono-btn" style={{ position: 'absolute', right: 2, top: 2 }} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVer(!ver)}>{ver ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </span>
    </Campo>
  );
}

export default function Entrada() {
  const [modo, setModo] = useState<'entrar' | 'registro'>(() => (location.hash.includes('postulacion') ? 'registro' : 'entrar'));
  const [usuario, setU] = useState(''); const [clave, setC] = useState('');
  const [d, setD] = useState({ nombres: '', apellidos: '', ci: '', celular: '', correo: '' });
  const [error, setE] = useState(''); const [ocupado, setO] = useState(false);
  const inst = useInstalar();

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault(); setE(''); setO(true);
    const u = usuario.trim().toLowerCase();
    try {
      if (modo === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email: correoDe(u), password: clave });
        if (error) throw error;
      } else {
        if (!/^[a-z0-9._-]{3,40}$/.test(u)) throw new Error('El usuario solo admite letras, números, punto y guion (mínimo 3).');
        const { error } = await sb.auth.signUp({ email: correoDe(u), password: clave, options: { data: d } });
        if (error) throw error;
      }
    } catch (e) { setE(mensajeError(e)); } finally { setO(false); }
  };
  const c = (k: keyof typeof d) => ({ value: d[k], onChange: (e: any) => setD({ ...d, [k]: e.target.value }) });

  return (
    <div className="entrada">
      <div className="lado">
        <img src={LOGO} alt="Emblema de la USFX" width="110" height="147" />
        <h1>{NOMBRE}</h1>
        <p style={{ margin: 0, maxWidth: '32em', opacity: 0.9 }}>Universidad Mayor, Real y Pontificia de San Francisco Xavier de Chuquisaca. Formación virtual con cuatro siglos de historia.</p>
      </div>
      <div className="forma">
        <form className="caja" onSubmit={enviar}>
          <div className="solo-movil"><img src={LOGO} alt="" width="40" height="54" /><h1 style={{ fontSize: 22 }}>{NOMBRE}</h1></div>
          <h2 style={{ fontSize: 23 }}>{modo === 'entrar' ? 'Ingresa a tu cuenta' : 'Crea tu cuenta de postulante'}</h2>
          {modo === 'registro' && (
            <div className="form">
              <Campo etiqueta="Nombres"><input className="ent" required autoComplete="given-name" {...c('nombres')} /></Campo>
              <Campo etiqueta="Apellidos"><input className="ent" required autoComplete="family-name" {...c('apellidos')} /></Campo>
              <Campo etiqueta="Carnet de identidad"><input className="ent" required {...c('ci')} /></Campo>
              <Campo etiqueta="Celular"><input className="ent" required inputMode="tel" autoComplete="tel" {...c('celular')} /></Campo>
              <Campo etiqueta="Correo (opcional)" todo><input className="ent" type="email" autoComplete="email" {...c('correo')} /></Campo>
            </div>
          )}
          <Campo etiqueta="Usuario"><input className="ent" value={usuario} required autoCapitalize="none" autoCorrect="off" autoComplete="username" onChange={(e) => setU(e.target.value)} /></Campo>
          <CampoClave etiqueta="Contraseña" valor={clave} cambiar={setC} nueva={modo === 'registro'} />
          {error && <div className="aviso mal" role="alert">{error}</div>}
          <button className="boton prim ancho-total" style={{ minHeight: 48 }} disabled={ocupado}>
            {modo === 'entrar' ? <KeyRound size={18} /> : <UserPlus size={18} />}{ocupado ? 'Un momento…' : modo === 'entrar' ? 'Ingresar' : 'Crear cuenta'}
          </button>
          <button type="button" className="boton ancho-total" onClick={() => { setE(''); setModo(modo === 'entrar' ? 'registro' : 'entrar'); }}>
            {modo === 'entrar' ? 'Quiero postular a la universidad' : 'Ya tengo cuenta'}
          </button>
          {modo === 'entrar' && <p className="tenue chico" style={{ margin: 0 }}>¿Olvidaste tu contraseña? Pide a administración que la restablezca.</p>}
          {inst.disponible && <button type="button" className="boton ancho-total" onClick={() => inst.instalar()}><Download size={18} />Instalar {NOMBRE}</button>}
        </form>
      </div>
    </div>
  );
}

export function CambiarClave({ forzar = true, listo }: { forzar?: boolean; listo?: () => void }) {
  const { perfil, recargar, salir } = useSesion();
  const aviso = useAviso();
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [error, setE] = useState(''); const [ocupado, setO] = useState(false);
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault(); setE('');
    if (a !== b) return setE('Las contraseñas no coinciden.');
    setO(true);
    try {
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) throw error;
      await sb.from('perfiles').update({ debe_cambiar_clave: false }).eq('id', perfil!.id);
      aviso('Contraseña actualizada'); setA(''); setB(''); recargar(); listo?.();
    } catch (e) { setE(mensajeError(e)); } finally { setO(false); }
  };
  const forma = (
    <form className="pila" onSubmit={enviar}>
      <CampoClave etiqueta="Nueva contraseña" valor={a} cambiar={setA} nueva />
      <CampoClave etiqueta="Repite la contraseña" valor={b} cambiar={setB} nueva />
      {error && <div className="aviso mal" role="alert">{error}</div>}
      <button className="boton prim" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar contraseña'}</button>
      {forzar && <button type="button" className="boton" onClick={salir}>Salir</button>}
    </form>
  );
  if (!forzar) return forma;
  return <div className="entrada"><div className="forma" style={{ gridColumn: '1/-1', minHeight: '100vh' }}><div className="caja"><h2 style={{ fontSize: 23 }}>Crea tu contraseña personal</h2><p className="tenue" style={{ margin: 0 }}>Por seguridad, cambia la clave temporal antes de continuar.</p>{forma}</div></div></div>;
}
