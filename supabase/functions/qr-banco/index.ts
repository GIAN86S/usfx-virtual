// Genera el QR verificable de una cuota. El estudiante lo paga desde la app de su banco
// y el banco avisa al webhook (qr-banco-webhook): la cuota queda pagada sin revisión manual.
//
// ADAPTADOR PENDIENTE: la integración se ajusta a la especificación técnica que entregue el banco.
// Mientras no estén configuradas las variables BANCO_*, responde 503 y la app ofrece reportar el pago con comprobante.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': Deno.env.get('ORIGEN_APP') ?? '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const res = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...cors, 'content-type': 'application/json' } });

interface QrBanco { imagenBase64: string; idBanco: string }

/**
 * Pide al banco un QR de cobro. Ajustar a la documentación del banco:
 * endpoint, autenticación, nombres de campos y formato de la respuesta.
 */
async function crearQrEnBanco(c: { referencia: string; monto: number; glosa: string; vence: string }): Promise<QrBanco> {
  const base = Deno.env.get('BANCO_API_URL');
  const clave = Deno.env.get('BANCO_API_KEY');
  if (!base || !clave) throw Object.assign(new Error('El cobro por QR aún no está habilitado.'), { status: 503 });
  const r = await fetch(`${base}/qr`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${clave}` },
    body: JSON.stringify({ referencia: c.referencia, monto: c.monto, moneda: 'BOB', glosa: c.glosa, vencimiento: c.vence, unicoUso: true }),
  });
  if (!r.ok) throw Object.assign(new Error('El banco no pudo generar el QR. Intenta en unos minutos.'), { status: 502 });
  const d = await r.json();
  return { imagenBase64: d.qr ?? d.imagen ?? d.qrImage, idBanco: String(d.id ?? d.idQr ?? '') };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return res({});
  const url = Deno.env.get('SUPABASE_URL')!;
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
  // Como el estudiante: la base verifica que la cuota sea suya y reserva la referencia.
  const comoEl = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const srv = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    const { cargo_id } = await req.json();
    const { data: cobro, error } = await comoEl.rpc('solicitar_cobro_qr', { p_cargo: cargo_id });
    if (error) return res({ error: error.message }, 400);
    if (cobro.qr_imagen) return res({ referencia: cobro.referencia, monto: cobro.monto, expira_en: cobro.expira_en, qr: cobro.qr_imagen });
    const { data: cargo } = await srv.from('cargos').select('descripcion').eq('id', cargo_id).single();
    const qr = await crearQrEnBanco({ referencia: cobro.referencia, monto: Number(cobro.monto), glosa: `USFX Virtual · ${cargo?.descripcion ?? 'Cuota'}`.slice(0, 60), vence: cobro.expira_en });
    await srv.rpc('guardar_qr_banco', { p_cobro: cobro.id, p_imagen: qr.imagenBase64, p_banco_id: qr.idBanco });
    return res({ referencia: cobro.referencia, monto: cobro.monto, expira_en: cobro.expira_en, qr: qr.imagenBase64 });
  } catch (e: any) {
    return res({ error: e.message ?? 'No se pudo generar el QR' }, e.status ?? 500);
  }
});
