# Documento comparativo — Red Clínica multi-motor (Entrega II)

| Institución | Motor | Base / proyecto | Adaptador |
|---|---|---|---|
| Hospital General (i1) | **PostgreSQL 16** | `hospital_general` | `server/src/adapters/postgres/PostgresProvider.ts` + `adapters/sql/SqlRepositories.ts` |
| Clínica Odontológica (i2) | **MySQL 8.4** | `clinica_odontologica` | `server/src/adapters/mysql/MySqlProvider.ts` + `adapters/sql/SqlRepositories.ts` |
| Laboratorio Clínico (i3) | **MongoDB 7** (replica set `rs0`) | `laboratorio_clinico` | `server/src/adapters/mongo/MongoProvider.ts` |
| Centro Médico Pediátrico (i4) | **Firestore** (Firebase Emulator) | `demo-red-clinica` | `server/src/adapters/firestore/FirestoreProvider.ts` |
| Directorio de usuarios (todas) | **PostgreSQL 16** | `red_central` | `server/src/adapters/central/PostgresCentralDirectory.ts` |

Arquitectura: los casos de uso (`server/src/application`) dependen solo de los puertos (`server/src/ports`). `DatabaseAdapterFactory` resuelve los adaptadores del motor de la institución que viene en el JWT. La misma suite de contrato (`server/test/contract.ts`) se ejecuta contra los cuatro motores: es la verificación de que los adaptadores son intercambiables (Liskov).

---

## Eje A — Decisiones de modelado

### PostgreSQL y MySQL (relacional)
- **Mismo esquema maestro en 3FN** (`server/db/postgres/01_schema.sql`, `server/db/mysql/01_schema.sql`): PK subrogadas (`serial` / `AUTO_INCREMENT`), FKs `ON DELETE RESTRICT` y `CHECK` en cada dominio enumerado (estados de paciente, consulta y examen; sexo; tipo de sangre; tipo de diagnóstico; severidad).
- Correcciones de la Entrega I (INSTRUCCIONES §2):
  - `receta` es la tabla asociativa `tratamiento ↔ medicamento` con la posología.
  - `vacuna` (catálogo) está separada de `esquema_vacunacion`.
  - `paciente` tiene `estado`, `id_institucion` y `dpi_cui UNIQUE`.
  - `consulta` tiene `estado`, `id_institucion`, `id_medico` e `id_paciente`.
  - Los signos pediátricos van en `registro_crecimiento` y los de adultos en `notas_clinicas`.
- La cadena **diagnóstico → tratamiento → receta** evita la dependencia transitiva consulta → farmacoterapia.
- **Respaldo físico de la disponibilidad del médico (OP-CON-01)**: la regla vive en el dominio, y cada motor tiene una red de seguridad:
  - PostgreSQL: índice único **parcial** `(id_medico, fecha_hora) WHERE estado <> 'cancelada'`.
  - MySQL no tiene índices parciales: columna generada `horario_vigente = IF(estado<>'cancelada',1,NULL)` dentro de un `UNIQUE`, aprovechando que los `NULL` no colisionan.
- Los ids se exponen como texto. Los adaptadores convierten a entero y un id no numérico se trata como inexistente.

### MongoDB (documental)
- Patrón híbrido (ver `docs/modelo-nosql.md`):
  - **Embebe** lo acotado y de ciclo de vida acoplado: alergias y contactos en el paciente; diagnósticos, tratamientos y recetas en la consulta.
  - **Referencia** lo que crece sin límite (consultas, exámenes) y los catálogos.
- `$jsonSchema` estricto en todas las colecciones. Los `resultados[]` de laboratorio solo exigen `parametro` y `valor_obtenido`, para admitir estructuras heterogéneas (p. ej. el campo extra `unidad` del perfil lipídico sembrado) sin cambiar ningún DDL. Es la razón de fondo para elegir MongoDB en el laboratorio.

### Firestore (colección/documento)
- Lecturas jerárquicas: el paciente embebe alergias y contactos. **Subcolecciones** `pacientes/{id}/crecimiento` y `pacientes/{id}/vacunas` para series temporales que se leen solas (curvas de crecimiento, esquema de vacunación).
- **Desnormalización selectiva** para pagar menos lecturas:
  - `nombre_medico` en cada consulta;
  - la etiqueta del medicamento sellada en cada receta;
  - `nombre_tipo`, `solicitado_por` e `id_institucion` en cada examen.
