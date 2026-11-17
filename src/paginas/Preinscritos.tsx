// Preinscritos desde la landing: el embudo de captación de postulantes.
// Administración los contacta por WhatsApp en un clic, les cambia el estado y les envía avisos push.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, ChevronLeft, ChevronRight, MessageCircle, Search } from 'lucide-react';
import { usePerfil } from '../lib/sesion';
import { dato, rpc, sb } from '../lib/sb';
import { fecha, hora, num } from '../lib/util';
import { Campo, Estado, Exportar, Kpi, Modal, useAviso, Vacio } from '../ui/ui';

export const CARRERAS_LANDING: Record<string, string> = {
  derecho: 'Derecho', psicologia: 'Psicología', gerencia: 'Gerencia y Adm. Pública',
  sistemas: 'Ingeniería de Sistemas', contaduria: 'Contaduría Pública', filosofia: 'Filosofía',
};
const ESTADOS: Record<string, [string, string]> = {
  nueva: ['Nueva', 'inf'], contactada: ['Contactada', 'med'], postulo: ['Ya postuló', 'ok'], descartada: ['Descartada', 'mal'],
};
const POR_PAGINA = 40;
const COLS = 'id,codigo,carrera,nombres,apellidos,celular,correo,pais,ciudad,es_profesional,origen,estado,nota,creado_en';

