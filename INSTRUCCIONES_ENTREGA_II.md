# GUÍA TÉCNICA Y PLAN DE ACCIÓN OPERATIVO: ENTREGA II - SISTEMA MÉDICO MULTI-MOTOR (BDII)

> **Destinatario:** Desarrollador / Asistente IA de Implementación  
> **Proyecto:** Plataforma de Gestión de Expedientes Clínicos Electrónicos Multi-Institución  
> **Principios rectores:** SOLID, DRY, KISS, Hexagonal Architecture (Ports & Adapters), Type Safety y Rigor Documental en Bases de Datos.

---

## 1. Contexto, Filosofía de Arquitectura y Principios de Diseño

### 1.1 Principios de Ingeniería Obligatorios
Para que la solución sea mantenible, testeable y evaluada con la máxima nota:
- **S (Single Responsibility):** Cada servicio, adaptador o componente hace exactamente una sola cosa (ej. `PostgresPatientAdapter` solo traduce peticiones a SQL; `EncounterService` orquesta la lógica clínica sin saber qué base de datos está abajo).
- **O (Open/Closed):** La lógica de negocio está abierta a extensión (agregar un 5to motor mañana) pero cerrada a modificación (los casos de uso no cambian).
- **L (Liskov Substitution):** Cualquier implementación de un puerto (`IPatientRepository`) debe comportarse de forma 100% intercambiable sin romper la lógica.
- **I (Interface Segregation):** Interfaces pequeñas y específicas por catálogo de operaciones (`IPatientPort`, `IConsultationPort`, `ILabPort`, etc.) en lugar de una interfaz monstruosa.
- **D (Dependency Inversion):** Los casos de uso dependen de abstracciones (interfaces/puertos), nunca de las librerías directas (`pg`, `mysql2`, `mongodb`, `firebase-admin`).
- **DRY (Don't Repeat Yourself):** Validaciones de negocio (ej. unicidad de DPI, estructura de recetas CIE-10, control de estados) se ejecutan **una sola vez en el dominio**, no duplicadas en cada adaptador.
- **KISS (Keep It Simple, Stupid):** No sobrecargar con herramientas innecesarias; la interfaz es idéntica y limpia, la conmutación de conexiones se hace mediante un *Factory/Registry* centralizado por institución.

---

## 2. Unificación Definitiva del Modelo Relacional (Corrección Entrega I)

Antes de codificar, se deben resolver las inconsistencias detectadas en la retroalimentación:

### Inconsistencias a Corregir y Resolución Oficial:
1. **Medicamentos, Tratamientos y Recetas:**
   - *Decisión:* Mantener la estructura del **Diccionario de Datos**.
   - `medicamento` es un catálogo general normalizado (`id_medicamento`, `nombre_generico`, `presentacion`, etc.).
   - `tratamiento` pertenece a un diagnóstico (`id_diagnostico`, `descripcion`, `fecha_inicio`, `fecha_fin_estimada`).
   - `receta` es la tabla asociativa que relaciona `tratamiento` con `medicamento` e incluye la posología (`dosis`, `frecuencia`, `duracion_dias`, `indicaciones`).
2. **Vacunas y Esquema:**
   - *Decisión:* Separar en catálogo `vacuna` (`id_vacuna`, `nombre_vacuna`, `dosis_requeridas`) y detalle `esquema_vacunacion` (`id_esquema`, `id_consulta`, `id_vacuna`, `no_dosis`, `fecha_aplicacion`, `lote`).
3. **Pacientes y Consultas (Campos completos):**
   - *Decisión:* Incluir `estado` ('activo', 'archivado', 'fallecido') e `id_institucion` (FK obligatoria) en `paciente`.
   - Incluir `estado` ('programada', 'atendida', 'cancelada') e `id_institucion` (FK obligatoria) en `consulta`.
   - *Signos vitales:* Los signos vitales pediátricos van formalmente en `registro_crecimiento` (`id_consulta`, `peso_kg`, `talla_cm`, `perimetro_cefalico`). Para consultas generales de adultos se registran en `notas_clinicas` para no desnormalizar el diccionario de datos.
4. **Diagrama ER Administrativo:**
   - *Decisión:* La entidad `institución` se relaciona con: `usuario` (1:N), `medico` (1:N), `paciente` (1:N) y `consulta` (1:N).

---

## 3. Asignación Confirmada de Motor por Institución y Estado

| Institución | Motor Confirmado | Justificación de Arquitectura y Carga | Estado de Implementación |
| :--- | :--- | :--- | :--- |
| **Hospital General** | **PostgreSQL** | Alto volumen de transacciones concurrentes, soporte de internamientos hospitalarios críticos, diagnósticos cruzados y necesidad de transaccionalidad ACID estricta con aislamiento MVCC. | `[ ]` *Pendiente / En proceso / Implementada* |
| **Clínica Odontológica** | **MySQL** | Enfoque en agilidad de citas y agenda externa, operaciones predominantes de lectura rápida (citas del día), estructura altamente estructurada y bajo overhead administrativo. | `[ ]` *Pendiente / En proceso / Implementada* |
| **Laboratorio Clínico** | **MongoDB** | Esquema flexible (documentos BSON) para albergar resultados analíticos heterogéneos y dinámicos (valores numéricos, cualitativos, antibiogramas, perfiles hormonales) sin alterar DDLs. | `[ ]` *Pendiente / En proceso / Implementada* |
| **Centro Médico Pediátrico** | **Firebase (Firestore)** | Sincronización reactiva de eventos clínicos, trazabilidad ágil para seguimiento continuo de curvas somatométricas y esquemas de vacunación. | `[ ]` *Pendiente / En proceso / Implementada* |

---

## 4. Modelado Documental: MongoDB y Firebase (Tabla de Decisiones Embeber vs. Referenciar)

> **Criterio rector:** Un paciente puede acumular cientos de consultas y análisis a lo largo de décadas. Superar límites de documento (16MB en BSON de Mongo o 1MB en Firestore) o penalizar la lectura rápida de la ficha de identificación obliga a desacoplar el historial acumulativo.

### Tabla Oficial de Decisiones de Modelado NoSQL

| Entidad Relacional Equivalente | Estrategia NoSQL | Justificación Técnica (Volumen, Crecimiento y Patrón de Acceso) |
| :--- | :--- | :--- |
| **Alergias del Paciente** | **EMBEBER** en `pacientes` | **Volumen acotado y acceso constante:** Un paciente tiene un número finito y reducido de alergias (raramente más de 10-15). Se requieren de inmediato cada vez que se abre la ficha médica para evitar eventos adversos. |
| **Contactos de Emergencia** | **EMBEBER** en `pacientes` | **Ciclo de vida dependiente:** Datos demográficos y de seguridad inmediatos; nunca se consultan de manera aislada, sino junto con el paciente. Relación 1:Pocos. |
| **Consultas Médicas** | **REFERENCIAR** (Colección / Subcolección independiente) | **Crecimiento ilimitado en el tiempo:** Un paciente crónico o recurrente puede tener cientos de consultas. Embeberlas inflaría el documento del paciente, degradaría el rendimiento de red y alcanzaría los límites físicos del motor. |
| **Diagnósticos y Tratamientos** | **EMBEBER** dentro de la `consulta` | **Límite transaccional acotado:** Una consulta específica suele desencadenar de 1 a 3 diagnósticos y tratamientos vinculados al encuentro. Se leen y redactan como unidad de atención médica. |
| **Recetas (Medicamentos prescritos)** | **EMBEBER** en el `tratamiento` (dentro de consulta) | Las indicaciones posológicas y el medicamento prescrito forman una orden médica unitaria sellada al momento de la consulta. |
| **Órdenes y Resultados de Laboratorio** | **REFERENCIAR** (Colección `examenes_laboratorio`) | **Estructura altamente dinámica y volumen masivo:** Los resultados pueden variar desde un simple valor cuantitativo hasta antibiogramas de 50 filas. El laboratorio opera de forma asíncrona a la consulta externa. En el examen se guarda `id_consulta` e `id_paciente`. |
| **Catálogos Maestros** (Medicamentos, Vacunas, Tipos de Examen) | **REFERENCIAR** (Colecciones maestras independientes) | Normalización de datos maestros, actualización centralizada de precios o presentaciones, y prevención de inconsistencias ortográficas. |
| **Controles Pediátricos y Vacunación** (Firebase) | **REFERENCIAR** en subcolecciones (`pacientes/{id}/crecimiento`, `pacientes/{id}/vacunas`) | Facilita la consulta en tiempo real mediante listeners reactivos de Firestore específicos para gráficas de crecimiento sin descargar todo el expediente. |

---

## 5. Arquitectura Hexagonal: Puertos, Dominio y Adaptadores

```
                  ┌──────────────────────────────────────────────────┐
                  │                 DRIVERS (Primary)                │
                  │        REST API / UI Frontend Controller         │
                  └─────────────────────────┬────────────────────────┘
                                            │ DTOs
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │            APPLICATION & DOMAIN LAYER            │
                  │  - Casos de Uso (RegisterPatient, AddEncounter)  │
                  │  - Validaciones de Reglas de Negocio             │
                  │  - Seguridad & RBAC Enforcement                  │
                  │                                                  │
                  │     PUERTOS (Interfaces TypeScript puras):        │
                  │     - IPatientRepository                         │
                  │     - IConsultationRepository                    │
                  │     - IClinicalRecordsRepository                 │
                  └─────────────────────────┬────────────────────────┘
                                            │ Dependencia de interfaz
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │            DRIVEN ADAPTERS (Secondary)           │
                  │          Database Adapter Registry / Factory     │
                  ├─────────────┬─────────────┬─────────────┬────────┤
                  │  Postgres   │    MySQL    │   MongoDB   │Firestore│
                  │   Adapter   │   Adapter   │   Adapter   │ Adapter │
                  └─────────────┴─────────────┴─────────────┴────────┘
```

### 5.1 Definición de Puertos de Repositorio (Interfaces)
El core de la aplicación **no importa drivers de base de datos**. Debe contar con interfaces bien segregadas:
- `IPatientRepository`: `create()`, `findById()`, `findByDpi()`, `update()`, `updateStatus(id, 'activo'|'archivado'|'fallecido')`.
- `IConsultationRepository`: `create()`, `findById()`, `listByDoctor()`, `updateStatus()`.
- `IClinicalEncounterRepository`: `addDiagnosis()`, `addTreatmentWithPrescription()`, `getPatientHistory()`.
- `ILabRepository`: `createOrder()`, `updateStatus()`, `addResults()`, `getOrderReport()`.

### 5.2 Factory / Enrutador por Usuario (OP-SEC-01 a 03)
Al iniciar sesión:
1. Se valida el hash de contraseña y estado del usuario en la tabla/colección central de `usuarios` (OP-SEC-01).
2. Se extrae `id_institucion` y el rol asignado (`medico`, `secretaria`, `admin`).
3. Un `DatabaseAdapterFactory` resuelve la instancia del repositorio correspondiente al motor de la institución del usuario:
   - `id_institucion = 1 (Hospital General)` ➔ `PostgresPatientAdapter`
   - `id_institucion = 2 (Clínica Odontológica)` ➔ `MySqlPatientAdapter`
   - `id_institucion = 3 (Laboratorio Clínico)` ➔ `MongoPatientAdapter`
   - `id_institucion = 4 (Centro Pediátrico)` ➔ `FirestorePatientAdapter`
4. Se actualiza el `ultimo_acceso` (OP-SEC-03).

---

## 6. Documento Comparativo Teórico (Estructura Requerida)

Debe redactarse una sección formal que compare los cuatro motores con los siguientes 4 ejes:

### Eje A: Decisiones de Modelado
- **PostgreSQL & MySQL (Relacional):** Modelado en 3FN estricta; claves primarias subrogadas (`serial`/`auto_increment`); integridad referencial con FKs `ON DELETE RESTRICT`; atomicidad garantizada por tablas intermedias (`paciente_alergia`, `receta`, `resultado_examen`).
- **MongoDB (Documental):** Documentos ricos en BSON; patrón de diseño híbrido (Embeber datos de relación 1:Pocos y ciclo de vida acoplado; Referenciar colecciones 1:Muchos con crecimiento desbordado como consultas y laboratorios).
- **Firebase Firestore (Colección/Documento):** Modelo optimizado para lecturas jerárquicas; subcolecciones para series temporales (crecimiento infantil, dosis de vacunas); desnormalización selectiva para optimizar el consumo de lecturas y costos por query.

### Eje B: Garantía de Consistencia y Transacciones
- **SQL (PostgreSQL & MySQL):** Soporte ACID nativo mediante transacciones `BEGIN ... COMMIT / ROLLBACK`.
  - En registro de consulta + diagnóstico + receta: Se ejecuta un bloque transaccional. Si falla la inserción de una receta, se revierte la consulta completa.
  - PostgreSQL usa MVCC (Multi-Version Concurrency Control) evitando lecturas sucias en consultas concurrentes de hospitalización.
- **NoSQL (MongoDB):**
  - Consistencia atómica a nivel de documento único (`single-document atomicity`). Al actualizar un paciente y sus alergias embebidas, la operación es 100% ACID sin bloqueos complejos.
  - Para operaciones multi-documento (crear consulta y actualizar estado de paciente): Uso de sesiones transaccionales de MongoDB (`session.withTransaction()`) o consistencia eventual controlada.
- **NoSQL (Firebase Firestore):**
  - Uso de `runTransaction()` o `writeBatch()` (lotes atómicos) para garantizar que si se escribe una consulta y un evento médico, ambos ocurran o ninguno.

### Eje C: Aplicación de Seguridad y RBAC
- **Reglas del Negocio (RBAC):**
  - `Secretaria / Recepción`: Solo lectura y edición de información **Confidencial** (nombre, DPI, teléfono, cita). Bloqueo total a información **Restringida** (diagnósticos, notas clínicas, recetas).
  - `Médico`: Acceso completo a información restringida de consultas, prescripciones y tratamientos.
  - `Administrador`: Gestión de cuentas, auditoría y catálogos, sin alteración arbitraria del historial médico.
- **Implementación por Motor:**
  - En SQL: Vistas restringidas, políticas RLS (Row Level Security en Postgres) o filtrado forzoso en el adaptador de repositorio.
  - En Firebase: **Firestore Security Rules** (`firestore.rules`) evaluando tokens `request.auth.token.role` y `request.auth.token.institutionId`.

### Eje D: Justificación de Encaje Institución - Motor
- Justificar detalladamente por qué cada entidad de salud encaja con el motor asignado según estructura de datos, patrones de lectura/escritura y criticidad transaccional.

---

## 7. CHECKLIST INTEGRAL DE IMPLEMENTACIÓN Y VERIFICACIÓN

Utiliza este checklist como guía paso a paso para la IA y el equipo:

### Fase 1: Unificación y Preparación del Modelo
- [ ] **1.1** Corregir el script/esquema relacional: incorporar `receta` (relacionando `tratamiento` y `medicamento`) y separar `vacuna` de `esquema_vacunacion`.
- [ ] **1.2** Unificar campos en tabla `paciente`: `estado` ('activo','archivado','fallecido'), `id_institucion`, `dpi_cui` único.
- [ ] **1.3** Unificar campos en tabla `consulta`: `estado` ('programada','atendida','cancelada'), `id_institucion`, `id_medico`, `id_paciente`.
- [ ] **1.4** Crear DDL / migraciones oficiales para **PostgreSQL** y **MySQL**.
- [ ] **1.5** Crear esquemas / interfaces / scripts de inicialización para colecciones de **MongoDB** y **Firebase Firestore**.
- [ ] **1.6** Llenar la tabla de estado de implementación de las 4 bases de datos.

### Fase 2: Arquitectura Hexagonal y Puertos
- [ ] **2.1** Crear directorio de dominio: entidades puras del expediente clínico (`Patient`, `Consultation`, `Diagnosis`, `Treatment`, `Prescription`).
- [ ] **2.2** Definir interfaces de puertos (Ports):
  - `IPatientPort`
  - `IConsultationPort`
  - `IPrescriptionPort`
  - `ILabPort`
  - `IAuthPort`
- [ ] **2.3** Implementar el `DatabaseAdapterFactory` que resuelva el adaptador según la institución del usuario autenticado.
- [ ] **2.4** Implementar adaptadores secundarios (Adapters):
  - [ ] Adaptador PostgreSQL (Hospital General)
  - [ ] Adaptador MySQL (Clínica Odontológica)
  - [ ] Adaptador MongoDB (Laboratorio Clínico)
  - [ ] Adaptador Firebase Firestore (Centro Médico Pediátrico)

### Fase 3: Operaciones Transaccionales del Sistema (Catálogo)
- [ ] **3.1 Módulo Pacientes:**
  - [ ] `OP-PAC-01`: Registro de paciente con validación de unicidad de DPI/correo y registro de alergias.
  - [ ] `OP-PAC-02`: Registro de contactos de emergencia.
  - [ ] `OP-PAC-03`: Búsqueda/consulta de perfil sociodemográfico y antecedentes por DPI o ID.
  - [ ] `OP-PAC-04`: Modificación de datos de contacto o residencia.
  - [ ] `OP-PAC-05`: Baja lógica o archivado del paciente (`estado = 'archivado'` o `'fallecido'`).
- [ ] **3.2 Módulo Consultas:**
  - [ ] `OP-CON-01`: Programar cita / consulta médica.
  - [ ] `OP-CON-02`: Atender consulta capturando motivo, notas clínicas y marcando estado `atendida`.
  - [ ] `OP-CON-03`: Cancelar o reprogramar cita médica.
  - [ ] `OP-CON-04`: Listar consultas por médico y fecha.
- [ ] **3.3 Módulo Diagnóstico y Farmacoterapia:**
  - [ ] `OP-FAR-01`: Asignar uno o más diagnósticos (con CIE-10) a una consulta atendida.
  - [ ] `OP-FAR-02`: Crear plan de tratamiento vinculado al diagnóstico.
  - [ ] `OP-FAR-03`: Generar recetas con medicamentos dosificados vinculados al tratamiento.
  - [ ] `OP-FAR-04`: Consultar historial farmacoterapéutico completo del paciente a lo largo del tiempo.
- [ ] **3.4 Módulo Seguridad y Sesiones (Enrutamiento):**
  - [ ] `OP-SEC-01`: Autenticación de credenciales (hash comparison) y verificación de usuario activo.
  - [ ] `OP-SEC-02`: Enrutamiento transparente a la base de datos de la institución correspondiente.
  - [ ] `OP-SEC-03`: Registro de auditoría con timestamp de último acceso.

### Fase 4: Interfaz de Usuario y Experiencia Homogénea
- [ ] **4.1** Mantener la interfaz visual idéntica independientemente del motor conectado.
- [ ] **4.2** El usuario ve un indicador sutil de la institución y motor activo (ej. *"Conectado a: Hospital General (PostgreSQL)"*).
- [ ] **4.3** Aplicar control de vistas RBAC en la UI:
  - Ocultar expedientes clínicos confidenciales/restringidos a secretarias.
  - Habilitar creación de recetas y diagnósticos únicamente a médicos.
- [ ] **4.4** Formulario ágil para registro completo: Paciente -> Consulta -> Diagnóstico -> Tratamiento + Receta.

### Fase 5: Documento Comparativo y Verificación
- [ ] **5.1** Redactar análisis de transacciones ACID vs. Atómicas en documento Markdown.
- [ ] **5.2** Redactar análisis de seguridad (RBAC) en documento Markdown.
- [ ] **5.3** Redactar la justificación institucional para los 4 motores.
- [ ] **5.4** Ejecutar pruebas cruzadas: Realizar exactamente las mismas 4 operaciones clínicas (Alta Paciente, Consulta, Diagnóstico, Receta y Archivo) en los 4 motores y corroborar que devuelven resultados equivalentes.

