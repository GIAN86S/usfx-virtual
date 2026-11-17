import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Megaphone, Paperclip, Users } from 'lucide-react';
import { usePerfil } from '../lib/sesion';
import { dato, rpc, sb } from '../lib/sb';
import { subir } from '../lib/archivos';
import { num, tipoDeArchivo } from '../lib/util';
import { Campo, useAviso } from '../ui/ui';
import { carreras, misOfertas } from './datos';

// Envía un mensaje oficial filtrando destinatarios por estamento, carrera o materia.
// El servidor vuelve a validar los filtros: un docente solo alcanza a sus materias.
export default function Comunicados() {
  const p = usePerfil(); const aviso = useAviso(); const nav = useNavigate();
  const esDocente = p.rol === 'docente';
  const [roles, setRoles] = useState<string[]>(esDocente ? ['estudiante'] : []);
  const [carr, setCarr] = useState<string[]>([]); const [ofer, setOfer] = useState<string[]>([]);
  const [titulo, setT] = useState(''); const [cuerpo, setC] = useState(''); const [arch, setA] = useState<File | null>(null);
  const cs = useQuery({ queryKey: ['carreras'], staleTime: 300_000, enabled: !esDocente, queryFn: carreras });
  const mias = useQuery({ queryKey: ['mis-ofertas', p.id], enabled: esDocente, queryFn: () => misOfertas(p) });
  const todas = useQuery({
    queryKey: ['ofertas-carrera', carr], enabled: !esDocente && carr.length > 0,
    queryFn: async () => dato(await sb.from('v_ofertas').select('id,sigla,materia,paralelo,periodo').in('carrera_id', carr).order('materia').limit(300)) as any[],
  });
  const opcionesCarrera = (cs.data ?? []).filter((c: any) => p.rol !== 'director' || c.director_id === p.id);
  const filtros = useMemo(() => ({ roles, carreras: carr, ofertas: ofer }), [roles, carr, ofer]);
  const hay = roles.length + carr.length + ofer.length > 0;
  const cuenta = useQuery({ queryKey: ['audiencia', filtros], enabled: hay, retry: false, queryFn: () => rpc<number>('contar_audiencia', { p_filtros: filtros }) });
  const alternar = (l: string[], set: (x: string[]) => void, v: string) => set(l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const enviar = useMutation({
    mutationFn: async () => {
      if (!cuenta.data) throw new Error('Elige a quién enviar el comunicado.');
      if (!confirm(`Se enviará a ${num(cuenta.data)} personas. ¿Continuar?`)) return null;
      let adjunto = null, tipo = 'texto';
      if (arch) {
        // Se sube primero a una conversación propia del comunicado: el servidor la crea con el primer mensaje.
        const c = await rpc<string>('enviar_comunicado', { p_titulo: titulo, p_cuerpo: cuerpo, p_filtros: filtros });
        const ruta = await subir('chat', c, arch);
        adjunto = { ruta, nombre: arch.name, mime: arch.type, tamano: arch.size }; tipo = tipoDeArchivo(arch.type, arch.name);
        dato(await sb.from('mensajes').insert({ conversacion_id: c, autor_id: p.id, tipo, adjunto }));
        return c;
      }
      return rpc<string>('enviar_comunicado', { p_titulo: titulo, p_cuerpo: cuerpo, p_filtros: filtros });
    },
    onSuccess: (c) => { if (c) { aviso('Comunicado enviado'); nav(`/chat/${c}`); } },
    onError: (e: any) => aviso(e.message, true),
  });
  const Casilla = ({ on, cambio, children }: any) => <label className={'etiqueta ' + (on ? 'inf' : '')} style={{ cursor: 'pointer', padding: '6px 11px' }}><input type="checkbox" hidden checked={on} onChange={cambio} />{children}</label>;
  const materias = esDocente ? mias.data ?? [] : todas.data ?? [];
  return (
    <div className="pila" style={{ maxWidth: 760 }}>
      <section className="tarjeta pila">
        <h2 className="fila"><Users size={19} />Destinatarios</h2>
        {!esDocente && (
          <>
            <div className="pila-s"><b className="chico">Estamento</b><div className="fila envolver" style={{ gap: 6 }}>
              {(p.rol === 'finanzas' ? [['estudiante', 'Estudiantes']] : [['estudiante', 'Estudiantes'], ['docente', 'Docentes'], ['director', 'Directores'], ['finanzas', 'Finanzas'], ['admin', 'Administración']]).map(([k, t]) => <Casilla key={k} on={roles.includes(k)} cambio={() => alternar(roles, setRoles, k)}>{t}</Casilla>)}
            </div></div>
            <div className="pila-s"><b className="chico">Carrera</b><div className="fila envolver" style={{ gap: 6 }}>
              {opcionesCarrera.map((c: any) => <Casilla key={c.id} on={carr.includes(c.id)} cambio={() => { alternar(carr, setCarr, c.id); setOfer([]); }}>{c.nombre}</Casilla>)}
            </div></div>
          </>
        )}
        {materias.length > 0 && (
          <div className="pila-s"><b className="chico">Materia {esDocente ? '' : '(opcional)'}</b><div className="fila envolver" style={{ gap: 6 }}>
            {materias.map((o: any) => <Casilla key={o.id} on={ofer.includes(o.id)} cambio={() => alternar(ofer, setOfer, o.id)}>{o.sigla} {o.materia} · {o.paralelo}</Casilla>)}
          </div></div>
        )}
        <div className={'aviso ' + (cuenta.error ? 'mal' : '')}>
          <Megaphone size={18} />{!hay ? 'Elige al menos un filtro.' : cuenta.isLoading ? 'Calculando…' : cuenta.error ? (cuenta.error as Error).message : <span>Llegará a <b>{num(cuenta.data ?? 0)}</b> personas.</span>}
        </div>
      </section>
      <section className="tarjeta pila">
        <Campo etiqueta="Título"><input className="ent" value={titulo} maxLength={90} onChange={(e) => setT(e.target.value)} /></Campo>
        <Campo etiqueta="Mensaje"><textarea className="ent" rows={5} value={cuerpo} onChange={(e) => setC(e.target.value)} /></Campo>
        <Campo etiqueta="Adjunto (opcional)" ayuda="Foto, video, audio, PDF o cualquier archivo."><span className="fila"><Paperclip size={17} className="tenue" /><input className="ent" type="file" onChange={(e) => setA(e.target.files?.[0] ?? null)} /></span></Campo>
        <button className="boton prim" disabled={enviar.isPending || !titulo.trim() || !cuerpo.trim() || !cuenta.data} onClick={() => enviar.mutate()}><Megaphone size={17} />{enviar.isPending ? 'Enviando…' : 'Enviar comunicado'}</button>
      </section>
    </div>
  );
}
