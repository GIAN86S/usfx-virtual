// Recibe la confirmación de pago del banco y marca la cuota como pagada.
// Seguridad: la firma HMAC-SHA256 del cuerpo debe coincidir con BANCO_WEBHOOK_SECRETO.
// La función de la base (confirmar_cobro_qr) es idempotente: un aviso repetido no paga dos veces.
//
// ADAPTADOR PENDIENTE: ajustar el nombre de la cabecera de firma y de los campos a la especificación del banco.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SECRETO = Deno.env.get('BANCO_WEBHOOK_SECRETO') ?? '';
const CABECERA_FIRMA = Deno.env.get('BANCO_CABECERA_FIRMA') ?? 'x-firma';

async function firmaValida(cuerpo: string, firma: string | null): Promise<boolean> {
  if (!SECRETO || !firma) return false;
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRETO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(cuerpo)));
  const esperada = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  const recibida = firma.replace(/^sha256=/i, '').toLowerCase();
  if (recibida.length !== esperada.length) return false;
  let dif = 0;
  for (let i = 0; i < esperada.length; i++) dif |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i);
  return dif === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('no', { status: 405 });
  const cuerpo = await req.text();
  if (!(await firmaValida(cuerpo, req.headers.get(CABECERA_FIRMA)))) return new Response('firma no válida', { status: 401 });
  let d: any;
  try { d = JSON.parse(cuerpo); } catch { return new Response('cuerpo no válido', { status: 400 }); }
  const referencia = String(d.referencia ?? d.reference ?? '');
  const transaccion = String(d.transaccion ?? d.idTransaccion ?? d.transactionId ?? '');
  const monto = Number(d.monto ?? d.amount);
  if (!referencia || !transaccion || !(monto > 0)) return new Response('faltan datos', { status: 400 });
  const srv = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await srv.rpc('confirmar_cobro_qr', { p_referencia: referencia, p_banco_tx: transaccion, p_monto: monto });
  if (error) return new Response(error.message, { status: 500 });
  // El banco solo necesita saber que lo recibimos; el resultado queda registrado en la base.
  return Response.json({ recibido: true, resultado: data });
});