- Restricciones que Firestore no ofrece, resueltas con patrones del propio motor:
  - unicidad mediante documentos centinela (`pacientes_dpi/{dpi}`, `pacientes_correo/{correo}`);
  - búsqueda por diagnóstico embebido con el arreglo índice `ids_diagnosticos` + `array-contains`.

### Mapeo frontend ⇄ base de datos (en los mappers, no en la UI)
| Contrato (`src/types`) | Dominio | SQL | Mongo / Firestore |
|---|---|---|---|
| `Patient.cui` "2784 10293 0101" | `dpi` (13 dígitos) | `dpi_cui` | `dpi_cui` |
| `institutionId` "i1" | `institutionId: 1` | `id_institucion` | `id_institucion` |
| `Appointment {date, time}` | `scheduledAt` "AAAA-MM-DDTHH:mm" | `consulta.fecha_hora` | `fecha_hora` (Date/Timestamp) |
| `Consultation.status 'abierta'` | `programada` con notas (borrador) | `consulta.estado` | `estado` |
| `Prescription` plano `{medicine, duration:"5 días"}` | diagnóstico → tratamiento → receta `{medicineId, durationDays: 5}` | 3 tablas + `medicamento` | arreglos anidados + `id_medicamento` |
| `bloodType "O+"` / `sex "F"` | `o+` / `f` | `tipo_sangre` / `sexo` | ídem |
| `Institution.type 'odontologica'` | `clinica` | `institucion.tipo` | ídem |

Capas: los mappers por motor (`adapters/*/mappers.ts`) traducen BD ⇄ dominio, y los presenters/DTOs (`server/src/http/presenters.ts`, `dto.ts`) traducen dominio ⇄ contrato de la UI.

---

## Eje B — Consistencia y transacciones

Operación crítica: **registrar consulta + diagnóstico + tratamiento + receta** (`IPrescriptionPort.saveEncounter`). Si falla la receta, no debe quedar nada. Las mismas pruebas lo demuestran en los 4 motores: `server/test/contract.ts`, caso "Eje B". En ambos escenarios (consulta nueva y cita existente) se verifica que no queda consulta ni diagnóstico, que la cita sigue `programada` sin notas y que `lastVisit` del paciente no cambia.

| Motor | Mecanismo | Cómo falla la receta | Resultado |
|---|---|---|---|
| PostgreSQL | `BEGIN; SET LOCAL ROLE …; … COMMIT` / `ROLLBACK` (`PostgresEngine.run`) | La FK `receta.id_medicamento` rechaza el medicamento inexistente después de insertar consulta, diagnóstico y tratamiento | `ROLLBACK` total. MVCC: lectores concurrentes nunca ven el estado intermedio |
| MySQL (InnoDB) | `START TRANSACTION … COMMIT` / `ROLLBACK` (`MySqlEngine.run`) | Error 1452 de la FK `fk_receta_medicamento` | `ROLLBACK` total |
| MongoDB | `session.withTransaction()` con `readConcern: snapshot` y `writeConcern: majority` (**requiere replica set**) | Tras escribir la consulta y `pacientes.ultima_visita` (dos documentos), la verificación referencial de medicamentos lanza un error | Transacción abortada: ninguno de los dos documentos cambia |
| Firestore | `runTransaction()`: lecturas primero (consulta, médico, medicamentos), luego escrituras encoladas (consulta + `pacientes.ultima_visita`) | Se lanza el error después de encolar las escrituras | Firestore descarta todas las escrituras encoladas |

Otras garantías:
- **Atomicidad de documento único** (Mongo/Firestore): el alta del paciente con alergias y contactos embebidos es un solo documento, así que es atómica sin transacción. También lo es la captura de resultados de laboratorio (un `updateOne` que fija `resultados` y `estado` a la vez, con control optimista por estado).
- SQL usa transacciones también en el alta (paciente + `paciente_alergia` + `contacto_emergencia`) y en la captura de resultados.
- La seed de Firestore usa `writeBatch()` (lote atómico).
- Sin `DELETE`: el archivado es lógico (OP-PAC-05). PostgreSQL ni siquiera concede ese privilegio.

