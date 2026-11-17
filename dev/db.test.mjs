// Pruebas de seguridad y reglas de negocio contra las migraciones reales, con RLS activo.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearDB, como, crearUsuario } from './pg.mjs';

let db, U = {}, carrera, carrera2, oferta, oferta2, periodo, materia, ev1, ev2, conv;
const q = (uid, sql, args = []) => como(db, uid, (tx) => tx.query(sql, args)).then((r) => r.rows);
const niega = async (p, re) => { await assert.rejects(p, re || /permis|permission|row-level|Solo|No puedes|Sin |Elige/i); };

before(async () => {
  db = await crearDB();
  for (const [k, rol] of [['sistemas', 'sistemas'], ['admin', 'admin'], ['finanzas', 'finanzas'], ['director', 'director'], ['docente', 'docente'], ['docente2', 'docente'], ['ana', 'estudiante'], ['beto', 'estudiante'], ['otra', 'estudiante']]) {
    U[k] = await crearUsuario(db, k, { rol, nombres: k, apellidos: 'Prueba', ci: '100' + k, celular: '7000' });
  }
  U.post = await crearUsuario(db, 'post', { nombres: 'Postu', apellidos: 'Lante' });
  const a = U.admin;
  carrera = (await q(a, `insert into carreras (codigo,nombre,director_id) values ('SIS','Sistemas',$1) returning id`, [U.director]))[0].id;
  carrera2 = (await q(a, `insert into carreras (codigo,nombre) values ('DER','Derecho') returning id`))[0].id;
  periodo = (await q(a, `insert into periodos (nombre,modalidad,inicio,fin,inscripcion_desde,inscripcion_hasta) values ('2026-M11','modular',current_date,current_date+30,current_date-1,current_date+5) returning id`))[0].id;
  materia = (await q(a, `insert into materias (carrera_id,sigla,nombre) values ($1,'SIS101','Algoritmos') returning id`, [carrera]))[0].id;
  const m2 = (await q(a, `insert into materias (carrera_id,sigla,nombre) values ($1,'SIS201','Datos') returning id`, [carrera]))[0].id;
  await q(a, `insert into prerrequisitos values ($1,$2)`, [m2, materia]);
  oferta = (await q(a, `insert into ofertas (materia_id,periodo_id,docente_id,cupo) values ($1,$2,$3,2) returning id`, [materia, periodo, U.docente]))[0].id;
  oferta2 = (await q(a, `insert into ofertas (materia_id,periodo_id,docente_id) values ($1,$2,$3) returning id`, [m2, periodo, U.docente2]))[0].id;
  for (const k of ['ana', 'beto', 'otra']) await q(a, `insert into estudiantes (id,codigo,carrera_id) values ($1,$2,$3)`, [U[k], 'C' + k, carrera]);
  await q(a, `insert into docentes (id) values ($1),($2)`, [U.docente, U.docente2]);
  conv = (await q(a, `select id from conversaciones where oferta_id=$1`, [oferta]).catch(() => []))[0];
  conv = (await db.query(`select id from conversaciones where oferta_id=$1`, [oferta])).rows[0].id;
});

test('una cuenta nueva nace como postulante y no se puede subir de rol', async () => {
  const [p] = await q(U.post, `select rol from perfiles where id=$1`, [U.post]);
  assert.equal(p.rol, 'postulante');
  await niega(q(U.post, `update perfiles set rol='sistemas' where id=$1`, [U.post]), /permission/);
  await niega(q(U.post, `insert into estudiantes (id,codigo,carrera_id) values ($1,'x',$2)`, [U.post, carrera]), /row-level|permission/);
});

