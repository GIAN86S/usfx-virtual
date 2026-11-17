// Contenido oficial de la USFX Virtual (transcrito de uvirtual.usfx.bo y de los planes de estudio publicados).

export interface Carrera {
  id: 'derecho' | 'psicologia' | 'gerencia' | 'sistemas' | 'contaduria' | 'filosofia';
  nombre: string;
  corto: string;
  facultad: string;
  color: string;
  img: string;
  campus: string;
  resumen: string;
  perfil: string[];
  destacados: string[];
  plan: [string, string][][]; // [curso][materia] = [sigla, nombre]
}

const p = (txt: string): [string, string][][] =>
  txt.trim().split(/\n\s*\n/).map((curso) =>
    curso.trim().split('\n').map((l) => { const [s, ...n] = l.trim().split(' | '); return [s, n.join(' | ')] as [string, string]; }));

export const CARRERAS: Carrera[] = [
  {
    id: 'derecho', nombre: 'Derecho', corto: 'Derecho', facultad: 'Derecho, Ciencias Políticas y Sociales', color: '#1E3A6E',
    img: 'c-derecho', campus: 'https://campus.usfx.bo/derecho',
    resumen: 'Abogados integrales con sentido humanista y compromiso social, capacitados en el manejo idóneo del derecho plural, la investigación jurídica y la práctica en todas sus modalidades.',
    perfil: ['Práctica forense civil, penal y de procedimientos especiales', 'Derecho plural y derechos de los pueblos indígena originario campesinos', 'Investigación y producción intelectual jurídica'],
    destacados: ['5 años', '50 materias', 'Práctica forense'],
    plan: p(`
CJS 100 | Introducción al Derecho
CJS 102 | Historia del Derecho y Derecho Romano
CJS 104 | Criminología
CJS 110 | Ciencia Política (Teoría del Estado)
CJS 200 | Derecho Civil I (Parte General)
CSO 100 | Sociología General y Materialismo Histórico
ECO 100 | Economía Política
QUE 100 | Quechua
CJS 120 | Medios Alternativos de Solución de Conflictos
CJS 105 | Derechos Humanos

CJS 106 | Metodología de la Investigación Científica
CJS 201 | Derecho Civil II
CJS 206 | Derecho Constitucional
CJS 208 | Derecho Penal I (Parte General)
CJS 227 | Derecho Agrario
CSO 208 | Sociología Boliviana e Historia Crítica Boliviana
INF 100 | Informática Jurídica
QUE 101 | Quechua II
CJS 246 | Derecho Ambiental y su Procedimiento
CJS 248 | Pluralismo Jurídico y Derechos de los Pueblos Indígena Originario Campesino

CJS 202 | Derecho Civil III
CJS 209 | Derecho Penal II
CJS 210 | Medicina Legal
CJS 211 | Seminario I
CJS 212 | Organización Judicial y Derecho Procesal
CJS 220 | Derecho Administrativo y su Procedimiento
CJS 225 | Derecho del Trabajo y su Procedimiento
CJS 228 | Derecho Minero y su Procedimiento
CJS 245 | Derecho de la Energía y su Procedimiento
CJS 253 | Derecho Constitucional Orgánico

CJS 203 | Derecho Civil IV
CJS 204 | Derecho de Familia y del Menor
CJS 213 | Derecho Procesal Civil y Procedimiento Civil
CJS 214 | Derecho Procesal Penal
CJS 219 | Seminario II
CJS 223 | Derecho Comercial
CJS 231 | Derecho Internacional e Instituciones Jurídicas Internacionales
CSO 243 | Sociología Jurídica
CJS 248 | Derecho Regulatorio Autonómico
IAJ 100 | Interpretación y Argumentación Jurídica

CJS 205 | Derecho Civil V
CJS 215 | Ética y Oratoria Forense
CJS 216 | Práctica Laboral Forense Civil
CJS 218 | Práctica Laboral Forense Penal
CJS 221 | Derecho Financiero y Tributario
CJS 234 | Derecho Internacional Privado
CJS 237 | Filosofía del Derecho
CJS 247 | Práctica Laboral de Procedimientos Especiales
CJS 304 | Derecho de la Seguridad Social
CJS 226 | Modalidad de Graduación: Tesis, Proyecto de Grado, Trabajo Dirigido o Internado`),
  },
  {
    id: 'psicologia', nombre: 'Psicología', corto: 'Psicología', facultad: 'Humanidades', color: '#5A3A86',
    img: 'c-psicologia', campus: 'https://campus.usfx.bo/psicologia',
    resumen: 'Psicólogos competitivos, críticos y comprometidos con el bienestar y la salud mental de la sociedad, con base científica, tecnológica y humanista.',
    perfil: ['Psicodiagnóstico e intervención clínica, psicoeducativa y psicosocial', 'Enfoques psicoanalítico, cognitivo-conductual, humanista y sistémico', 'Psicología organizacional y jurídica forense'],
    destacados: ['5 años', 'Internado', 'Psicología clínica'],
    plan: p(`
ANT 108 | Antropología Universal y Boliviana
FIE 105 | Filosofía y Epistemología de la Psicología
PSE 106 | Psicoestadística
PSF 104 | Psicofisiología y Neuropsicología
PSI 101 | Fundamentos de Psicología
PSI 102 | Psicología del Desarrollo Humano
PSI 103 | Teorías de la Personalidad
SOC 107 | Sociología Universal y Boliviana

MET 208 | Metodología de la Investigación Científica en Psicología
PSI 201 | Psicoanálisis I
PSI 202 | Psicología Cognitivo Conductual I
PSI 203 | Psicología Educativa
PSI 204 | Psicología Social y Comunitaria
PSI 205 | Psicolingüística
PSI 206 | Técnicas Psicométricas
PSI 207 | Psicopatología

PSI 301 | Psicoanálisis II
PSI 302 | Psicología Cognitivo Conductual II
PSI 303 | Educación Especial y Orientación Psicoeducativa
PSI 304 | Psicología Organizacional y Publicitaria
PSI 305 | Psicología Humanística Existencial I
PSI 306 | Psicología Clínica
PSI 307 | Técnicas Proyectivas

PSI 401 | Psicodiagnóstico e Intervención Psicoeducativa
PSI 402 | Psicodiagnóstico e Intervención Clínica
PSI 403 | Psicodiagnóstico e Intervención Psicosocial
PSI 404 | Psicología Sistémica
PSI 405 | Psicología Humanística Existencial II y Psicología del Desarrollo Personal
PSI 406 | Psicología Jurídica Forense

INT 501 | Internado
PDG 501 | Proyecto de Grado
TES 501 | Tesis`),
  },
  {
    id: 'gerencia', nombre: 'Gerencia y Administración Pública', corto: 'Gerencia Pública', facultad: 'Ciencias Económicas y Empresariales', color: '#9A5518',
    img: 'c-gerencia', campus: 'https://campus.usfx.bo/gerenciayadmpublica',
    resumen: 'Carrera acreditada y pionera en el sistema universitario boliviano. Forma líderes capaces de transformar y gerenciar las instituciones y empresas públicas del país.',
    perfil: ['Gestión pública, presupuestos y control de gestión', 'Planificación estratégica, proyectos y políticas públicas', 'Finanzas públicas, gestión tributaria y talento humano'],
    destacados: ['4 años', 'Acreditada', 'Políticas públicas'],
    plan: p(`
GBC 106 | Microeconomía
GBJ 108 | Sociología
GBM 102 | Análisis Matemático
GBO 107 | Psicología
GBT 104 | Contabilidad Básica
GSJ 103 | Ciencia Política y Teoría del Estado
GSO 105 | Informática para la Gerencia y Administración Pública
GST 101 | Introducción a la Gerencia y Administración Pública

GBI 213 | Métodos y Técnicas de Investigación
GBM 210 | Estadística General
GBM 212 | Matemática Financiera
GPF 217 | Gestión Autonómica Territorial
GPT 216 | Administración de Bienes y Compras Públicas
GSC 211 | Macroeconomía
GSF 214 | Programación de Operaciones y Gestión Presupuestaria
GSJ 209 | Derecho Constitucional
GSJ 215 | Sociología Boliviana

GBI 325 | Seminario de Grado I
GBM 322 | Estadística Matemática
GPF 320 | Planificación para el Desarrollo Territorial y Sectorial
GPF 323 | Gerencia Pública Empresarial y Modelos de Gestión
GPJ 318 | Marketing Político y Empresarial
GPT 319 | Gestión del Talento Humano en la Administración Pública
GPT 324 | Diseño, Formulación y Preparación de Proyectos
GSF 326 | Gestión Ambiental
GSJ 321 | Derecho Administrativo
PRA 300 | Práctica Laboral

GPF 432 | Gestión Pública y Control de Gestión
GPJ 429 | Planificación Estratégica, Operativa Institucional y Empresarial
GPJ 433 | Políticas Públicas
GPT 428 | Administración y Evaluación de Proyectos
GPT 430 | Finanzas Públicas y Gestión Tributaria
GSF 431 | Análisis de la Realidad Nacional
GSI 434 | Seminario de Grado II
GST 427 | Contabilidad Gubernamental`),
  },
  {
    id: 'sistemas', nombre: 'Ingeniería de Sistemas', corto: 'Sistemas', facultad: 'Ciencia y Tecnología', color: '#1D6489',
    img: 'c-sistemas', campus: 'https://campus.usfx.bo/sistemas',
    resumen: 'Ingenieros con enfoque sistémico e integrador, capaces de planificar, desarrollar, optimizar y controlar sistemas socio-técnicos con tecnologías de la información.',
    perfil: ['Programación, bases de datos, redes e infraestructura', 'Ingeniería de software, desarrollo web e inteligencia artificial', 'Gestión estratégica de TI, auditoría y proyectos'],
    destacados: ['5 años', 'Inteligencia artificial', 'Desarrollo web'],
    plan: p(`
FIS 100 | Física Básica I
MAT 100 | Álgebra I
MAT 101 | Cálculo I
SHC 100 | Técnicas de Estudio y Desarrollo de Habilidades Comunicativas
SIS 100 | Programación Básica
ADM 100 | Sistemas Administrativos y Económicos
FIS 200 | Física Básica III
MAT 102 | Cálculo II
MAT 103 | Álgebra II
SIS 101 | Programación Intermedia
SIS 308 | Teoría de Sistemas

GEN 410 | Metodología de la Investigación
MAT 207 | Ecuaciones Diferenciales
MAT 280 | Probabilidad y Estadística
SIS 204 | Estructura de Datos
SIS 302 | Base de Datos I
SIS 457 | Programación Avanzada
MAT 205 | Métodos Numéricos
SIS 107 | Arquitectura de Computadoras
SIS 125 | Ingeniería de Requerimientos
SIS 251 | Redes de Datos I
SIS 304 | Base de Datos II
SIS 370 | Modelado de Procesos

SIS 145 | Métodos y Diseño del Trabajo
SIS 209 | Investigación Operativa I
SIS 252 | Redes de Datos II
SIS 301 | Análisis y Diseño de Sistemas
SIS 313 | Infraestructura, Plataformas Tecnológicas y Redes
SIS 315 | Sistemas de Gestión Empresarial
IND 210 | Ingeniería Económica
SIS 256 | Tecnologías y Desarrollo Web
SIS 303 | Diseño Organizacional y RRHH
SIS 310 | Sistemas y Procesos de Producción
SIS 324 | Ingeniería de Software
SIS 386 | Investigación Operativa II

SIS 311 | Simulación de Sistemas
SIS 312 | Análisis de Estados Financieros
SIS 320 | Sistemas y Dirección de Operaciones
SIS 380 | Dinámica de Sistemas
SIS 391 | Desarrollo e Integración de Sistemas
SIS 420 | Inteligencia Artificial I
IND 217 | Preparación, Gestión y Evaluación de Proyectos
SHC 131 | Taller de Especialidad
SIS 316 | Auditoría de Sistemas
SIS 395 | Reingeniería de Sistemas
SIS 428 | Gestión Estratégica de TI y Redes Corporativas

SHC 160 | Ética, Ingeniería Legal y Emprendedurismo
SHC 170 | Práctica Laboral
SHC 180 | Taller de Grado
SHC 190 | Trabajo de Titulación`),
  },
  {
    id: 'contaduria', nombre: 'Contaduría Pública', corto: 'Contaduría', facultad: 'Contaduría Pública y Ciencias Financieras', color: '#A12B2B',
    img: 'c-contaduria', campus: 'https://campus.usfx.bo/contaduria',
    resumen: 'Contadores públicos íntegros y emprendedores, capaces de diseñar, implementar, evaluar y certificar sistemas de información contable confiables y actualizados.',
    perfil: ['Contabilidad superior, de costos y de entidades financieras', 'Auditoría financiera, gubernamental, impositiva y de sistemas', 'Tributación, finanzas y control de gestión'],
    destacados: ['4 años', 'Auditoría', 'Tributación'],
    plan: p(`
CPA 100 | Contabilidad Básica
ECO 100 | Microeconomía
MAT 100 | Matemática
CPA 110 | Tributación
CJS 100 | Legislación Laboral
MAT 110 | Estadística
ADM 100 | Administración General y Pública
CJS 110 | Introducción al Derecho y Derecho Comercial

CPA 200 | Contabilidad Intermedia
CPA 210 | Contabilidad de Entidades Financieras y Seguros
ECO 200 | Macroeconomía
ECO 210 | Comercio Exterior
ADM 200 | Administración de Recursos Humanos
CJS 200 | Métodos y Técnicas de Investigación
CPA 220 | Contabilidad Agropecuaria y de Empresas Extractivas

CPA 300 | Contabilidad Superior
CPA 310 | Contabilidad de Costos
CPA 330 | Análisis y Administración Financiera
CPA 320 | Presupuestos y Contabilidad Integrada
MAT 300 | Matemática Financiera
CPA 340 | Informática Contable
CPA 350 | Finanzas y Control de Gestión
CPA 360 | Diseño y Gestión de Negocios, Emprendedurismo

CPA 400 | Gabinete de Auditoría Financiera
CPA 410 | Gabinete de Auditoría Gubernamental
CPA 420 | Gabinete de Auditoría de Gestión
CPA 430 | Gabinete de Auditoría Impositiva
CPA 440 | Gabinete de Auditoría de Sistemas
INV 400 | Seminario de Grado
ECO 400 | Seguimiento, Control y Evaluación de Proyectos
CPA 350 | Práctica Laboral`), // la sigla repite la de «Finanzas y Control de Gestión» en el plan oficial
  },
  {
    id: 'filosofia', nombre: 'Filosofía', corto: 'Filosofía', facultad: 'Humanidades', color: '#7A1F33',
    img: 'c-filosofia', campus: 'https://campus.usfx.bo/filosofia',
    resumen: 'Pensadores críticos para un mundo en cambio. Un claustro con catedráticos visitantes de Brasil, Argentina y Alemania, y una tesis que se presenta como artículo indexado.',
    perfil: ['Pensamiento conceptual, científico y crítico, directo a las fuentes', 'Lógica, ética, estética, metafísica y filosofía de la IA', 'Comunicación rigurosa e investigación filosófica'],
    destacados: ['5 años', 'Claustro internacional', 'Tesis indexada'],
    plan: p(`
FIL 101 | Filosofía de los Presocráticos y Platón
FIL 102 | Ética I (Grecolatina)
FIL 103 | Análisis de Textos Filosóficos en Latín y/o Griego
ART 104 | Estética I (Mímesis Clásica y Ars Medieval)
MET 105 | Epistemología General de las Ciencias Humanas
LOG 106 | Filosofía de la Lógica: Primeras Aproximaciones
FIL 107 | Filosofía Cristiana: Patrística
ANT 108 | Filosofía de los Pueblos Indígenas: Cosmovisión

FIL 201 | Filosofía Aristotélica
FIL 202 | Ética II (Ética Medieval y Teología Moral)
FIL 203 | Filosofía Clásica Romana
ART 204 | Estética II (Renacimiento, Manierismo y Barroco)
MET 205 | Filosofía de la Ciencia
LOG 206 | Lógica Modal y Probabilismo
FIL 207 | Filosofía Medieval y su Recepción en Charcas I
ANT 208 | Filosofía de los Pueblos Indígenas: Conocimiento y Ética

FIL 301 | Recepción Medieval de la Filosofía Antigua
FIL 302 | Ética III (Ética Moderna y Filosofía Moral Moderna)
FIL 303 | Metafísica Clásica y Teología Especulativa
ART 304 | Estética III (Arte Moderno y Contemporáneo)
MET 305 | Filosofía de la Psicología
LOG 306 | Lógicas Contemporáneas
FIL 307 | Filosofía Medieval y su Recepción en Charcas II
ANT 309 | Antropología Filosófica

FIL 401 | Filosofía Iberoamericana y su Recepción
FIL 402 | Filosofía Política Moderna y Contemporánea
FIL 403 | Metafísica Analítica
ART 404 | Filosofía del Arte
MET 405 | Filosofía de la Psiquiatría
LOG 406 | Filosofía de la Tecnología e Inteligencia Artificial

TES 501 | Tesis (Artículo Indexado)`),
  },
];