---

## Eje C — Seguridad y RBAC

La matriz de permisos está **en un solo lugar** (`server/src/domain/security.ts`). Se aplica en cuatro capas:

1. **API** (`http/routes.ts`): middleware `requires(permiso)` por ruta y JWT con claims `userId`, `role`, `institutionId` (+ `doctorId`, `name`).
2. **Casos de uso**: `authorize()` antes de cada operación. La institución sale del token, nunca del cuerpo de la petición.
3. **Adaptador**: `guard()` rechaza materializar datos restringidos (defensa en profundidad). Es el "filtrado forzoso" que piden MySQL y Mongo.
4. **Motor**: ver la tabla.

| Rol | Puede | No puede (el backend responde 403) |
|---|---|---|
| secretaria | Leer y escribir datos confidenciales del paciente (nombre, DPI, teléfono, dirección, contactos, alergias); agenda (programar, reprogramar, cancelar); archivar | Notas clínicas, diagnósticos, tratamientos, recetas, laboratorio, antropometría, vacunas, internamientos |
| medico | Todo lo anterior + atención clínica. Es el **único** que crea diagnósticos, tratamientos, recetas y órdenes de laboratorio | Administrar usuarios y catálogos |
| admin | Usuarios (alta, rol, bloqueo), catálogos y bitácora; lectura confidencial | Alterar pacientes o historial; leer información restringida |

| Motor | Aplicación en el propio motor | Verificado en |
|---|---|---|
| PostgreSQL | Rol de conexión `rc_app` **NOINHERIT** (sin privilegios propios) + `SET LOCAL ROLE rc_medico/rc_secretaria/rc_admin` por transacción. **Privilegios por columna**: `rc_secretaria` y `rc_admin` no tienen `SELECT` sobre `consulta.notas_clinicas` ni sobre las tablas clínicas. **RLS** por `app.id_institucion` en `paciente`, `consulta` y `medico`. Vistas `v_agenda` y `v_historial_farmacoterapeutico` con `security_invoker`. Sin `DELETE` para nadie | `test/engine-security.test.ts` (consultas SQL directas, sin pasar por el adaptador) |
| MySQL | Vista restringida `v_agenda` (sin notas), única fuente de la agenda; filtrado forzoso en el adaptador y filtro `id_institucion` en cada consulta | `test/contract.ts` (Eje C) |
| MongoDB | Proyecciones en el adaptador (`{notas_clinicas: 0, diagnosticos: 0}` en la agenda) + `guard()` | `test/contract.ts` |
| Firestore | `firestore.rules` con `request.auth.token.role` e `institutionId`. La secretaría puede crear y cancelar citas pero no escribir notas ni diagnósticos (`diff().affectedKeys().hasOnly(...)`). Las subcolecciones clínicas son solo para médicos. Sin borrados | `test/engine-security.test.ts` (emulador + `@firebase/rules-unit-testing`) |

Observaciones:
- `firebase-admin` **no evalúa** las reglas. En el backend, el RBAC de Firestore lo aplican la capa de aplicación y el adaptador; las reglas protegen cualquier acceso directo de clientes.
- Las reglas de Firestore son **por documento, no por campo**. Como la consulta embebe notas y diagnósticos, la secretaría no puede leer `consultas/{id}` directamente. Darle agenda con acceso directo exigiría separar un documento `agenda/{id}`: es el costo del modelo embebido frente a los privilegios por columna de PostgreSQL.
- **Login** (OP-SEC-01..03, `application/auth.ts`):
  - compara el hash bcrypt (con un hash ficticio para usuarios inexistentes, de modo que el tiempo de respuesta no revela si el usuario existe);
  - verifica que el estado sea `activo`;
  - resuelve el motor de la institución (OP-SEC-02);
  - actualiza `ultimo_acceso` (OP-SEC-03) y registra en `bitacora_auditoria`.
- **Aislamiento entre sedes**: un usuario solo alcanza el motor de su institución. Con los mismos ids enteros, MySQL devuelve su propio paciente 1, nunca el del hospital.