test('metadatos del usuario no otorgan rol (solo app_metadata)', async () => {
  const id = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('hack@usuarios.usfx.invalid', '{"rol":"sistemas"}') returning id`)).rows[0].id;
  assert.equal((await db.query(`select rol from perfiles where id=$1`, [id])).rows[0].rol, 'postulante');
});

test('anónimo no ve nada', async () => {
  for (const t of ['perfiles', 'notas', 'cargos', 'mensajes', 'carreras']) {
    await assert.rejects(q(null, `select * from ${t}`), /permission/, t);
  }
});

test('un estudiante no ve CI ni datos de otros', async () => {
  const f = await q(U.ana, `select id, ci from perfiles`);
  assert.deepEqual(f.map((x) => x.id), [U.ana]);
});

test('inscripción: permisos, cupo y prerrequisito', async () => {
  await q(U.ana, `select inscribir_materia($1)`, [oferta]);
  await niega(q(U.ana, `select inscribir_materia($1)`, [oferta]), /Ya estás inscrito/);
  await niega(q(U.ana, `select inscribir_materia($1)`, [oferta2]), /prerrequisito/);
  await q(U.beto, `select inscribir_materia($1)`, [oferta]);
  await niega(q(U.otra, `select inscribir_materia($1)`, [oferta]), /cupos/);
  await niega(q(U.ana, `insert into inscripciones (estudiante_id,oferta_id) values ($1,$2)`, [U.ana, oferta2]), /permission|row-level/);
  assert.equal((await db.query(`select inscritos from ofertas where id=$1`, [oferta])).rows[0].inscritos, 2);
});

test('asistencia: solo quien dicta la materia', async () => {
  const marcas = JSON.stringify([{ estudiante_id: U.ana, estado: 'presente' }, { estudiante_id: U.beto, estado: 'falta' }, { estudiante_id: U.otra, estado: 'presente' }]);
  await niega(q(U.docente2, `select pasar_asistencia($1,current_date,'x',$2)`, [oferta, marcas]));
  await niega(q(U.ana, `select pasar_asistencia($1,current_date,'x',$2)`, [oferta, marcas]));
  await q(U.docente, `select pasar_asistencia($1,current_date,'Intro',$2)`, [oferta, marcas]);
  const n = await q(U.docente, `select * from asistencias`);
  assert.equal(n.length, 2, 'quien no está inscrito no entra a la lista');
  assert.equal((await q(U.ana, `select * from asistencias`)).length, 1, 'cada estudiante ve solo la suya');
  assert.equal((await q(U.otra, `select * from v_asistencia_estudiante`)).length, 0);
});

test('notas: planilla, ponderaciones y aislamiento', async () => {
  await niega(q(U.docente2, `insert into evaluaciones (oferta_id,nombre,ponderacion) values ($1,'x',10)`, [oferta]), /row-level/);
  ev1 = (await q(U.docente, `insert into evaluaciones (oferta_id,nombre,ponderacion,publicada) values ($1,'Parcial',60,true) returning id`, [oferta]))[0].id;
  await niega(q(U.docente, `select cerrar_acta($1)`, [oferta]), /sumar 100/);
  ev2 = (await q(U.docente, `insert into evaluaciones (oferta_id,nombre,ponderacion) values ($1,'Final',40) returning id`, [oferta]))[0].id;
  await q(U.docente, `select guardar_notas($1,$2)`, [ev1, JSON.stringify([{ estudiante_id: U.ana, nota: 80 }, { estudiante_id: U.beto, nota: 40 }])]);
  await q(U.docente, `select guardar_notas($1,$2)`, [ev2, JSON.stringify([{ estudiante_id: U.ana, nota: 70 }, { estudiante_id: U.beto, nota: 50 }])]);
  await niega(q(U.docente2, `select guardar_notas($1,$2)`, [ev1, '[]']));
  await niega(q(U.ana, `select guardar_notas($1,$2)`, [ev1, JSON.stringify([{ estudiante_id: U.ana, nota: 100 }])]));
  await niega(q(U.ana, `update notas set nota=100`), /permission/);
  const mias = await q(U.ana, `select * from v_mis_notas`);
  assert.equal(mias.length, 1, 'evaluación no publicada no se ve');
  assert.equal(Number(mias[0].nota), 80);
});

test('deuda vencida bloquea notas y kardex en la base de datos', async () => {
  await q(U.finanzas, `insert into cargos (estudiante_id,clave,concepto,descripcion,monto,vence) values ($1,'MENS-1','mensualidad','Octubre',100,current_date-5)`, [U.ana]);
  assert.equal((await q(U.ana, `select * from notas`)).length, 0, 'sin pagar: no ve notas');
  assert.equal((await q(U.ana, `select (mi_estado_financiero()->>'al_dia')::boolean x`))[0].x, false);
  assert.equal((await q(U.docente, `select * from notas where estudiante_id=$1`, [U.ana])).length, 2, 'el docente sí las ve');
  await q(U.docente, `select cerrar_acta($1)`, [oferta]);
  assert.equal((await q(U.ana, `select * from v_kardex`)).length, 0, 'kardex bloqueado');
  assert.equal((await q(U.ana, `select * from notas_finales`)).length, 0);
  assert.equal((await q(U.beto, `select * from v_kardex`)).length, 1, 'quien está al día sí ve');
});

test('cierre de acta: nota final correcta y bloqueo posterior', async () => {
  const f = (await db.query(`select estudiante_id, nota, aprobado from notas_finales`)).rows;
  const ana = f.find((x) => x.estudiante_id === U.ana), beto = f.find((x) => x.estudiante_id === U.beto);
  assert.equal(Number(ana.nota), 76); assert.equal(ana.aprobado, true);
  assert.equal(Number(beto.nota), 44); assert.equal(beto.aprobado, false);
  await niega(q(U.docente, `select guardar_notas($1,$2)`, [ev1, JSON.stringify([{ estudiante_id: U.beto, nota: 100 }])]), /cerrada/);
  await niega(q(U.docente, `select reabrir_acta($1,'x')`, [oferta]));
});

test('pagos: el estudiante reporta, solo Finanzas aprueba, y se libera el acceso', async () => {
  const [c] = await q(U.ana, `select id from cargos`);
  await niega(q(U.ana, `insert into pagos (cargo_id,estudiante_id,monto,estado) values ($1,$2,100,'aprobado')`, [c.id, U.ana]), /row-level/);
  await niega(q(U.beto, `insert into pagos (cargo_id,estudiante_id,monto) values ($1,$2,100)`, [c.id, U.beto]), /row-level/);
  const [p] = await q(U.ana, `insert into pagos (cargo_id,estudiante_id,monto,referencia) values ($1,$2,100,'QR1') returning id`, [c.id, U.ana]);
  assert.equal((await q(U.ana, `select estado from cargos`))[0].estado, 'en_revision');
  assert.equal((await q(U.ana, `select * from v_kardex`)).length, 0, 'en revisión todavía no libera');
  await niega(q(U.ana, `select revisar_pago($1,true)`, [p.id]));
  await niega(q(U.docente, `select revisar_pago($1,true)`, [p.id]));
  await q(U.finanzas, `select revisar_pago($1,true)`, [p.id]);
  assert.equal((await q(U.ana, `select estado from cargos`))[0].estado, 'pagado');
  assert.equal((await q(U.ana, `select * from v_kardex`)).length, 1, 'pagado: vuelve a ver');
  assert.equal((await q(U.ana, `select * from notificaciones where titulo='Pago aprobado'`)).length, 1);
});

test('generar cargos por lote no duplica', async () => {
  const a = (await q(U.finanzas, `select generar_cargos('MENS-2','mensualidad','Nov',100,current_date+20,$1) n`, [carrera]))[0].n;
  const b = (await q(U.finanzas, `select generar_cargos('MENS-2','mensualidad','Nov',100,current_date+20,$1) n`, [carrera]))[0].n;
  assert.equal(a, 3); assert.equal(b, 0);
  await niega(q(U.ana, `select generar_cargos('X','otro','x',1,current_date)`));
});

test('postulación: exige todos los documentos y al aprobar crea estudiante y matrícula', async () => {
  await q(U.post, `insert into postulaciones (usuario_id,carrera_id) values ($1,$2)`, [U.post, carrera]);
  await niega(q(U.post, `update postulaciones set estado='aprobada'`), /row-level/);
  await niega(q(U.post, `select enviar_postulacion()`), /carnet/);
  await q(U.post, `update postulaciones set ci_anverso_path='a',ci_reverso_path='b'`);
  await niega(q(U.post, `select enviar_postulacion()`), /título/);
  await q(U.post, `update postulaciones set titulo_path='t'`);
  await niega(q(U.post, `select enviar_postulacion()`), /4x4/);
  await q(U.post, `update postulaciones set foto_path='f'`);
  await niega(q(U.post, `select enviar_postulacion()`), /declaración/);
  await q(U.post, `update postulaciones set declaracion='{"ok":true}', declaracion_aceptada_en=now()`);
  await q(U.post, `select enviar_postulacion()`);
  await q(U.post, `update postulaciones set estado='aprobada'`);
  assert.equal((await q(U.post, `select estado from postulaciones`))[0].estado, 'enviada', 'no puede autoaprobarse');
  const [p] = await q(U.admin, `select id from postulaciones`);
  await niega(q(U.post, `select resolver_postulacion($1,'aprobada')`, [p.id]));
  await q(U.admin, `select resolver_postulacion($1,'aprobada')`, [p.id]);
  assert.equal((await q(U.post, `select rol from perfiles where id=$1`, [U.post]))[0].rol, 'estudiante');
  assert.equal((await q(U.post, `select concepto from cargos`))[0].concepto, 'matricula');
  await niega(q(U.post, `select inscribir_materia($1)`, [oferta2]), /matrícula|prerrequisito/);
});

test('chat: solo miembros leen, nombre del autor no se falsifica, canal privado', async () => {
  const [m] = await q(U.ana, `insert into mensajes (conversacion_id,autor_id,cuerpo,autor_nombre) values ($1,$2,'Hola','Rector') returning autor_nombre`, [conv, U.ana]);
  assert.equal(m.autor_nombre, 'ana Prueba');
  assert.equal((await q(U.otra, `select * from mensajes`)).length, 0, 'quien no es miembro no lee');
  await niega(q(U.otra, `insert into mensajes (conversacion_id,autor_id,cuerpo) values ($1,$2,'x')`, [conv, U.otra]), /row-level/);
  await niega(q(U.beto, `insert into mensajes (conversacion_id,autor_id,cuerpo) values ($1,$2,'x')`, [conv, U.ana]), /row-level/);
  assert.equal((await q(U.beto, `select * from mensajes`)).length, 1);
  const [b] = await q(U.beto, `select no_leidos, ultimo_resumen from mis_conversaciones() where id=$1`, [conv]);
  assert.equal(b.no_leidos, 1); assert.equal(b.ultimo_resumen, 'Hola');
  const emitidos = (await db.query(`select topic from realtime.messages`)).rows;
  assert.ok(emitidos.some((x) => x.topic === 'conv:' + conv), 'emite por el canal de la conversación');
  assert.equal((await db.query(`select count(*)::int n from cola_push where conversacion_id=$1`, [conv])).rows[0].n, 1);
});

test('chat directo: estudiante no puede escribir a cualquiera', async () => {
  const c = (await q(U.ana, `select abrir_directa($1) c`, [U.docente]))[0].c;
  assert.equal((await q(U.ana, `select abrir_directa($1) c`, [U.docente]))[0].c, c, 'la misma conversación');
  await niega(q(U.ana, `select abrir_directa($1)`, [U.docente2]));
  await q(U.ana, `select abrir_directa($1)`, [U.admin]);
  assert.equal((await q(U.ana, `select * from buscar_personas('docente2')`)).length, 0);
  assert.equal((await q(U.ana, `select * from buscar_personas('docente')`)).length, 1);
  assert.ok(!Object.keys((await q(U.ana, `select * from buscar_personas('docente')`))[0]).includes('ci'));
});

test('comunicados: filtros de audiencia y permisos', async () => {
  const f = (o) => JSON.stringify(o);
  assert.equal((await q(U.admin, `select contar_audiencia($1) n`, [f({ roles: ['estudiante'] })]))[0].n, 4);
  assert.equal((await q(U.admin, `select contar_audiencia($1) n`, [f({ carreras: [carrera], roles: ['estudiante'] })]))[0].n, 4);
  assert.equal((await q(U.admin, `select contar_audiencia($1) n`, [f({ carreras: [carrera2] })]))[0].n, 0);
  assert.equal((await q(U.docente, `select contar_audiencia($1) n`, [f({ ofertas: [oferta], roles: ['estudiante'] })]))[0].n, 2);
  await niega(q(U.docente, `select contar_audiencia($1)`, [f({ ofertas: [oferta2] })]));
  await niega(q(U.docente, `select contar_audiencia($1)`, [f({ roles: ['estudiante'] })]));
  await niega(q(U.director, `select contar_audiencia($1)`, [f({ carreras: [carrera2] })]));
  await niega(q(U.ana, `select enviar_comunicado('x','y',$1)`, [f({ roles: ['estudiante'] })]));
  const c = (await q(U.admin, `select enviar_comunicado('Aviso','Texto',$1) c`, [f({ roles: ['estudiante'] })]))[0].c;
  assert.equal((await q(U.beto, `select * from mensajes where conversacion_id=$1`, [c])).length, 1);
  await niega(q(U.beto, `insert into mensajes (conversacion_id,autor_id,cuerpo) values ($1,$2,'no')`, [c, U.beto]), /row-level/);
  assert.equal((await q(U.docente, `select * from mensajes where conversacion_id=$1`, [c])).length, 0);
});

test('storage: documentos personales y materiales aislados', async () => {
  const sube = (u, b, n) => q(u, `insert into storage.objects (bucket_id,name) values ($1,$2)`, [b, n]);
  await sube(U.post, 'postulaciones', `${U.post}/ci.jpg`);
  await niega(sube(U.ana, 'postulaciones', `${U.post}/x.jpg`), /row-level/);
  const ver = (u, b) => q(u, `select name from storage.objects where bucket_id=$1`, [b]);
  assert.equal((await ver(U.ana, 'postulaciones')).length, 0);
  assert.equal((await ver(U.admin, 'postulaciones')).length, 1);
  assert.equal((await ver(U.docente, 'postulaciones')).length, 0, 'un docente no ve carnets');
  await sube(U.docente, 'materiales', `${oferta}/clase.pdf`);
  await niega(sube(U.docente2, 'materiales', `${oferta}/x.pdf`), /row-level/);
  await niega(sube(U.ana, 'materiales', `${oferta}/x.pdf`), /row-level/);
  assert.equal((await ver(U.ana, 'materiales')).length, 1);
  assert.equal((await ver(U.otra, 'materiales')).length, 0);
  await sube(U.ana, 'chat', `${conv}/foto.jpg`);
  assert.equal((await ver(U.otra, 'chat')).length, 0);
});

test('administración: solo Sistemas gestiona cuentas de Sistemas', async () => {
  await niega(q(U.admin, `select admin_actualizar_perfil($1,'{"rol":"sistemas"}')`, [U.ana]));
  await niega(q(U.admin, `select admin_actualizar_perfil($1,'{"activo":false}')`, [U.sistemas]));
  await niega(q(U.ana, `select admin_actualizar_perfil($1,'{"rol":"admin"}')`, [U.ana]));
  await q(U.sistemas, `select admin_actualizar_perfil($1,'{"nombres":"Ana"}')`, [U.ana]);
  await q(U.admin, `select admin_actualizar_perfil($1,'{"rol":"docente"}')`, [U.otra]);
  assert.equal((await db.query(`select rol from perfiles where id=$1`, [U.otra])).rows[0].rol, 'docente');
  assert.ok((await q(U.admin, `select * from auditoria where tabla='perfiles'`)).length >= 1, 'queda en auditoría');
  assert.equal((await q(U.ana, `select * from auditoria`)).length, 0);
});

test('usuario desactivado pierde sus permisos', async () => {
  await q(U.sistemas, `select admin_actualizar_perfil($1,'{"activo":false}')`, [U.finanzas]);
  await niega(q(U.finanzas, `select generar_cargos('Y','otro','y',1,current_date)`));
});

test('la cola de push es solo para el trabajador', async () => {
  await assert.rejects(q(U.admin, `select * from cola_push`), /permission/);
  await assert.rejects(q(U.admin, `select tomar_cola_push(1)`), /permission/);
});

/* ─── Preinscripciones desde la landing ─── */
const ficha = (extra = {}) => JSON.stringify({ carrera: 'sistemas', nombres: 'luz', apellidos: 'mamani', celular: '+591 712-34567', correo: 'Luz@Mail.com', origen: { utm_source: 'facebook', hackeo: 'x' }, ...extra });

test('un anónimo se preinscribe, pero no puede leer ni tocar la tabla', async () => {
  const [{ r }] = await q(null, `select preinscribir($1::jsonb) r`, [ficha()]);
  assert.match(r.codigo, /^PRE27-[0-9A-F]{6}$/);
  assert.equal(r.nombres, 'Luz');
  const [f] = (await db.query(`select * from preinscripciones where codigo=$1`, [r.codigo])).rows;
  assert.equal(f.celular, '+59171234567', 'celular normalizado');
  assert.equal(f.correo, 'luz@mail.com');
  assert.deepEqual(f.origen, { utm_source: 'facebook' }, 'solo campos de campaña conocidos');
  await assert.rejects(q(null, `select * from preinscripciones`), /permission/);
  await assert.rejects(q(null, `insert into preinscripciones (codigo,carrera,nombres,apellidos,celular) values ('X','derecho','aa','bb','7777777')`), /permission/);
  await assert.rejects(q(null, `select * from preinscripcion_push`), /permission/);
  await assert.rejects(q(null, `select avisar_preinscritos('hola','x')`), /permission/);
});

test('preinscripción: repetida devuelve la misma ficha, datos inválidos se rechazan, robots no entran', async () => {
  const [{ r: a }] = await q(null, `select preinscribir($1::jsonb) r`, [ficha({ celular: '70000001' })]);
  const [{ r: b }] = await q(null, `select preinscribir($1::jsonb) r`, [ficha({ celular: '70000001' })]);
  assert.equal(a.codigo, b.codigo); assert.equal(b.repetida, true);
  await assert.rejects(q(null, `select preinscribir($1::jsonb)`, [ficha({ celular: 'abc' })]), /formato/);
  await assert.rejects(q(null, `select preinscribir($1::jsonb)`, [ficha({ carrera: 'medicina', celular: '70000002' })]), /formato/);
  await assert.rejects(q(null, `select preinscribir($1::jsonb)`, [ficha({ correo: 'no-es-correo', celular: '70000003' })]), /formato/);
  const antes = (await db.query(`select count(*)::int n from preinscripciones`)).rows[0].n;
  await q(null, `select preinscribir($1::jsonb)`, [ficha({ web: 'http://spam', celular: '70000004' })]);
  assert.equal((await db.query(`select count(*)::int n from preinscripciones`)).rows[0].n, antes, 'la trampa descarta robots');
  const [{ n }] = await q(null, `select conteo_preinscripciones() n`);
  assert.equal(n, antes);
});

test('preinscritos: avisos push y quién ve los datos', async () => {
  const [{ r }] = await q(null, `select preinscribir($1::jsonb) r`, [ficha({ celular: '70000010', carrera: 'derecho' })]);
  await q(null, `select suscribir_preinscripcion($1,'https://push.example/abc','k','a')`, [r.codigo]);
  await assert.rejects(q(null, `select suscribir_preinscripcion('PRE27-ZZZZZZ','https://push.example/x','k','a')`), /no válido/);
  const bienvenida = (await db.query(`select * from cola_push where preinscripcion_id is not null`)).rows;
  assert.equal(bienvenida.length, 1, 'aviso de bienvenida en cola');
  await niega(q(U.ana, `select avisar_preinscritos('Hola','x')`));
  const [{ n }] = await q(U.sistemas, `select avisar_preinscritos('Abrimos inscripciones','Ya puedes postular','derecho') n`);
  assert.equal(n, 1);
  assert.ok((await q(U.sistemas, `select * from preinscripciones`)).length >= 3, 'administración ve las fichas');
  assert.ok((await q(U.director, `select * from preinscripciones`)).length >= 3, 'dirección ve las fichas');
  assert.equal((await q(U.ana, `select * from preinscripciones`)).length, 0, 'un estudiante no ve fichas');
  await q(U.sistemas, `update preinscripciones set estado='contactada' where codigo=$1`, [r.codigo]);
  await niega(q(U.director, `update preinscripciones set estado='descartada' where codigo=$1 returning id`, [r.codigo]).then((x) => { if (!x.length) throw new Error('row-level'); }));
  await assert.rejects(q(U.sistemas, `update preinscripciones set celular='1' where codigo=$1`, [r.codigo]), /permission/);
  const subs = (await db.query(`select * from suscripciones_preinscritos(null,'derecho',0,10)`)).rows;
  assert.equal(subs.length, 1); assert.equal(subs[0].tabla, 'preinscripcion_push');
});