export const DOCENTES = [
  { img: 'd-castro', nombre: 'Dr. Mario Castro', rol: 'Director de Carrera · Filosofía', url: 'https://si.usfx.bo/planestudio/ctrl/hojaVida/hojaVida.php?idPersona=3390337&idCarrera=40&idf=HE&idMateria=ANT204&numeroPlanEstudios=3' },
  { img: 'd-ballerstaedt', nombre: 'Dra. Ana Cecilia Ballerstaedt', rol: 'Supervisora Académica · Filosofía', url: 'https://www.ramonacultural.com/autores_externos/ana-cecilia-ballerstaedt/' },
  { img: 'd-pich', nombre: 'Dr. Roberto Hofmeister Pich', rol: 'Catedrático visitante · Brasil', url: 'http://lattes.cnpq.br/1645884955155770' },
  { img: 'd-schulz', nombre: 'Dr. Michael Schulz', rol: 'Catedrático visitante · Universidad de Bonn, Alemania', url: 'https://www.ptr.uni-bonn.de/mitarbeiter-innen/prof-dr-michael-schulzoenseite' },
  { img: 'd-ferreiro', nombre: 'Dr. Héctor Ferreiro', rol: 'Catedrático visitante · CONICET, Argentina', url: 'https://bicyt.conicet.gov.ar/fichas/p/hector-alberto-ferreiro' },
  { img: 'd-costa', nombre: 'Dr. Alexandre Costa Leite', rol: 'Catedrático visitante · Brasil', url: 'http://lattes.cnpq.br/1675265519515703' },
  { img: 'd-culleton', nombre: 'Dr. Alfredo Culleton', rol: 'Catedrático visitante · Brasil', url: 'http://lattes.cnpq.br/1692292875405642' },
  { img: 'd-assalone', nombre: 'Dr. Eduardo Assalone', rol: 'Catedrático visitante · CONICET, Argentina', url: 'https://bicyt.conicet.gov.ar/fichas/p/eduardo-francisco-assalone' },
  { img: 'd-boeira', nombre: 'Dr. Marcus Rycembel Boeira', rol: 'Catedrático visitante · Brasil', url: 'http://lattes.cnpq.br/2064957445315362' },
  { img: 'd-vega', nombre: 'Dra. Thaís Vega', rol: 'Catedrática visitante', url: 'https://orcid.org/0009-0006-1698-1415' },
  { img: 'd-kurle', nombre: 'Dr. Adriano Kurle', rol: 'Catedrático visitante · Brasil', url: 'http://lattes.cnpq.br/7802838473979757' },
  { img: 'd-sabbi', nombre: 'Dr. Eduardo Sabbi', rol: 'Catedrático visitante · Brasil', url: 'https://www.escavador.com/sobre/2490179/eduardo-hostyn-sabbi' },
  { img: 'd-eichmann', nombre: 'Dr. Andrés Eichmann', rol: 'Catedrático visitante · Bolivia', url: 'https://umsa-bo.academia.edu/Andr%C3%A9sEichmann/CurriculumVitae' },
  { img: 'd-tinajeros', nombre: 'Dr. Gonzalo Tinajeros Arce', rol: 'Catedrático visitante', url: 'http://lattes.cnpq.br/0227334995209083' },
];

export const TUTORIALES = [
  { id: 'ui1Q2RzCopE', img: 'postulacion.webp', titulo: 'Postulación y registro', paso: 'Paso 1' },
  { id: 'JpDnHoAyuYs', img: 'subir-documentos.webp', titulo: 'Subir documentos', paso: 'Paso 2' },
  { id: '_7LktxfayM0', img: 'examen-admision.jpg', titulo: 'Examen de admisión', paso: 'Paso 3' },
  { id: 'Qf51cGgRrRo', img: 'pago-matricula.jpg', titulo: 'Pago de matrícula', paso: 'Paso 4' },
  { id: 'Qg5QrRJYw7s', img: 'admision-profesionales.webp', titulo: 'Admisión para profesionales', paso: 'Profesionales' },
];
