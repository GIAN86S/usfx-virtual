// Servidor local que imita a Supabase (Auth, REST, Storage, Functions) sobre PGlite con las migraciones reales.
// Cada petición corre con el rol y JWT del usuario, así el RLS se aplica igual que en producción.
// SOLO para demo y pruebas. Producción usa Supabase de verdad.
import { createServer } from 'node:http';
import { createHmac, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { como, crearUsuario } from './pg.mjs';

const SECRETO = randomBytes(32).toString('hex');
const ARCHIVOS = join(tmpdir(), 'usfx-demo-' + process.pid);
const b64 = (x) => Buffer.from(x).toString('base64url');
const firmar = (s) => createHmac('sha256', SECRETO).update(s).digest('base64url');
const hash = (c) => createHash('sha256').update(SECRETO + c).digest('hex');
export const hashDemo = hash;

function jwt(u) {
  const c = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(JSON.stringify({ sub: u.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, email: u.email }))}`;
  return `${c}.${firmar(c)}`;
}
function verificar(t) {
  const [a, b, s] = (t || '').split('.');
  if (!s || firmar(`${a}.${b}`) !== s) return null;
  const c = JSON.parse(Buffer.from(b, 'base64url').toString());
  return c.exp > Date.now() / 1000 ? c : null;
}
const PARSERS = { 1082: (v) => v, 1083: (v) => v, 1114: (v) => v, 1184: (v) => new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString(), 20: (v) => Number(v), 1700: (v) => Number(v) };
const ident = (s) => { if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw Object.assign(new Error('Nombre no válido: ' + s), { status: 400 }); return `"${s}"`; };
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };

function filtros(params, args) {
  const w = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const i = v.indexOf('.'); const op = v.slice(0, i); const val = v.slice(i + 1);
    if (op === 'is') w.push(`${ident(k)} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`);
    else if (op === 'in') {
      const lista = val.slice(1, -1).match(/("([^"]*)"|[^,]+)/g)?.map((x) => x.replace(/^"|"$/g, '')) ?? [];
      if (!lista.length) { w.push('false'); continue; }
      w.push(`${ident(k)} in (${lista.map((x) => { args.push(x); return `$${args.length}`; }).join(',')})`);
    } else if (OPS[op]) { args.push(val.replace(/\*/g, '%')); w.push(`${ident(k)} ${OPS[op]} $${args.length}`); }
    else throw Object.assign(new Error('Filtro no soportado: ' + op), { status: 400 });
  }
  return w.length ? ' where ' + w.join(' and ') : '';
}
const columnas = (s) => (!s || s === '*' ? '*' : s.split(',').map((x) => ident(x.trim())).join(','));
function orden(s) {
  if (!s) return '';
  return ' order by ' + s.split(',').map((x) => { const [c, d] = x.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`; }).join(',');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.map': 'application/json' };