---

## Eje D — Justificación institución–motor

| Institución | Patrón de carga | Por qué este motor |
|---|---|---|
| **Hospital General → PostgreSQL** | Alta concurrencia; internamientos, diagnósticos cruzados y prescripciones con integridad crítica | ACID estricto con **MVCC** (lectores y escritores no se bloquean), integridad referencial completa y la seguridad más rica del lote: roles, privilegios por columna, RLS e índices parciales. Las vistas `security_invoker` permiten publicar proyecciones seguras por rol sin duplicar lógica |
| **Clínica Odontológica → MySQL** | Operada por recepción; muchas lecturas rápidas de agenda y citas del día; esquema estable | InnoDB da transacciones ACID con bajo costo operativo; muy eficiente en lecturas por índice (`ix_consulta_paciente`, PK). La seguridad se resuelve con vistas + filtrado en la aplicación, suficiente para una sede de bajo riesgo clínico. La falta de índices parciales se suple con una columna generada |
| **Laboratorio Clínico → MongoDB** | Resultados heterogéneos por prueba (numéricos, cualitativos, antibiogramas, perfiles); procesamiento asíncrono | El modelo BSON admite parámetros dinámicos sin migraciones: el validador solo exige el núcleo común. Las órdenes son documentos autocontenidos (atomicidad de documento único al capturar resultados), y las transacciones de varios documentos con replica set cubren el registro clínico |
| **Centro Médico Pediátrico → Firestore** | Seguimiento continuo de curvas de crecimiento y esquemas de vacunación; citas periódicas | Subcolecciones por paciente para series temporales que pueden escucharse con listeners en tiempo real, reglas de seguridad declarativas evaluadas en el servidor de Google, y lotes o transacciones atómicos. La desnormalización selectiva mantiene bajo el número de lecturas (costo por documento leído) |

---

## Contradicciones entre fuentes y cómo se resolvieron

Prioridad: PDF > INSTRUCCIONES > README > código.

| # | Contradicción | Resolución |
|---|---|---|
| 1 | PDF: `paciente_alergia` solo tiene `alergia`; la UI captura reacción y severidad | Se conserva `alergia` y se agregan `reaccion` y `severidad` opcionales con `CHECK` (extensión documentada) |
| 2 | El PDF clasifica DPI, tipo de sangre y alergias como **Restringida**; INSTRUCCIONES y la UI se los muestran a recepción | Recepción ve DPI (lo exigen OP-PAC-01 y 03), tipo de sangre y alergias (datos de admisión y de seguridad del paciente). El resto de la información restringida queda bloqueada |
| 3 | `consulta.motivo_consulta` es Restringida, pero la secretaria lo captura al agendar | Se trata como parte de la "cita" visible para recepción; notas y diagnósticos siguen bloqueados |
| 4 | `consulta.id_medico` es obligatorio, pero la agenda de la UI usaba el id de la secretaria y la clínica no tenía médico | Se agregó el médico semilla Dr. Andrés Castillo (usuario `odontologo`) en la clínica; la agenda lista los médicos de la sede y la cita se asigna al médico seleccionado |
| 5 | La UI guarda borradores con diagnósticos; OP-FAR-01 exige consulta **atendida** | Gana el PDF: un borrador (`programada` con notas) no admite diagnósticos (422) |
| 6 | `examen.id_consulta` es obligatorio; `LabOrder` no lo tenía | `consultationId?` opcional en el contrato; la pantalla de consulta envía el id devuelto al guardar |
| 7 | La UI muestra nombres de secretarias y admins; `usuario` no tiene nombre | `usuario.nombre_completo` en la base central |
| 8 | `usuario.id_medico` es FK en el PDF, pero el médico vive en otro motor | Referencia lógica `varchar(40)` validada en la aplicación; la unicidad es `(id_institucion, id_medico)` |
| 9 | Alta de usuario sin contraseña ni colegiado en la UI | Contraseña inicial `INITIAL_USER_PASSWORD`; perfil de médico creado en el motor de su sede con colegiado `PEND-…` |
| 10 | Los catálogos de la UI tienen `status`; el modelo no | Se presentan como `activo` |
