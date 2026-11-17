// Contrato de la gestión y elección del plan de pagos (mensual en cuotas o anual en un solo pago).
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CircleCheck, FileSignature } from 'lucide-react';
import { rpc } from '../lib/sb';
import { usePerfil } from '../lib/sesion';
import { bs, fecha, nombreDe } from '../lib/util';
import { Campo, Estado, useAviso } from '../ui/ui';
import { useAcceso } from './Aula';

export function PlanesPago({ a, valor, cambiar }: { a: any; valor: string; cambiar: (v: string) => void }) {
  const n = Number(a.cuotas); const m = Number(a.monto_mensualidad); const anual = Number(a.monto_anual);
  const ahorro = n * m - anual;
  const planes = [
    ['mensual', 'Plan mensual', `${n} cuotas de ${bs(m)}`, `Total ${bs(n * m)} · primera cuota ${a.primer_vencimiento ? fecha(a.primer_vencimiento) : ''}`],
    ['anual', 'Plan anual', `Un solo pago de ${bs(anual)}`, ahorro > 0 ? `Ahorras ${bs(ahorro)} · vence ${a.primer_vencimiento ? fecha(a.primer_vencimiento) : ''}` : `Toda la gestión pagada de una vez · vence ${a.primer_vencimiento ? fecha(a.primer_vencimiento) : ''}`],
  ];
  return (
    <div className="rejilla" role="radiogroup" aria-label="Plan de pagos">
      {planes.map(([k, t, mo, d]) => (
        <button key={k} type="button" role="radio" aria-checked={valor === k} className="tarjeta" onClick={() => cambiar(k)}
          style={{ textAlign: 'left', cursor: 'pointer', outline: valor === k ? '2px solid var(--azul, #1E3A6E)' : undefined, outlineOffset: 2 }}>
          <div className="fila entre"><b>{t}</b>{valor === k && <CircleCheck size={18} />}</div>
          <div style={{ fontSize: 20, margin: '6px 0 2px' }}><b>{mo}</b></div>
          <div className="chico tenue">{d}</div>
        </button>
      ))}
    </div>
  );
}

export function Contrato() {
  const p = usePerfil(); const aviso = useAviso(); const qc = useQueryClient(); const ir = useNavigate();
  const a = useAcceso();
  const [plan, setPlan] = useState('mensual');
  const [nombre, setNombre] = useState(nombreDe(p)); const [ci, setCi] = useState(p.ci ?? ''); const [acepto, setAcepto] = useState(false); const [oc, setO] = useState(false);
  const firmar = async (e: any) => {
    e.preventDefault();
    if (!acepto) return aviso('Marca que leíste y aceptas el contrato', true);
    setO(true);
    try {
      await rpc('firmar_contrato', { p_plan: plan, p_nombre: nombre, p_ci: ci, p_agente: navigator.userAgent });
      aviso('Contrato firmado. Tus cuotas ya están en Matrícula y pagos.');
      for (const k of ['mi-acceso', 'mis-cargos', 'estado-fin']) qc.invalidateQueries({ queryKey: [k] });
      ir('/pagos');
    } catch (x: any) { aviso(x.message, true); setO(false); }
  };
  return (
    <Estado q={a}>
      {() => a.data.contrato ? (
        <div className="tarjeta pila" style={{ maxWidth: 680 }}>
          <div className="fila"><CircleCheck size={22} /><h2 style={{ margin: 0 }}>Contrato de la gestión {a.data.gestion} firmado</h2></div>
          <p className="tenue" style={{ margin: 0 }}>Plan {a.data.contrato.plan} · firmado el {fecha(a.data.contrato.firmado_en)}.</p>
          <button className="boton prim" style={{ alignSelf: 'flex-start' }} onClick={() => ir('/pagos')}>Ver mis cuotas</button>
        </div>
      ) : (
        <form className="pila" style={{ maxWidth: 760 }} onSubmit={firmar}>
          <div className="aviso"><FileSignature size={20} /><span>Para acceder a tus clases de la gestión {a.data.gestion}, elige tu plan de pagos y firma tu contrato.</span></div>
          <h2 style={{ margin: 0 }}>1. Elige tu plan</h2>
          <PlanesPago a={a.data} valor={plan} cambiar={setPlan} />
          <h2 style={{ margin: 0 }}>2. Lee el contrato</h2>
          <div className="tarjeta" style={{ maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{a.data.texto_contrato}</div>
          <h2 style={{ margin: 0 }}>3. Firma</h2>
          <div className="fila envolver">
            <Campo etiqueta="Nombre completo"><input className="ent" required minLength={5} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" /></Campo>
            <Campo etiqueta="Carnet de identidad"><input className="ent" required minLength={4} value={ci} onChange={(e) => setCi(e.target.value)} /></Campo>
          </div>
          <label className="fila"><input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />Leí el contrato y acepto sus condiciones y el plan de pagos elegido.</label>
          <button className="boton prim" style={{ alignSelf: 'flex-start' }} disabled={oc}><FileSignature size={16} />{oc ? 'Firmando…' : 'Firmar contrato'}</button>
        </form>
      )}
    </Estado>
  );
}
export default Contrato;