export function crearGateway(db, { dist, dominio = 'usuarios.usfx.invalid' }) {
  mkdirSync(ARCHIVOS, { recursive: true });
  const refresh = new Map();
  const usuarioJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: u.raw_app_meta_data, user_metadata: u.raw_user_meta_data, created_at: u.created_at });
  const sesion = (u) => {
    const r = randomBytes(24).toString('hex'); refresh.set(r, u.id);
    return { access_token: jwt(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: r, user: usuarioJson(u) };
  };
  const leerUsuario = async (id) => (await db.query('select * from auth.users where id=$1', [id])).rows[0];

  async function auth(ruta, url, cuerpo, claims) {
    if (ruta === 'token' && url.searchParams.get('grant_type') === 'password') {
      const u = (await db.query('select * from auth.users where email=$1', [cuerpo.email])).rows[0];
      if (!u || u.encrypted_password !== hash(cuerpo.password)) return [400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials', message: 'Invalid login credentials' }];
      return [200, sesion(u)];
    }
    if (ruta === 'token') {
      const id = refresh.get(cuerpo.refresh_token);
      return id ? [200, sesion(await leerUsuario(id))] : [400, { msg: 'Invalid Refresh Token', message: 'Invalid Refresh Token' }];
    }
    if (ruta === 'signup') {
      if ((cuerpo.password || '').length < 8) return [422, { msg: 'Password should be at least 8 characters', message: 'Password should be at least 8 characters' }];
      const existe = (await db.query('select 1 from auth.users where email=$1', [cuerpo.email])).rows.length;
      if (existe) return [422, { msg: 'User already registered', message: 'User already registered' }];
      const r = await db.query('insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1,$2,$3) returning *', [cuerpo.email, hash(cuerpo.password), JSON.stringify(cuerpo.data ?? {})]);
      return [200, sesion(r.rows[0])];
    }
    if (ruta === 'logout') return [204, null];
    if (ruta === 'user') {
      if (!claims) return [401, { message: 'No autenticado' }];
      if (cuerpo?.password) await db.query('update auth.users set encrypted_password=$1 where id=$2', [hash(cuerpo.password), claims.sub]);
      return [200, usuarioJson(await leerUsuario(claims.sub))];
    }
    return [404, { message: 'Ruta de auth no soportada: ' + ruta }];
  }

  async function rest(metodo, tabla, url, cuerpo, uid, h) {
    const p = url.searchParams, prefer = h.prefer || '';
    if (tabla === 'rpc') throw new Error('rpc');
    const t = `public.${ident(tabla)}`;
    return como(db, uid, async (tx) => {
      const args = [];
      if (metodo === 'GET' || metodo === 'HEAD') {
        const w = filtros(p, args);
        const lim = p.get('limit') ? ` limit ${Number(p.get('limit'))}` : '', off = p.get('offset') ? ` offset ${Number(p.get('offset'))}` : '';
        const r = await tx.query(`select ${columnas(p.get('select'))} from ${t}${w}${orden(p.get('order'))}${lim}${off}`, args, { parsers: PARSERS });
        let total = null;
        if (prefer.includes('count=exact')) total = (await tx.query(`select count(*)::int n from ${t}${w}`, args)).rows[0].n;
        return { filas: r.rows, total };
      }
      const ret = p.get('select') ? columnas(p.get('select')) : '*';
      if (metodo === 'POST') {
        const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
        const cols = [...new Set(filas.flatMap((f) => Object.keys(f)))];
        const vals = filas.map((f) => '(' + cols.map((c) => { if (f[c] === undefined) return 'default'; args.push(f[c]); return `$${args.length}`; }).join(',') + ')').join(',');
        let sql = `insert into ${t} (${cols.map(ident).join(',')}) values ${vals}`;
        if (prefer.includes('resolution=')) {
          const oc = (p.get('on_conflict') || 'id').split(',').map(ident).join(',');
          sql += prefer.includes('ignore-duplicates') ? ` on conflict (${oc}) do nothing` : ` on conflict (${oc}) do update set ${cols.filter((c) => !(p.get('on_conflict') || 'id').split(',').includes(c)).map((c) => `${ident(c)}=excluded.${ident(c)}`).join(',') || `${oc}=excluded.${oc}`}`;
        }
        const r = await tx.query(sql + (prefer.includes('return=representation') ? ` returning ${ret}` : ''), args, { parsers: PARSERS });
        return { filas: r.rows, creado: true };
      }
      if (metodo === 'PATCH') {
        const sets = Object.entries(cuerpo).map(([k, v]) => { args.push(v); return `${ident(k)}=$${args.length}`; }).join(',');
        const w = filtros(p, args);
        const r = await tx.query(`update ${t} set ${sets}${w}` + (prefer.includes('return=representation') ? ` returning ${ret}` : ''), args, { parsers: PARSERS });
        return { filas: r.rows };
      }
      if (metodo === 'DELETE') {
        const w = filtros(p, args);
        const r = await tx.query(`delete from ${t}${w}` + (prefer.includes('return=representation') ? ` returning ${ret}` : ''), args, { parsers: PARSERS });
        return { filas: r.rows };
      }
      throw Object.assign(new Error('Método no soportado'), { status: 405 });
    });
  }

  async function llamar(fn, cuerpo, uid) {
    const info = (await db.query(`select p.proretset, t.typname, t.typtype from pg_proc p join pg_type t on t.oid=p.prorettype join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [fn])).rows[0];
    if (!info) throw Object.assign(new Error('Función no encontrada: ' + fn), { status: 404 });
    return como(db, uid, async (tx) => {
      const args = []; const a = Object.entries(cuerpo || {}).map(([k, v]) => { args.push(v); return `${ident(k)} => $${args.length}`; }).join(',');
      const r = await tx.query(`select * from public.${ident(fn)}(${a})`, args, { parsers: PARSERS });
      if (info.proretset) return r.rows;
      if (info.typname === 'void') return null;
      return Object.values(r.rows[0] ?? {})[0] ?? null;
    });
  }

  async function storage(metodo, partes, url, req, buf, uid, h) {
    if (partes[0] !== 'object') return [404, { message: 'Ruta de storage no soportada' }];
    if (partes[1] === 'sign' && metodo === 'POST') {
      const bucket = partes[2], name = partes.slice(3).join('/');
      const r = await como(db, uid, (tx) => tx.query('select 1 from storage.objects where bucket_id=$1 and name=$2', [bucket, name]));
      if (!r.rows.length) return [400, { statusCode: '404', error: 'not_found', message: 'Object not found' }];
      const exp = Date.now() + 3600e3, tk = firmar(`${bucket}/${name}:${exp}`);
      return [200, { signedURL: `/object/sign/${bucket}/${encodeURI(name)}?token=${tk}&exp=${exp}` }];
    }
    if (partes[1] === 'sign' && metodo === 'GET') {
      const bucket = partes[2], name = decodeURI(partes.slice(3).join('/')), exp = Number(url.searchParams.get('exp'));
      if (firmar(`${bucket}/${name}:${exp}`) !== url.searchParams.get('token') || exp < Date.now()) return [403, { message: 'Enlace vencido' }];
      const f = join(ARCHIVOS, bucket, name.replace(/\//g, '__'));
      if (!existsSync(f)) return [404, { message: 'No existe' }];
      const tipo = (await db.query('select mime from storage.objects where bucket_id=$1 and name=$2', [bucket, name])).rows[0]?.mime;
      return [200, readFileSync(f), { 'content-type': tipo || 'application/octet-stream' }];
    }
    const bucket = partes[1], name = decodeURI(partes.slice(2).join('/'));
    if (metodo === 'POST') {
      let datos = buf, tipo = h['content-type'];
      if ((h['content-type'] || '').startsWith('multipart/form-data')) {
        const fd = await new Response(buf, { headers: { 'content-type': h['content-type'] } }).formData();
        const a = [...fd.values()].find((v) => typeof v !== 'string');
        datos = Buffer.from(await a.arrayBuffer()); tipo = a.type;
      }
      await como(db, uid, (tx) => tx.query('insert into storage.objects (bucket_id,name,mime) values ($1,$2,$3)', [bucket, name, tipo]));
      mkdirSync(join(ARCHIVOS, bucket), { recursive: true });
      writeFileSync(join(ARCHIVOS, bucket, name.replace(/\//g, '__')), datos);
      return [200, { Id: name, Key: `${bucket}/${name}` }];
    }
    if (metodo === 'DELETE') {
      const pref = JSON.parse(buf.toString() || '{}').prefixes ?? [];
      for (const n of pref) await como(db, uid, (tx) => tx.query('delete from storage.objects where bucket_id=$1 and name=$2', [bucket, n]));
      return [200, []];
    }
    return [405, { message: 'Método no soportado' }];
  }

  async function funciones(nombre, cuerpo, claims) {
    if (nombre !== 'admin-usuarios') return [404, { error: 'No disponible en demo' }];
    if (!claims) return [401, { error: 'Sesión no válida' }];
    const yo = (await db.query('select rol, activo from public.perfiles where id=$1', [claims.sub])).rows[0];
    if (!yo?.activo || !['sistemas', 'admin'].includes(yo.rol)) return [403, { error: 'Solo administración' }];
    const temporal = () => 'Usfx-' + randomBytes(7).toString('base64url');
    if (cuerpo.accion === 'restablecer') {
      const c = temporal();
      await db.query('update auth.users set encrypted_password=$1 where id=$2', [hash(c), cuerpo.id]);
      await db.query('update public.perfiles set debe_cambiar_clave=true where id=$1', [cuerpo.id]);
      return [200, { clave: c }];
    }
    const out = [];
    for (const u of (cuerpo.usuarios ?? []).slice(0, 100)) {
      const usuario = String(u.usuario ?? '').trim().toLowerCase();
      try {
        if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new Error('Usuario no válido');
        if (u.rol === 'sistemas' && yo.rol !== 'sistemas') throw new Error('Solo Sistemas puede crear cuentas de Sistemas');
        const c = temporal();
        const id = await crearUsuario(db, usuario, { rol: u.rol, nombres: u.nombres, apellidos: u.apellidos, ci: u.ci, celular: u.celular, clave: hash(c), debe_cambiar_clave: true });
        if (u.rol === 'estudiante') {
          const k = (await db.query('select id from public.carreras where codigo=$1', [u.carrera_codigo])).rows[0];
          if (!k) throw new Error('Carrera no encontrada: ' + u.carrera_codigo);
          await db.query(`insert into public.estudiantes (id,codigo,carrera_id) values ($1, app.nuevo_codigo(), $2)`, [id, k.id]);
        }
        if (u.rol === 'docente') await db.query('insert into public.docentes (id) values ($1)', [id]);
        out.push({ usuario, ok: true, clave: c });
      } catch (e) { out.push({ usuario, ok: false, error: /duplicate/.test(e.message) ? 'Ese usuario ya existe' : e.message }); }
    }
    return [200, { resultados: out }];
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const h = req.headers;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
    const trozos = []; for await (const c of req) trozos.push(c);
    const buf = Buffer.concat(trozos);
    const enviar = (st, cuerpo, extra = {}) => {
      if (Buffer.isBuffer(cuerpo)) { res.writeHead(st, { ...cors, ...extra }); return res.end(cuerpo); }
      res.writeHead(st, { ...cors, 'content-type': 'application/json', ...extra }); res.end(cuerpo == null ? '' : JSON.stringify(cuerpo));
    };
    if (req.method === 'OPTIONS') return enviar(204, null);
    const p = url.pathname;
    const claims = verificar((h.authorization || '').replace(/^Bearer /i, ''));
    const uid = claims?.sub ?? null;
    const json = () => (buf.length && !(h['content-type'] || '').startsWith('multipart') ? JSON.parse(buf.toString()) : {});
    try {
      if (p.startsWith('/auth/v1/')) { const [s, d] = await auth(p.slice(9), url, json(), claims); return enviar(s, d); }
      if (p.startsWith('/rest/v1/rpc/')) { return enviar(200, await llamar(p.slice(13), json(), uid)); }
      if (p.startsWith('/rest/v1/')) {
        const r = await rest(req.method, p.slice(9), url, req.method === 'GET' ? null : json(), uid, h);
        const unico = (h.accept || '').includes('vnd.pgrst.object');
        const extra = r.total != null ? { 'content-range': `0-${Math.max(r.filas.length - 1, 0)}/${r.total}` } : {};
        if (unico) { if (r.filas.length !== 1) return enviar(406, { code: 'PGRST116', message: 'La consulta no devolvió una sola fila', details: `${r.filas.length} filas` }); return enviar(200, r.filas[0], extra); }
        return enviar(r.creado ? 201 : 200, (h.prefer || '').includes('return=minimal') || (req.method !== 'GET' && !(h.prefer || '').includes('return=representation')) ? null : r.filas, extra);
      }
      if (p.startsWith('/storage/v1/')) { const [s, d, e] = await storage(req.method, p.slice(12).split('/'), url, req, buf, uid, h); return enviar(s, d, e); }
      if (p.startsWith('/functions/v1/')) { const [s, d] = await funciones(p.slice(14), json(), claims); return enviar(s, d); }
      if (p.startsWith('/realtime/')) return enviar(404, { message: 'Sin tiempo real en demo: el chat usa sondeo' });
      // Estáticos
      let f = normalize(decodeURIComponent(p)).replace(/^([\\/])+/, '');
      f = join(dist, f);
      if (!f.startsWith(normalize(dist))) return enviar(403, { message: 'no' });
      if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
      if (!existsSync(f)) return enviar(404, { message: 'No existe' });
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'service-worker-allowed': '/' });
      return res.end(readFileSync(f));
    } catch (e) {
      const c = e.code || '';
      const st = e.status || (c === '42501' ? 403 : c === '23505' ? 409 : 400);
      return enviar(st, { code: c, message: e.message, details: e.detail ?? null, hint: null });
    }
  });
}
