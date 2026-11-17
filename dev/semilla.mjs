// Datos de ejemplo para la demo. Personas ficticias: ninguna proviene de padrones reales.
import { como, crearUsuario } from './pg.mjs';

export const CLAVE_DEMO = 'demo1234';
const AP = ['Flores', 'Mamani', 'Quispe', 'Rojas', 'Vargas', 'Torrez', 'Gutierrez', 'Cruz', 'Choque', 'Mendoza', 'Arancibia', 'Padilla'];
const NO = ['Maria', 'Jose', 'Lucia', 'Carlos', 'Paola', 'Diego', 'Rosa', 'Miguel', 'Elena', 'Andres', 'Carla', 'Luis'];

export async function sembrar(db, hash) {
  const h = hash(CLAVE_DEMO);
  const U = {};
  const nuevo = async (k, rol, nombres, apellidos) => (U[k] = await crearUsuario(db, k, { rol, nombres, apellidos, clave: h, ci: String(4000000 + Object.keys(U).length * 37), celular: '7' + String(1000000 + Object.keys(U).length * 91) }));
  await nuevo('sistemas', 'sistemas', 'Sonia', 'Administradora');
  await nuevo('admin', 'admin', 'Alberto', 'Central Rojas');
  await nuevo('finanzas', 'finanzas', 'Fabiola', 'Caja Mendoza');
  await nuevo('director', 'director', 'Daniel', 'Directivo Cruz');
  await nuevo('docente', 'docente', 'Laura', 'Salinas Vega');
  await nuevo('docente2', 'docente', 'Ricardo', 'Montes Paz');
  await nuevo('docente3', 'docente', 'Teresa', 'Aguilar Soto');
  await nuevo('estudiante', 'estudiante', 'Ana', 'Perez Flores');
  await nuevo('moroso', 'estudiante', 'Bruno', 'Deudor Quispe');
  for (let i = 0; i < 26; i++) await nuevo(`est${i + 1}`, 'estudiante', NO[i % 12], `${AP[i % 12]} ${AP[(i * 5 + 3) % 12]}`);
  const post = await crearUsuario(db, 'postulante', { nombres: 'Pedro', apellidos: 'Nuevo Choque', clave: h, ci: '9988776', celular: '76543210' });
  U.postulante = post;

  await db.exec('set session_replication_role = default');
  const q = (sql, a = []) => db.query(sql, a).then((r) => r.rows);
  const fa = (await q(`insert into facultades (nombre) values ('Tecnología'),('Derecho'),('Contaduría') returning id`)).map((x) => x.id);
  const C = {};
  for (const [cod, nombre, mod, f, dir] of [['SIS', 'Ingeniería de Sistemas', 'semestral', 0, U.director], ['DER', 'Derecho', 'anual', 1, null], ['DIP', 'Diplomado en Educación Superior', 'modular', 2, null]]) {
    C[cod] = (await q('insert into carreras (codigo,nombre,modalidad,facultad_id,director_id) values ($1,$2,$3,$4,$5) returning id', [cod, nombre, mod, fa[f], dir]))[0].id;
  }
  const M = {};
  for (const [c, s, n, nv] of [['SIS', 'SIS101', 'Introducción a la Programación', 1], ['SIS', 'MAT101', 'Cálculo I', 1], ['SIS', 'SIS102', 'Bases de Datos', 2], ['SIS', 'SIS201', 'Redes de Computadoras', 3], ['DER', 'DER100', 'Derecho Constitucional', 1], ['DIP', 'DIP01', 'Didáctica Universitaria', 1], ['DIP', 'DIP02', 'Evaluación del Aprendizaje', 1]]) {
    M[s] = (await q('insert into materias (carrera_id,sigla,nombre,nivel) values ($1,$2,$3,$4) returning id', [C[c], s, n, nv]))[0].id;
  }
  await q('insert into prerrequisitos values ($1,$2)', [M.SIS102, M.SIS101]);
  const per = (n, mod, ini, fin) => q(`insert into periodos (nombre,modalidad,inicio,fin,inscripcion_desde,inscripcion_hasta) values ($1,$2,current_date+$3::int,current_date+$4::int,current_date-5,current_date+20) returning id`, [n, mod, ini, fin]).then((r) => r[0].id);
  const pSem = await per('2026 Segundo Semestre', 'semestral', -60, 60);
  const pAnual = await per('Gestión 2026', 'anual', -200, 100);
  const pMod = await per('Módulo Noviembre 2026', 'modular', -5, 25);
  const pPas = await q(`insert into periodos (nombre,modalidad,inicio,fin,inscripcion_desde,inscripcion_hasta) values ('2026 Primer Semestre','semestral',current_date-240,current_date-120,current_date-250,current_date-235) returning id`).then((r) => r[0].id);
  const O = {};
  const of = async (k, m, p, d, cupo = 40, par = 'A') => (O[k] = (await q('insert into ofertas (materia_id,periodo_id,docente_id,cupo,paralelo,enlace_clase) values ($1,$2,$3,$4,$5,$6) returning id', [m, p, d, cupo, par, 'https://meet.google.com/demo-usfx']))[0].id);
  await of('prog', M.SIS101, pSem, U.docente);
  await of('calc', M.MAT101, pSem, U.docente2);
  await of('redes', M.SIS201, pSem, U.docente3);
  await of('bd', M.SIS102, pSem, U.docente, 30, 'B');
  await of('der', M.DER100, pAnual, U.docente2);
  await of('dip', M.DIP01, pMod, U.docente3);
  await of('prog0', M.SIS101, pPas, U.docente, 40, 'Z');
  for (const [o, d, i, f] of [['prog', 1, '19:00', '21:00'], ['prog', 3, '19:00', '21:00'], ['calc', 2, '19:00', '21:00'], ['calc', 4, '19:00', '21:00'], ['redes', 5, '19:00', '21:00'], ['bd', 6, '09:00', '11:00']]) {
    await q('insert into horarios (oferta_id,dia,inicio,fin) values ($1,$2,$3,$4)', [O[o], d, i, f]);
  }
  const ests = ['estudiante', 'moroso', ...Array.from({ length: 26 }, (_, i) => `est${i + 1}`)];
  for (const k of ests) {
    await q(`insert into estudiantes (id,codigo,carrera_id) values ($1, app.nuevo_codigo(), $2)`, [U[k], C.SIS]);
  }
  await q('insert into docentes (id,titulo,especialidad,biografia) values ($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)', [U.docente, 'M.Sc.', 'Ingeniería de Software', 'Docente de programación con experiencia en sistemas universitarios.', U.docente2, 'Lic.', 'Matemática', 'Docente de ciencias básicas.', U.docente3, 'Ing.', 'Redes y Telecomunicaciones', 'Docente de redes y seguridad.']);
  await q(`insert into cv_items (docente_id,tipo,titulo,institucion,desde) values ($1,'formacion','Maestría en Ingeniería de Software','USFX','2018-02-01'),($1,'experiencia','Docente titular','USFX','2019-02-01')`, [U.docente]);

  // Inscripciones como los propios estudiantes (usa la regla real).
  for (const k of ests) {
    await como(db, U[k], (tx) => tx.query('select inscribir_materia($1)', [O.prog]));
    await como(db, U[k], (tx) => tx.query('select inscribir_materia($1)', [O.calc]));
  }
  // Una materia pasada y cerrada para el kardex.
  await como(db, U.estudiante, (tx) => tx.query(`insert into inscripciones (estudiante_id,oferta_id) select $1,$2`, [U.estudiante, O.prog0])).catch(() => null);
  await q('insert into inscripciones (estudiante_id,oferta_id) values ($1,$3),($2,$3)', [U.estudiante, U.moroso, O.prog0]);
  await q('update ofertas set inscritos=2 where id=$1', [O.prog0]);
  const ev0 = (await como(db, U.docente, (tx) => tx.query(`insert into evaluaciones (oferta_id,nombre,ponderacion,publicada) values ($1,'Examen final',100,true) returning id`, [O.prog0]))).rows[0].id;
  await como(db, U.docente, (tx) => tx.query('select guardar_notas($1,$2)', [ev0, JSON.stringify([{ estudiante_id: U.estudiante, nota: 87 }, { estudiante_id: U.moroso, nota: 62 }])]));
  await como(db, U.docente, (tx) => tx.query('select cerrar_acta($1)', [O.prog0]));
  // Notas en curso.
  const ev1 = (await como(db, U.docente, (tx) => tx.query(`insert into evaluaciones (oferta_id,nombre,ponderacion,publicada,orden) values ($1,'Primer parcial',30,true,1) returning id`, [O.prog]))).rows[0].id;
  await como(db, U.docente, (tx) => tx.query(`insert into evaluaciones (oferta_id,nombre,ponderacion,orden) values ($1,'Segundo parcial',30,2),($1,'Examen final',40,3)`, [O.prog]));
  await como(db, U.docente, (tx) => tx.query('select guardar_notas($1,$2)', [ev1, JSON.stringify(ests.map((k, i) => ({ estudiante_id: U[k], nota: 45 + ((i * 7) % 50) })))]));
  // Asistencia de días pasados.
  for (const d of [12, 10, 7]) {
    await como(db, U.docente, (tx) => tx.query(`select pasar_asistencia($1, current_date-$2::int, $3, $4)`, [O.prog, d, 'Clase ' + d, JSON.stringify(ests.map((k, i) => ({ estudiante_id: U[k], estado: (i + d) % 9 === 0 ? 'falta' : (i + d) % 7 === 0 ? 'atraso' : 'presente' })))]));
  }
  // Contenido.
  const t1 = (await como(db, U.docente, (tx) => tx.query(`insert into temas (oferta_id,orden,titulo,descripcion) values ($1,1,'Fundamentos de programación','Variables, tipos de datos y control de flujo.') returning id`, [O.prog]))).rows[0].id;
  await como(db, U.docente, (tx) => tx.query(`insert into temas (oferta_id,orden,titulo) values ($1,2,'Estructuras de datos')`, [O.prog]));
  await como(db, U.docente, (tx) => tx.query(`insert into materiales (oferta_id,tema_id,tipo,titulo,url) values ($1,$2,'video','Clase grabada: variables','https://www.youtube.com/watch?v=demo')`, [O.prog, t1]));
  // Finanzas: el estudiante al día; el moroso con un cargo vencido.
  await q(`insert into cargos (estudiante_id,clave,concepto,descripcion,monto,vence,estado) values ($1,'MATR-2026','matricula','Matrícula 2026',350,current_date-90,'pagado'),($2,'MATR-2026','matricula','Matrícula 2026',350,current_date-90,'pagado')`, [U.estudiante, U.moroso]);
  await q(`insert into cargos (estudiante_id,clave,concepto,descripcion,monto,vence) values ($1,'MENS-OCT','mensualidad','Mensualidad de octubre',400,current_date-10),($2,'MENS-NOV','mensualidad','Mensualidad de noviembre',400,current_date+15)`, [U.moroso, U.estudiante]);
  // Chat.
  const conv = (await q('select id from conversaciones where oferta_id=$1', [O.prog]))[0].id;
  await como(db, U.docente, (tx) => tx.query(`insert into mensajes (conversacion_id,autor_id,cuerpo) values ($1,$2,'Buenas noches. La clase de hoy empieza a las 19:00, el enlace está en la materia.')`, [conv, U.docente]));
  await como(db, U.estudiante, (tx) => tx.query(`insert into mensajes (conversacion_id,autor_id,cuerpo) values ($1,$2,'Gracias, licenciada. ¿El primer parcial entra hasta el tema 1?')`, [conv, U.estudiante]));
  await como(db, U.admin, (tx) => tx.query(`select enviar_comunicado('Inicio del segundo semestre','Bienvenidos a la gestión. Revisen sus horarios y pagos en la plataforma.', $1)`, [JSON.stringify({ roles: ['estudiante', 'docente'] })]));
  await q('delete from notificaciones where titulo = $1', ['Notas finales publicadas']);
  return { U, O, conv };
}
