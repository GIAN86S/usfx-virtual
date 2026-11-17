// Crea la primera cuenta de Sistemas. Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/crear-admin.mjs usuario "Nombres" "Apellidos"
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const [usuario, nombres = '', apellidos = ''] = process.argv.slice(2);
if (!usuario || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan datos: revisa el encabezado de este script.');
  process.exit(1);
}
const srv = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const clave = 'Usfx-' + randomBytes(9).toString('base64url');
const dominio = process.env.AUTH_DOMINIO ?? 'usuarios.usfx.invalid';
const { error } = await srv.auth.admin.createUser({
  email: `${usuario}@${dominio}`, password: clave, email_confirm: true,
  app_metadata: { rol: 'sistemas', debe_cambiar_clave: true }, user_metadata: { nombres, apellidos },
});
if (error) { console.error(error.message); process.exit(1); }
console.log(`Cuenta creada. Usuario: ${usuario}\nClave temporal (se pide cambiarla al entrar): ${clave}`);
