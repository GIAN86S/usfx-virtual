// Mide las consultas críticas con el volumen real pedido (20.000 estudiantes) y RLS activo.
// Corre en PGlite: un solo hilo en WebAssembly, mucho más lento que un servidor real.
// Sirve para detectar consultas mal planteadas (que crecen con el total), no para predecir tiempos absolutos.
import { crearDB, como, crearUsuario } from './pg.mjs';

const N = { est: 20000, doc: 800, ofertas: 2000, porEst: 5, mensajes: 300000 };
const db = await crearDB();
const t0 = Date.now();
const adm = await crearUsuario(db, 'adm', { rol: 'admin', nombres: 'A', apellidos: 'B' });
await db.exec(`
  set session_replication_role = replica; -- carga masiva sin disparadores
  insert into auth.users (id,email) select gen_random_uuid(), 'u'||g||'@x.invalid' from generate_series(1,${N.est + N.doc}) g;
  insert into perfiles (id,usuario,nombres,apellidos,ci,rol)
    select id, split_part(email,'@',1), 'Nombre'||(row_number() over ()) , 'Apellido'||(row_number() over ()), '1'||(row_number() over ()),
           case when row_number() over () <= ${N.doc} then 'docente'::rol_usuario else 'estudiante'::rol_usuario end
    from auth.users where email like 'u%';
  insert into carreras (codigo,nombre) select 'C'||g,'Carrera '||g from generate_series(1,40) g;
  insert into materias (carrera_id,sigla,nombre) select c.id,'M'||g,'Materia '||g from carreras c, generate_series(1,30) g;
  insert into periodos (nombre,modalidad,inicio,fin,inscripcion_desde,inscripcion_hasta) values ('P','semestral',current_date,current_date+90,current_date-1,current_date+30);
  create temp table doc as select id, row_number() over () n from perfiles where rol='docente';
  create temp table mat as select id, row_number() over () n from materias;
  insert into ofertas (materia_id,periodo_id,docente_id,cupo)
    select m.id,(select id from periodos),d.id,500 from mat m join doc d on d.n = (m.n % ${N.doc}) + 1;
  create temp table ofe as select id, row_number() over () n from ofertas;
  insert into estudiantes (id,codigo,carrera_id)
    select p.id,'E'||row_number() over (),(select id from carreras order by codigo limit 1) from perfiles p where p.rol='estudiante';
  create temp table est as select id, row_number() over () n from estudiantes;
  insert into inscripciones (estudiante_id,oferta_id)
    select e.id,o.id from est e, generate_series(0,${N.porEst - 1}) k join ofe o on true where false;
`);
const nOf = (await db.query('select count(*)::int n from ofe')).rows[0].n;
await db.exec(`
  insert into inscripciones (estudiante_id,oferta_id)
    select e.id,o.id from est e cross join generate_series(0,${N.porEst - 1}) k join ofe o on o.n = ((e.n + k * 37) % ${nOf}) + 1 on conflict do nothing;
  insert into conversaciones (tipo,titulo,oferta_id) select 'materia','Materia',id from ofertas;
  insert into conversacion_miembros (conversacion_id,usuario_id,gestor) select k.id,o.docente_id,true from conversaciones k join ofertas o on o.id=k.oferta_id;
  insert into conversacion_miembros (conversacion_id,usuario_id) select k.id,i.estudiante_id from inscripciones i join conversaciones k on k.oferta_id=i.oferta_id;
  insert into evaluaciones (oferta_id,nombre,ponderacion,publicada) select id,'P1',50,true from ofertas;
  insert into evaluaciones (oferta_id,nombre,ponderacion,publicada) select id,'P2',50,true from ofertas;
  insert into notas (evaluacion_id,estudiante_id,nota) select ev.id,i.estudiante_id,70 from inscripciones i join evaluaciones ev on ev.oferta_id=i.oferta_id;
  insert into cargos (estudiante_id,clave,concepto,descripcion,monto,vence) select id,'M1','mensualidad','M',100,current_date+5 from estudiantes;
  create temp table cv as select id, row_number() over () n from conversaciones;
  insert into mensajes (conversacion_id,autor_id,cuerpo,autor_nombre)
    select c.id,(select id from perfiles limit 1),'Mensaje '||g,'X' from generate_series(1,${N.mensajes}) g join cv c on c.n=(g % ${nOf})+1;
  set session_replication_role = default;
  analyze;
`);
const cuenta = async (t) => (await db.query(`select count(*)::int n from ${t}`)).rows[0].n;
console.log(`Datos: ${await cuenta('estudiantes')} estudiantes, ${await cuenta('inscripciones')} inscripciones, ${await cuenta('notas')} notas, ${await cuenta('mensajes')} mensajes, ${await cuenta('conversacion_miembros')} membresías. Carga en ${Math.round((Date.now() - t0) / 1000)} s\n`);

