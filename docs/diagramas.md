# Diagramas — Red Clínica multi-motor (Entrega II)

Estos diagramas reflejan el sistema **tal como está implementado**. Se generaron a partir de:

- el DDL de `server/db/postgres/01_schema.sql`, `server/db/mysql/01_schema.sql` y `server/db/central/01_schema.sql`;
- los validadores de `server/db/mongo/init.js` y la estructura de `server/db/firestore/seed.ts`;
- el código de `server/src/`.

Reemplazan a los diagramas de la Entrega I enlazados en la sección 8 del PDF. Incorporan las correcciones de `INSTRUCCIONES_ENTREGA_II.md` §2:

- receta como tabla asociativa;
- catálogo de vacunas separado del esquema;
- `estado` e `id_institucion` en paciente y consulta;
- la relación 1:N de institución con usuario, médico, paciente y consulta.

GitHub muestra los bloques Mermaid directamente. En `docs/diagramas/diagrama-N.svg` está cada diagrama exportado en SVG, en el orden de esta lista, para insertarlo en el informe; para regenerarlos, ver el final de este documento.

1. [Diagrama ER (conceptual)](#1-diagrama-er-conceptual)
2. [Diagrama relacional: sedes SQL](#2-diagrama-relacional--sedes-sql-postgresql-y-mysql)
3. [Diagrama relacional: base central `red_central`](#3-diagrama-relacional--base-central-red_central)
4. [Modelo documental: MongoDB](#4-modelo-documental--mongodb-laboratorio-clínico)
5. [Modelo documental: Firestore](#5-modelo-documental--firestore-centro-médico-pediátrico)
6. [Arquitectura hexagonal](#6-arquitectura-hexagonal)
7. [Login y enrutamiento por institución (OP-SEC-01..03)](#7-login-y-enrutamiento-por-institución-op-sec-0103)
8. [Transacción atómica de la consulta (Eje B)](#8-transacción-atómica-de-la-consulta-eje-b)

---

## 1. Diagrama ER (conceptual)

Muestra entidades, relaciones y cardinalidades. `usuario` y `bitacora_auditoria` viven en la base central (§3). Cada sede SQL replica el resto, y los motores documentales lo transforman como se describe en §4 y §5.

La relación `usuario` → `medico` es **lógica**: el médico vive en el motor de su sede, con un id entero, un ObjectId o un id de documento según el motor. Por eso no puede haber una FK entre bases distintas.

```mermaid
erDiagram
    INSTITUCION ||--o{ USUARIO : "emplea"
    INSTITUCION ||--o{ MEDICO : "adscribe"
    INSTITUCION ||--o{ PACIENTE : "registra"
    INSTITUCION ||--o{ CONSULTA : "atiende"
    USUARIO |o--o| MEDICO : "es (rol medico)"
    USUARIO |o--o{ BITACORA_AUDITORIA : "genera"

    PACIENTE ||--o{ PACIENTE_ALERGIA : "padece"
    PACIENTE ||--o{ CONTACTO_EMERGENCIA : "tiene"
    PACIENTE ||--o{ CONSULTA : "solicita"
    MEDICO ||--o{ CONSULTA : "realiza"

    CONSULTA ||--o{ DIAGNOSTICO : "establece"
    DIAGNOSTICO ||--o{ TRATAMIENTO : "origina"
    TRATAMIENTO ||--o{ RECETA : "prescribe"
    MEDICAMENTO ||--o{ RECETA : "se indica en"

    CONSULTA ||--o{ EXAMEN : "ordena"
    TIPO_EXAMEN ||--o{ EXAMEN : "clasifica"
    EXAMEN ||--o{ RESULTADO_EXAMEN : "produce"

    CONSULTA ||--o{ REGISTRO_CRECIMIENTO : "mide"
    CONSULTA ||--o{ ESQUEMA_VACUNACION : "aplica"
    VACUNA ||--o{ ESQUEMA_VACUNACION : "se aplica en"
    CONSULTA ||--o{ INTERNAMIENTO : "deriva en"
```

| Subsistema | Entidades |
|---|---|
| Administración | `institucion`, `usuario`, `medico`, `bitacora_auditoria` |
| Núcleo clínico | `paciente`, `paciente_alergia`, `contacto_emergencia`, `consulta`, `diagnostico`, `tratamiento`, `receta` |
| Catálogos | `medicamento`, `tipo_examen`, `vacuna` |
| Laboratorio | `examen`, `resultado_examen` |
| Especialidad | `registro_crecimiento`, `esquema_vacunacion` (pediatría) e `internamiento` (hospital) |

---

## 2. Diagrama relacional: sedes SQL (PostgreSQL y MySQL)

Hospital General (`hospital_general`, PostgreSQL) y Clínica Odontológica (`clinica_odontologica`, MySQL) tienen las mismas 17 tablas en 3FN. Todas las FK son `NOT NULL` y `ON DELETE RESTRICT`; el borrado es lógico, mediante `estado`.

```mermaid
erDiagram
    institucion {
        serial id_institucion PK
        varchar nombre "NN"
        varchar tipo "NN · hospital|clinica|laboratorio|pediatrico"
        text direccion
        varchar telefono
    }
    medico {
        serial id_medico PK
        varchar nombre_completo "NN"
        varchar no_colegiado UK "NN"
        varchar especialidad
        varchar telefono
        varchar correo UK
        varchar estado "NN · activo|inactivo"
        int id_institucion FK
    }
    paciente {
        serial id_paciente PK
        varchar primer_nombre "NN"
        varchar segundo_nombre
        varchar primer_apellido "NN"
        varchar segundo_apellido
        date fecha_nacimiento "NN"
        char sexo "NN · m|f|o"
        varchar dpi_cui UK "NN · 13 dígitos"
        varchar telefono
        varchar correo UK
        text direccion
        varchar municipio
        varchar departamento
        varchar tipo_sangre "a+ … o-"
        timestamp fecha_registro "NN"
        varchar estado "NN · activo|archivado|fallecido"
        int id_institucion FK
    }
    paciente_alergia {
        serial id_paciente_alergia PK
        int id_paciente FK "UK (id_paciente, alergia)"
        varchar alergia "NN"
        varchar reaccion
        varchar severidad "leve|moderada|grave"
    }
    contacto_emergencia {
        serial id_contacto PK
        varchar nombre_completo "NN"
        varchar parentesco "NN"
        varchar telefono "NN"
        varchar telefono_alternativo
        int id_paciente FK
    }
    consulta {
        serial id_consulta PK
        timestamp fecha_hora "NN"
        text motivo_consulta "NN"
        text notas_clinicas "restringido"
        varchar estado "NN · programada|atendida|cancelada"
        int id_paciente FK
        int id_medico FK "UK (id_medico, fecha_hora) si estado <> cancelada"
        int id_institucion FK
    }
    diagnostico {
        serial id_diagnostico PK
        varchar codigo_cie10 "CIE-10"
        text descripcion "NN"
        varchar tipo "presuntivo|definitivo|diferencial"
        date fecha "NN"
        int id_consulta FK
    }
    tratamiento {
        serial id_tratamiento PK
        text descripcion "NN"
        date fecha_inicio "NN"
        date fecha_fin_estimada "≥ fecha_inicio"
        text observaciones
        int id_diagnostico FK
    }
    medicamento {
        serial id_medicamento PK
        varchar nombre_generico "NN"
        varchar nombre_comercial
        varchar presentacion
        varchar concentracion
    }
    receta {
        serial id_receta PK
        varchar dosis "NN"
        varchar frecuencia "NN"
        int duracion_dias "> 0"
        text indicaciones
        int id_tratamiento FK
        int id_medicamento FK
    }
    tipo_examen {
        serial id_tipo_examen PK
        varchar nombre "NN"
        text descripcion
    }
    examen {
        serial id_examen PK
        timestamp fecha_solicitud "NN"
        varchar estado "NN · solicitado|en_proceso|completado"
        int id_consulta FK
        int id_tipo_examen FK
    }
    resultado_examen {
        serial id_resultado PK
        varchar parametro "NN"
        varchar valor_obtenido "NN"
        varchar rango_referencia
        text observaciones
        int id_examen FK
    }
    registro_crecimiento {
        serial id_registro PK
        date fecha_medicion "NN"
        numeric peso_kg "NN · > 0"
        numeric talla_cm "NN · > 0"
        numeric perimetro_cefalico "> 0"
        int id_consulta FK
    }
    vacuna {
        serial id_vacuna PK
        varchar nombre_vacuna "NN"
        int dosis_requeridas "NN · > 0"
    }
    esquema_vacunacion {
        serial id_esquema PK
        int no_dosis "NN · > 0"
        date fecha_aplicacion "NN"
        varchar lote
        int id_consulta FK
        int id_vacuna FK
    }
    internamiento {
        serial id_internamiento PK
        timestamp fecha_ingreso "NN"
        timestamp fecha_egreso "≥ fecha_ingreso"
        varchar numero_cama
        text motivo_ingreso "NN"
        int id_consulta FK
    }

    institucion ||--o{ medico : "id_institucion"
    institucion ||--o{ paciente : "id_institucion"
    institucion ||--o{ consulta : "id_institucion"
    paciente ||--o{ paciente_alergia : "id_paciente"
    paciente ||--o{ contacto_emergencia : "id_paciente"
    paciente ||--o{ consulta : "id_paciente"
    medico ||--o{ consulta : "id_medico"
    consulta ||--o{ diagnostico : "id_consulta"
    diagnostico ||--o{ tratamiento : "id_diagnostico"
    tratamiento ||--o{ receta : "id_tratamiento"
    medicamento ||--o{ receta : "id_medicamento"
    consulta ||--o{ examen : "id_consulta"
    tipo_examen ||--o{ examen : "id_tipo_examen"
    examen ||--o{ resultado_examen : "id_examen"
    consulta ||--o{ registro_crecimiento : "id_consulta"
    consulta ||--o{ esquema_vacunacion : "id_consulta"
    vacuna ||--o{ esquema_vacunacion : "id_vacuna"
    consulta ||--o{ internamiento : "id_consulta"
```

**Diferencias entre los dos motores** (mismo modelo lógico):

| Aspecto | PostgreSQL (`hospital_general`) | MySQL (`clinica_odontologica`) |
|---|---|---|
| PK | `serial` | `INT AUTO_INCREMENT` |
| Horario único del médico | Índice único **parcial** `uq_consulta_horario_medico (id_medico, fecha_hora) WHERE estado <> 'cancelada'` | Columna generada `horario_vigente` (1 o `NULL`) dentro de `UNIQUE (id_medico, fecha_hora, horario_vigente)` |
| Vistas | `v_agenda` y `v_historial_farmacoterapeutico`, ambas `security_invoker` | `v_agenda` (`SQL SECURITY INVOKER`) |
| Seguridad en el motor | Roles `rc_medico`, `rc_secretaria`, `rc_admin`; privilegios por columna en `consulta`; RLS por `app.id_institucion` en `paciente`, `consulta` y `medico` | La agenda de secretaría y admin solo se lee desde `v_agenda`; el resto se filtra en el adaptador |

---

## 3. Diagrama relacional: base central `red_central`

Es el directorio de seguridad en PostgreSQL. El login ocurre **antes** de conocer el motor de la sede (OP-SEC-02), así que los usuarios no pueden vivir dentro de cada sede.

```mermaid
erDiagram
    institucion {
        serial id_institucion PK "1 Hospital · 2 Clínica · 3 Laboratorio · 4 Pediátrico"
        varchar nombre "NN"
        varchar tipo "NN"
        text direccion
        varchar telefono
    }
    usuario {
        serial id_usuario PK
        varchar nombre_usuario UK "NN"
        varchar contrasena_hash "NN · bcrypt"
        varchar nombre_completo "NN"
        varchar rol "NN · medico|secretaria|admin"
        varchar estado "NN · activo|bloqueado|inactivo"
        timestamp ultimo_acceso "OP-SEC-03"
        int id_institucion FK
        varchar id_medico "lógica → medico de la sede · UK (id_institucion, id_medico) · solo rol medico"
    }
    bitacora_auditoria {
        bigserial id_bitacora PK
        timestamp fecha_hora "NN"
        int id_usuario FK
        int id_institucion FK
        varchar accion "NN"
        varchar entidad
        varchar id_entidad
        jsonb detalle
    }
    institucion ||--o{ usuario : "id_institucion"
    usuario |o--o{ bitacora_auditoria : "id_usuario"
    institucion |o--o{ bitacora_auditoria : "id_institucion"
```

---

## 4. Modelo documental: MongoDB (Laboratorio Clínico)

Base `laboratorio_clinico`, en un replica set `rs0` (lo requieren las transacciones). Lo que crece sin límite se **referencia** y lo acotado se **embebe**; la justificación está en [`modelo-nosql.md`](modelo-nosql.md). Las 7 colecciones llevan validadores `$jsonSchema` estrictos.

```mermaid
flowchart LR
    subgraph maestros["Catálogos y datos maestros (referenciados)"]
        INS[("instituciones<br/>_id: int · nombre · tipo")]
        MED[("medicos<br/>_id: ObjectId · nombre_completo<br/>no_colegiado · estado · id_institucion")]
        MDC[("medicamentos<br/>nombre_generico · presentacion<br/>concentracion")]
        TEX[("tipos_examen<br/>nombre · descripcion")]
        VAC[("vacunas<br/>nombre_vacuna · dosis_requeridas: int")]
    end

    subgraph pac["pacientes"]
        P["primer_nombre · primer_apellido · fecha_nacimiento · sexo<br/>dpi_cui (único) · correo (único parcial)<br/>estado · id_institucion: int"]
        PA["alergias[] (embebido)<br/>alergia · reaccion · severidad"]
        PC["contactos_emergencia[] (embebido)<br/>nombre_completo · parentesco · telefono"]
        P --- PA
        P --- PC
    end

    subgraph con["consultas"]
        C["fecha_hora · motivo_consulta · notas_clinicas · estado<br/>id_paciente · id_medico · id_institucion<br/>único parcial (id_medico, fecha_hora) si vigente"]
        D["diagnosticos[] (embebido)<br/>_id · codigo_cie10 · descripcion · tipo · fecha"]
        T["tratamientos[] (embebido)<br/>_id · descripcion · fecha_inicio · fecha_fin_estimada"]
        R["recetas[] (embebido)<br/>_id · dosis · frecuencia · duracion_dias<br/>indicaciones · id_medicamento"]
        C --> D --> T --> R
    end

    subgraph lab["examenes_laboratorio"]
        E["fecha_solicitud · estado<br/>id_consulta · id_paciente · id_tipo_examen"]
        ER["resultados[] (embebido, heterogéneo)<br/>parametro · valor_obtenido · rango_referencia …"]
        E --- ER
    end

    C -. "id_paciente" .-> P
    C -. "id_medico" .-> MED
    R -. "id_medicamento<br/>(verificado dentro de la transacción)" .-> MDC
    E -. "id_consulta" .-> C
    E -. "id_paciente" .-> P
    E -. "id_tipo_examen" .-> TEX
    MED -. "id_institucion" .-> INS
```

Línea continua: el subdocumento se embebe. Línea punteada: referencia por id. MongoDB no tiene FK, así que el adaptador comprueba la referencia dentro de la transacción.

---

## 5. Modelo documental: Firestore (Centro Médico Pediátrico)

Proyecto `demo-red-clinica` en el emulador. Usa subcolecciones por paciente para las series temporales pediátricas y desnormaliza selectivamente para ahorrar lecturas. Firestore no tiene índices únicos, así que la unicidad se logra con documentos centinela.

```mermaid
flowchart LR
    subgraph maestros["Colecciones maestras"]
        INS[("instituciones/{4}")]
        MED[("medicos/{id}<br/>nombre_completo · no_colegiado · estado")]
        MDC[("medicamentos/{id}")]
        TEX[("tipos_examen/{id}")]
        VAC[("vacunas/{id}<br/>nombre_vacuna · dosis_requeridas")]
    end

    subgraph unicidad["Centinelas de unicidad (create() en la misma transacción)"]
        UD[("pacientes_dpi/{dpi}")]
        UC[("pacientes_correo/{correo}")]
    end

    subgraph pac["pacientes/{id}"]
        P["datos demográficos · dpi_cui · estado · id_institucion<br/>alergias[] · contactos_emergencia[] (embebidos)"]
        GC["crecimiento/{id} (subcolección)<br/>fecha_medicion · peso_kg · talla_cm<br/>perimetro_cefalico · id_consulta"]
        GV["vacunas/{id} (subcolección)<br/>id_vacuna · nombre_vacuna · no_dosis<br/>fecha_aplicacion · lote · id_consulta"]
        P --> GC
        P --> GV
    end

    subgraph con["consultas/{id}"]
        C["fecha_hora · motivo_consulta · notas_clinicas · estado<br/>id_paciente · id_medico · nombre_medico (sellado)<br/>ids_diagnosticos[] (índice array-contains)"]
        D["diagnosticos[] → tratamientos[] → recetas[] (embebidos)<br/>receta: id_medicamento + medicamento (etiqueta sellada)"]
        C --> D
    end

    subgraph lab["examenes_laboratorio/{id}"]
        E["fecha_solicitud · estado · id_consulta · id_paciente<br/>id_tipo_examen · nombre_tipo · solicitado_por (sellados)<br/>resultados[] (embebidos)"]
    end

    UD -. "dpi_cui" .-> P
    UC -. "correo" .-> P
    C -. "id_paciente" .-> P
    C -. "id_medico" .-> MED
    D -. "id_medicamento" .-> MDC
    GC -. "id_consulta" .-> C
    GV -. "id_consulta" .-> C
    GV -. "id_vacuna" .-> VAC
    E -. "id_consulta" .-> C
    E -. "id_tipo_examen" .-> TEX
```

La seguridad se declara en `firestore.rules`, según `request.auth.token.role` y `institutionId`. El backend usa `firebase-admin`, que omite esas reglas, y por eso también aplica el mismo RBAC en la capa de aplicación.

---

## 6. Arquitectura hexagonal

Las flechas son dependencias de código. El dominio y la aplicación dependen **solo de los puertos**. Los adaptadores secundarios implementan esos puertos (enlace grueso): los 4 proveedores, los puertos clínicos; `PostgresCentralDirectory`, los centrales; y `DatabaseAdapterFactory`, `IRepositoryResolver`. `container.ts` es la raíz de composición y el único lugar que conoce los drivers.

```mermaid
flowchart LR
    subgraph primarios["Adaptadores primarios"]
        direction TB
        UI["Frontend React<br/>src/services/*<br/>httpClient.ts"]
        HTTP["API REST Express<br/>server/src/http<br/>routes · dto (zod) · jwt<br/>requires(permiso) · presenters"]
        UI -- "JSON + JWT" --> HTTP
    end

    subgraph nucleo["Núcleo hexagonal (sin drivers)"]
        direction TB
        APP["Aplicación<br/>server/src/application<br/>patients · appointments<br/>encounters · lab · specialty<br/>admin · auth<br/>context: RBAC + auditoría"]
        DOM["Dominio<br/>server/src/domain<br/>Patient · Consultation<br/>LabOrder · Catalog · Specialty<br/>User · security · errors"]
        PORTS["Puertos · server/src/ports<br/><b>clínicos</b><br/>IPatientPort · IConsultationPort<br/>IPrescriptionPort · ILabPort<br/>ICatalogPort · IDoctorPort<br/>IAdmissionPort · IPediatricPort<br/><b>centrales</b><br/>IAuthPort · IUserDirectoryPort<br/>IInstitutionPort · IAuditPort<br/>IPasswordHasher<br/><b>enrutamiento</b><br/>IRepositoryResolver"]
        APP --> DOM
        APP --> PORTS
    end

    subgraph secundarios["Adaptadores secundarios · server/src/adapters"]
        direction TB
        FAC["DatabaseAdapterFactory<br/>register(motor)<br/>route(institución → motor)"]
        PG["PostgresProvider"]
        MY["MySqlProvider"]
        SQL["sql/ Sql*Repository<br/>(compartido PG y MySQL)"]
        MO["MongoProvider"]
        FS["FirestoreProvider"]
        CEN["PostgresCentralDirectory<br/>+ bcryptHasher"]
        FAC --> PG & MY & MO & FS
        PG --> SQL
        MY --> SQL
    end

    subgraph motores["Bases de datos"]
        direction TB
        DPG[("PostgreSQL<br/>hospital_general · i1")]
        DMY[("MySQL<br/>clinica_odontologica · i2")]
        DMO[("MongoDB rs0<br/>laboratorio_clinico · i3")]
        DFS[("Firestore<br/>demo-red-clinica · i4")]
        DCE[("PostgreSQL<br/>red_central")]
    end

    HTTP --> APP
    PORTS == "implementados por" === secundarios
    SQL --> DPG & DMY
    MO --> DMO
    FS --> DFS
    CEN --> DCE
```

La misma suite de contrato (`server/test/contract.ts`) se ejecuta contra los 4 proveedores, lo que verifica el principio de sustitución de Liskov. Para agregar un 5.º motor basta con `factory.register(...)` y `route(...)`, sin tocar los casos de uso (principio abierto/cerrado).

---

## 7. Login y enrutamiento por institución (OP-SEC-01..03)

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant FE as Frontend<br/>authService + httpClient
    participant API as API REST<br/>(Express)
    participant AUTH as application/auth.ts
    participant CEN as PostgresCentralDirectory<br/>(red_central)
    participant FAC as DatabaseAdapterFactory
    participant DB as Motor de la sede

    U->>FE: usuario + contraseña
    FE->>API: POST /api/auth/login
    API->>AUTH: login(username, password)
    AUTH->>CEN: findByUsername()
    CEN-->>AUTH: usuario (hash, rol, estado, id_institucion, id_medico)
    AUTH->>AUTH: bcrypt.verify (hash ficticio si no existe)<br/>assertCanLogin: activo y no bloqueado (OP-SEC-01)
    AUTH->>FAC: describe(id_institucion) y forContext() (OP-SEC-02)
    FAC-->>AUTH: motor de la sede (p. ej. PostgreSQL) y repositorios
    AUTH->>CEN: recordSuccessfulLogin → ultimo_acceso = now() (OP-SEC-03)
    AUTH->>CEN: bitácora "sesion.login" {motor}
    AUTH-->>API: sesión (usuario, institución, motor)
    API-->>FE: JWT {userId, role, institutionId, doctorId, name} + institución {engine}
    FE-->>U: "Conectado a: Hospital General (PostgreSQL)"

    Note over FE,DB: Peticiones siguientes
    FE->>API: GET /api/patients (Authorization: Bearer JWT)
    API->>API: verifica JWT · requires(permiso)
    API->>FAC: forContext({role, institutionId})
    FAC-->>API: repositorios ligados al motor y al rol
    API->>DB: consulta (en PG: SET LOCAL ROLE + app.id_institucion)
    DB-->>API: filas / documentos
    API-->>FE: contrato común de src/types (presenters)
```

---

## 8. Transacción atómica de la consulta (Eje B)

Al guardar una consulta, la consulta, los diagnósticos, los tratamientos y las recetas se escriben **todos o ninguno**. El diagrama muestra el caso de error que verifica `engines.test.ts`: una receta con un medicamento inexistente revierte todo lo anterior.

```mermaid
sequenceDiagram
    autonumber
    participant UC as encounters.ts<br/>(caso de uso)
    participant DOM as domain/Consultation
    participant REP as IPrescriptionPort<br/>saveEncounter()
    participant DB as Motor

    UC->>DOM: prepareEncounter: CIE-10, estado, sin diagnósticos en borrador
    DOM-->>UC: encuentro válido
    UC->>REP: saveEncounter(consulta + diagnósticos + tratamientos + recetas)
    REP->>DB: iniciar transacción
    Note right of DB: PG: BEGIN + SET LOCAL ROLE<br/>MySQL: START TRANSACTION<br/>Mongo: session.withTransaction<br/>Firestore: runTransaction
    alt Sedes SQL (PostgreSQL, MySQL)
        REP->>DB: INSERT/UPDATE consulta
        REP->>DB: INSERT diagnostico → INSERT tratamiento
        REP->>DB: INSERT receta (FK id_medicamento)
    else Sedes documentales (MongoDB, Firestore)
        REP->>DB: verificar medicamentos (lectura dentro de la transacción)
        REP->>DB: escribir consulta con diagnosticos[] → tratamientos[] → recetas[] embebidos
    end
    alt medicamento inexistente
        DB-->>REP: FK violada (PG 23503 / MySQL 1452) o ValidationError del adaptador
        REP->>DB: ROLLBACK / abortTransaction
        REP-->>UC: ValidationError → HTTP 422 · no queda nada escrito
    else todo válido
        REP->>DB: COMMIT
        REP-->>UC: Consultation completa
    end
```

---

## Regenerar las imágenes

Los archivos `docs/diagramas/*.svg` se generan desde los bloques Mermaid de este documento con [`@mermaid-js/mermaid-cli`](https://github.com/mermaid-js/mermaid-cli):

```bash
npx -y @mermaid-js/mermaid-cli@11.4.2 -i docs/diagramas.md -o docs/diagramas/diagrama.svg
```

El comando crea un archivo por bloque (`diagrama-1.svg` … `diagrama-8.svg`), en el orden de las secciones. Para obtener PNG, cambie la extensión de salida a `.png` y agregue `-w 1800 -s 2 -b white`. El repositorio envía los `*.png` a Git LFS (`.gitattributes`), así que no se versionan.