const whatsapp = (p: any) => {
  const num = p.celular.replace(/^\+/, '');
  const intl = num.length <= 8 ? '591' + num : num; // números bolivianos sin prefijo
  const txt = `Hola ${p.nombres}, te saludamos de la USFX Virtual. Recibimos tu preinscripción (${p.codigo}) a ${CARRERAS_LANDING[p.carrera]}. ¿Te ayudamos a completar tu postulación?`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(txt)}`;
};

export function Preinscritos() {
  const yo = usePerfil(); const aviso = useAviso(); const qc = useQueryClient();
  const puede = yo.rol === 'sistemas' || yo.rol === 'admin';
  const [buscar, setB] = useState(''); const [t, setT] = useState('');
  const [carrera, setCarrera] = useState(''); const [estado, setEstado] = useState(''); const [pag, setPag] = useState(0);
  const [avisar, setAvisar] = useState(false);
  useEffect(() => { const x = setTimeout(() => { setT(buscar.trim()); setPag(0); }, 300); return () => clearTimeout(x); }, [buscar]);

  const resumen = useQuery({
    queryKey: ['preins-resumen'],
    queryFn: async () => {
      const r = dato(await sb.from('preinscripciones').select('carrera,estado,creado_en').order('creado_en', { ascending: false }).limit(5000)) as any[];
      const semana = Date.now() - 7 * 864e5;
      return {
        total: r.length,
        nuevas: r.filter((x) => x.estado === 'nueva').length,
        semana: r.filter((x) => new Date(x.creado_en).getTime() > semana).length,
        postularon: r.filter((x) => x.estado === 'postulo').length,
        porCarrera: Object.keys(CARRERAS_LANDING).map((k) => [k, r.filter((x) => x.carrera === k).length] as const),
      };
    },
  });

  const q = useQuery({
    queryKey: ['preins', t, carrera, estado, pag], placeholderData: (p) => p,
    queryFn: async () => {
      let c = sb.from('preinscripciones').select(COLS, { count: 'exact' }).order('creado_en', { ascending: false }).range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1);
      if (carrera) c = c.eq('carrera', carrera);
      if (estado) c = c.eq('estado', estado);
      if (t) c = /^\+?\d+$/.test(t) ? c.like('celular', `%${t}%`) : /^pre/i.test(t) ? c.eq('codigo', t.toUpperCase()) : c.ilike('apellidos', `%${t}%`);
      const r = await c; dato(r as any);
      return { filas: r.data as any[], total: r.count ?? 0 };
    },
  });

  const cambiar = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: string }) => dato(await sb.from('preinscripciones').update({ estado }).eq('id', id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['preins'] }); qc.invalidateQueries({ queryKey: ['preins-resumen'] }); },
    onError: (e: any) => aviso(e.message, true),
  });

  const total = q.data?.total ?? 0;
  const conv = resumen.data && resumen.data.total ? Math.round((resumen.data.postularon / resumen.data.total) * 100) : 0;

  return (
    <div className="pila">
      <Estado q={resumen}>
        {() => (
          <>
            <div className="kpis">
              <Kpi titulo="Preinscritos" valor={num(resumen.data!.total)} nota="desde la landing" />
              <Kpi titulo="Sin contactar" valor={num(resumen.data!.nuevas)} nota="estado «Nueva»" />
              <Kpi titulo="Últimos 7 días" valor={num(resumen.data!.semana)} />
              <Kpi titulo="Conversión" valor={`${conv}%`} nota="ya postularon" />
            </div>
            <div className="fila envolver" style={{ gap: 8 }}>
              {resumen.data!.porCarrera.map(([k, n]) => (
                <button key={k} className={'etiqueta' + (carrera === k ? ' inf' : '')} style={{ cursor: 'pointer', border: 0 }} onClick={() => { setCarrera(carrera === k ? '' : k); setPag(0); }}>
                  {CARRERAS_LANDING[k]} · {n}
                </button>
              ))}
            </div>
          </>
        )}
      </Estado>

      <div className="fila envolver entre">
        <span className="fila envolver">
          <label className="fila tarjeta" style={{ padding: '0 10px' }}><Search size={17} className="tenue" /><input className="ent" style={{ border: 0, minWidth: 210 }} aria-label="Buscar preinscrito" placeholder="Apellido, celular o código" value={buscar} onChange={(e) => setB(e.target.value)} /></label>
          <select className="ent" style={{ width: 'auto' }} aria-label="Filtrar por carrera" value={carrera} onChange={(e) => { setCarrera(e.target.value); setPag(0); }}>
            <option value="">Todas las carreras</option>{Object.entries(CARRERAS_LANDING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="ent" style={{ width: 'auto' }} aria-label="Filtrar por estado" value={estado} onChange={(e) => { setEstado(e.target.value); setPag(0); }}>
            <option value="">Todos los estados</option>{Object.entries(ESTADOS).map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </span>
        <span className="fila">
          <Exportar disabled={!q.data?.filas.length} reporte={() => ({
            titulo: 'Preinscritos USFX Virtual', subtitulo: carrera ? CARRERAS_LANDING[carrera] : 'Todas las carreras', archivo: 'preinscritos', horizontal: true,
            columnas: ['Fecha', 'Código', 'Carrera', 'Apellidos', 'Nombres', 'Celular', 'Correo', 'País', 'Ciudad', 'Profesional', 'Origen', 'Estado'],
            filas: (q.data?.filas ?? []).map((p) => [fecha(p.creado_en), p.codigo, CARRERAS_LANDING[p.carrera], p.apellidos, p.nombres, p.celular, p.correo, p.pais, p.ciudad, p.es_profesional ? 'Sí' : 'No', p.origen?.utm_source ?? p.origen?.como ?? '', ESTADOS[p.estado][0]]),
          })} />
          {puede && <button className="boton prim" onClick={() => setAvisar(true)}><BellRing size={16} />Enviar aviso</button>}
        </span>
      </div>

      <Estado q={q} vacio={<div className="tarjeta"><Vacio titulo="Aún no hay preinscritos" texto="Cuando alguien llene el formulario de la landing, aparecerá aquí al instante." /></div>}>
        {() => q.data!.filas.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin resultados" texto="Prueba con otro filtro." /></div> : (
          <>
            <div className="tabla-c"><table className="tabla">
              <thead><tr><th>Fecha</th><th>Persona</th><th>Carrera</th><th>Contacto</th><th>Origen</th><th>Estado</th><th></th></tr></thead>
              <tbody>{q.data!.filas.map((p) => (
                <tr key={p.id}>
                  <td className="nowrap chico">{fecha(p.creado_en)}<br /><span className="tenue">{hora(p.creado_en)}</span></td>
                  <td><b className="nowrap">{p.apellidos} {p.nombres}</b><br /><span className="tenue chico">{p.codigo}{p.es_profesional ? ' · profesional' : ''}{p.ciudad ? ` · ${p.ciudad}` : ''}{p.pais && p.pais !== 'Bolivia' ? ` (${p.pais})` : ''}</span></td>
                  <td className="nowrap">{CARRERAS_LANDING[p.carrera]}</td>
                  <td className="chico"><span className="nowrap">{p.celular}</span>{p.correo && <><br /><span className="tenue">{p.correo}</span></>}</td>
                  <td className="chico tenue">{p.origen?.utm_source ?? p.origen?.como ?? 'directo'}</td>
                  <td>
                    {puede ? (
                      <select className="ent" style={{ width: 'auto', minHeight: 34 }} aria-label={`Estado de ${p.nombres}`} value={p.estado} onChange={(e) => cambiar.mutate({ id: p.id, estado: e.target.value })}>
                        {Object.entries(ESTADOS).map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    ) : <span className={'etiqueta ' + ESTADOS[p.estado][1]}>{ESTADOS[p.estado][0]}</span>}
                  </td>
                  <td className="der">
                    <a className="boton ch" href={whatsapp(p)} target="_blank" rel="noopener" title="Escribir por WhatsApp"
                      onClick={() => { if (puede && p.estado === 'nueva') cambiar.mutate({ id: p.id, estado: 'contactada' }); }}>
                      <MessageCircle size={15} />WhatsApp
                    </a>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="fila entre"><span className="tenue chico">{num(total)} preinscritos</span>
              <span className="fila"><button className="icono-btn" aria-label="Página anterior" disabled={pag === 0} onClick={() => setPag(pag - 1)}><ChevronLeft size={19} /></button><span className="chico">Página {pag + 1} de {Math.max(1, Math.ceil(total / POR_PAGINA))}</span><button className="icono-btn" aria-label="Página siguiente" disabled={(pag + 1) * POR_PAGINA >= total} onClick={() => setPag(pag + 1)}><ChevronRight size={19} /></button></span>
            </div>
          </>
        )}
      </Estado>
      {avisar && <EnviarAviso carrera={carrera} cerrar={() => setAvisar(false)} />}
    </div>
  );
}

function EnviarAviso({ carrera: inicial, cerrar }: { carrera: string; cerrar: () => void }) {
  const aviso = useAviso();
  const [f, setF] = useState({ titulo: '', cuerpo: '', carrera: inicial, publico: 'todos' as 'todos' | 'preinscritos' | 'visitantes' });
  const alcance = useQuery({ queryKey: ['conteo-avisos'], queryFn: () => rpc<{ visitantes: number; preinscritos: number }>('conteo_avisos') });
  const m = useMutation({
    mutationFn: async () => {
      const args = { p_titulo: f.titulo, p_cuerpo: f.cuerpo, p_carrera: f.carrera || null };
      let n = 0;
      if (f.publico !== 'visitantes') n += await rpc<number>('avisar_preinscritos', args);
      if (f.publico !== 'preinscritos') n += await rpc<number>('avisar_visitantes', args);
      return n;
    },
    onSuccess: (n) => { aviso(n ? `Aviso en camino a ${num(n)} dispositivos` : 'Aviso guardado. Aún nadie de este grupo activó las notificaciones.'); cerrar(); },
    onError: (e: any) => aviso(e.message, true),
  });
  return (
    <Modal titulo="Enviar aviso" cerrar={cerrar}>
      <form className="pila" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <p className="tenue chico" style={{ margin: 0 }}>Llega como notificación al celular o computadora de quienes activaron los avisos en la página. Al tocarla, se abre la landing en la sección de admisión.</p>
        <Campo etiqueta="Público" ayuda={alcance.data ? `${num(alcance.data.visitantes)} visitantes y ${num(alcance.data.preinscritos)} preinscritos con avisos activos` : undefined}>
          <select className="ent" value={f.publico} onChange={(e) => setF({ ...f, publico: e.target.value as any })}>
            <option value="todos">Todos: visitantes y preinscritos</option>
            <option value="preinscritos">Solo preinscritos</option>
            <option value="visitantes">Solo visitantes (aún no se preinscriben)</option>
          </select>
        </Campo>
        <Campo etiqueta="Carrera">
          <select className="ent" value={f.carrera} onChange={(e) => setF({ ...f, carrera: e.target.value })}>
            <option value="">Todas las carreras</option>{Object.entries(CARRERAS_LANDING).map(([k, v]) => <option key={k} value={k}>Interesados en {v}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Título" ayuda={`${f.titulo.length}/80`}><input className="ent" required minLength={3} maxLength={80} placeholder="¡Abrimos las postulaciones 2027!" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
        <Campo etiqueta="Mensaje" ayuda={`${f.cuerpo.length}/240`}><textarea className="ent" rows={3} maxLength={240} placeholder="Ya puedes subir tus documentos desde la app Matrícula." value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} /></Campo>
        <button className="boton prim" disabled={m.isPending}><BellRing size={16} />{m.isPending ? 'Enviando…' : 'Enviar ahora'}</button>
      </form>
    </Modal>
  );
}

export default Preinscritos;