const est = (await db.query('select id from estudiantes order by codigo offset 5000 limit 1')).rows[0].id;
const docente = (await db.query('select docente_id d from ofertas limit 1')).rows[0].d;
const oferta = (await db.query('select oferta_id o from inscripciones where estudiante_id=$1 limit 1', [est])).rows[0].o;
const conv = (await db.query('select id from conversaciones where oferta_id=$1', [oferta])).rows[0].id;
const ev = (await db.query('select id from evaluaciones where oferta_id=$1 limit 1', [oferta])).rows[0].id;
const mide = async (nombre, uid, sql, args = [], veces = 5) => {
  const ts = [];
  let n;
  for (let i = 0; i < veces; i++) { const a = performance.now(); const r = await como(db, uid, (tx) => tx.query(sql, args)); ts.push(performance.now() - a); n = r.rows.length; }
  ts.sort((x, y) => x - y);
  console.log(`${String(Math.round(ts[Math.floor(ts.length / 2)])).padStart(7)} ms  ${nombre} (${n} filas)`);
};
console.log('Mediana de 5 repeticiones, con RLS del usuario:');
await mide('Estudiante: sus materias', est, `select oferta_id from inscripciones where estudiante_id=$1 and estado='inscrito' limit 200`, [est]);
await mide('Estudiante: catálogo con nombres', est, `select * from v_ofertas where id=$1`, [oferta]);
await mide('Estudiante: mis notas', est, `select * from v_mis_notas where estudiante_id=$1`, [est]);
await mide('Estudiante: estado financiero', est, `select mi_estado_financiero()`);
await mide('Chat: bandeja', est, `select * from mis_conversaciones(60)`);
await mide('Chat: abrir conversación (40 últimos)', est, `select * from mensajes where conversacion_id=$1 order by id desc limit 40`, [conv]);
await mide('Chat: enviar mensaje', est, `insert into mensajes (conversacion_id,autor_id,cuerpo) values ($1,$2,'hola')`, [conv, est]);
await mide('Docente: lista de la materia', docente, `select * from lista_oferta((select id from ofertas where docente_id=$1 limit 1))`, [docente]);
await mide('Docente: planilla', docente, `select planilla_notas((select id from ofertas where docente_id=$1 limit 1))`, [docente]);
await mide('Admin: buscar usuario', adm, `select id from perfiles where busqueda like '%nombre1234%' limit 30`);
await mide('Admin: resumen', adm, `select resumen_admin()`, [], 3);
await mide('Inscribirse (con reglas y cupo)', est, `select inscribir_materia((select o.id from ofertas o where not exists (select 1 from inscripciones i where i.estudiante_id=$1 and i.oferta_id=o.id) and o.materia_id in (select id from materias where carrera_id=(select carrera_id from estudiantes where id=$1)) limit 1))`, [est], 1);
console.log('\nOperaciones masivas (una vez):');
await mide('Contar audiencia: todos los estudiantes', adm, `select contar_audiencia('{"roles":["estudiante"]}')`, [], 1);
await mide('Comunicado a 20.000 estudiantes', adm, `select enviar_comunicado('Aviso','Texto','{"roles":["estudiante"]}')`, [], 1);
await mide('Generar 20.000 cargos', adm, `select generar_cargos('M2','mensualidad','M',100,current_date+30)`, [], 1);
console.log('\nPlan de la bandeja, para revisar índices:');
const plan = await como(db, est, (tx) => tx.query(`explain select * from mensajes where conversacion_id='${conv}' order by id desc limit 40`));
console.log(plan.rows.slice(0, 5).map((x) => x['QUERY PLAN']).join('\n'));
process.exit(0);
