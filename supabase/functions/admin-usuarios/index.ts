// Crear cuentas y restablecer claves. Requiere la clave de servicio, por eso vive en el servidor.
// Permite lotes de hasta 100 por llamada: la interfaz manda muchas llamadas pequeñas con pausas,
// así una carga de 20.000 cuentas nunca bloquea al resto de la plataforma.
import { createClient } from 'npm:@supabase/supabase-js@2';

const DOMINIO = Deno.env.get('AUTH_DOMINIO') ?? 'usuarios.usfx.invalid';
const ROLES = ['sistemas', 'admin', 'finanzas', 'director', 'docente', 'estudiante'];
const cors = { 'Access-Control-Allow-Origin': Deno.env.get('ORIGEN_APP') ?? '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const res = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...cors, 'content-type': 'application/json' } });

function claveTemporal() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(10));
  return 'Usfx-' + Array.from(b, (x) => a[x % a.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return res({});
  const url = Deno.env.get('SUPABASE_URL')!;
  const srv = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
  const { data: quien } = await srv.auth.getUser(token);
  if (!quien?.user) return res({ error: 'Sesión no válida' }, 401);
  const { data: yo } = await srv.from('perfiles').select('rol, activo').eq('id', quien.user.id).single();
  if (!yo?.activo || !['sistemas', 'admin'].includes(yo.rol)) return res({ error: 'Solo administración' }, 403);

  const b = await req.json();
  if (b.accion === 'restablecer') {
    const { data: obj } = await srv.from('perfiles').select('rol').eq('id', b.id).single();
    if (obj?.rol === 'sistemas' && yo.rol !== 'sistemas') return res({ error: 'Solo Sistemas puede tocar cuentas de Sistemas' }, 403);
    const clave = claveTemporal();
    const { error } = await srv.auth.admin.updateUserById(b.id, { password: clave });
    if (error) return res({ error: error.message }, 400);
    await srv.from('perfiles').update({ debe_cambiar_clave: true }).eq('id', b.id);
    return res({ clave });
  }
  if (b.accion === 'crear') {
    const filas = (b.usuarios ?? []).slice(0, 100);
    const salida = [];
    for (const u of filas) {
      const usuario = String(u.usuario ?? '').trim().toLowerCase();
      try {
        if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new Error('Usuario no válido');
        if (!ROLES.includes(u.rol)) throw new Error('Rol no válido');
        if (u.rol === 'sistemas' && yo.rol !== 'sistemas') throw new Error('Solo Sistemas puede crear cuentas de Sistemas');
        let carrera: string | null = null;
        if (u.rol === 'estudiante') {
          const { data: c } = await srv.from('carreras').select('id').eq('codigo', u.carrera_codigo).maybeSingle();
          if (!c) throw new Error('Carrera no encontrada: ' + u.carrera_codigo);
          carrera = c.id;
        }
        const clave = claveTemporal();
        const { data, error } = await srv.auth.admin.createUser({
          email: `${usuario}@${DOMINIO}`, password: clave, email_confirm: true,
          app_metadata: { rol: u.rol, debe_cambiar_clave: true },
          user_metadata: { nombres: u.nombres, apellidos: u.apellidos, ci: u.ci, celular: u.celular, correo: u.correo },
        });
        if (error) throw error;
        if (carrera) {
          const { data: cod } = await srv.rpc('nuevo_codigo_estudiante');
          const { error: e2 } = await srv.from('estudiantes').insert({ id: data.user.id, codigo: cod, carrera_id: carrera });
          if (e2) throw e2;
        }
        if (u.rol === 'docente') await srv.from('docentes').insert({ id: data.user.id });
        salida.push({ usuario, ok: true, clave });
      } catch (e) {
        salida.push({ usuario, ok: false, error: (e as Error).message });
      }
    }
    return res({ resultados: salida });
  }
  return res({ error: 'Acción no válida' }, 400);
});
