# USFX Virtual

Plataforma de universidad virtual instalable en celular (PWA), con React y Supabase.
Una landing de captación (preinscripción en 3 pasos con avisos push) y cuatro apps instalables por separado: **Campus**, **Chat**, **Notas** y **Matrícula**.

## Probar sin crear cuentas

```bash
npm install
npm run demo
```

Abre <http://localhost:4173>. Clave de todos los usuarios: `demo1234`.

| Usuario | Qué probar |
|---|---|
| `estudiante` | Materias, notas, kardex, asistencia, inscripción, pagos, chat |
| `moroso` | Notas bloqueadas por deuda; reportar un pago |
| `postulante` | Postulación con documentos y declaración jurada |
| `docente` | Llamar lista, planilla de notas, materiales, hoja de vida |
| `director` | Horarios y comunicados de su carrera |
| `finanzas` | Revisar pagos, generar cargos, deudas |
| `admin` | Usuarios, carreras, horarios, postulaciones, preinscritos de la landing, reportes, comunicados |
| `sistemas` | Todo lo anterior, configuración y auditoría |

Los datos de la demo son ficticios y viven en memoria: se pierden al cerrar.
El tiempo real y los push no corren en la demo; el chat funciona por sondeo.

## Pruebas

```bash
npm run test:db     # 19 pruebas de seguridad y reglas contra las migraciones reales, con RLS
npm run test:carga  # mide las consultas con 20.000 estudiantes
npm run test:e2e    # recorre todos los roles en un navegador real (requiere Edge y haber compilado la demo)
```

## Documentos

- [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md): cómo publicar paso a paso.
- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md): decisiones de diseño, capacidad y costos.

## Estructura

```
index.html            Landing
campus|chat|notas|matricula/   Entrada de cada app instalable (generadas por scripts/generar-apps.mjs)
src/                  Interfaz en React
supabase/migrations/  Base de datos, permisos y reglas de negocio
supabase/functions/   Crear usuarios y enviar notificaciones push
dev/                  Servidor de demo y pruebas (no se publica)
```
