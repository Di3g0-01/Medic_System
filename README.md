# Red Clínica

Plataforma de expedientes clínicos para cuatro instituciones con una interfaz común. Cada institución persiste en su propio motor de base de datos (Entrega II, BDII):

| Institución | Motor |
|---|---|
| Hospital General (`i1`) | PostgreSQL |
| Clínica Odontológica (`i2`) | MySQL |
| Laboratorio Clínico (`i3`) | MongoDB (replica set) |
| Centro Médico Pediátrico (`i4`) | Firestore (Firebase Emulator) |

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4 y React Router (raíz del repositorio).
- **Backend**: API REST en TypeScript con arquitectura hexagonal (`server/`).

Al iniciar sesión, la API identifica la institución del usuario y enruta todas sus operaciones al motor correspondiente. La interfaz se ve igual con cualquier motor; abajo a la izquierda aparece el indicador *"Conectado a: Hospital General (PostgreSQL)"*.

## Acceso de demostración

Contraseña de todos los usuarios: `demo123`.

| Usuario | Rol | Institución → motor |
|---|---|---|
| `medico` | médico | Hospital General → PostgreSQL |
| `secretaria` | secretaria | Clínica Odontológica → MySQL |
| `odontologo` | médico | Clínica Odontológica → MySQL |
| `admin` | admin | Laboratorio Clínico → MongoDB |
| `laboratorio` | médico | Laboratorio Clínico → MongoDB |
| `pediatra` | médico | Centro Médico Pediátrico → Firestore |

## Puesta en marcha

Requisitos: Docker con Compose, Node 22 y pnpm 10 (ver `.mise.toml`).

### 1. Bases de datos

```bash
docker compose up -d
```

Levanta PostgreSQL (bases `red_central` y `hospital_general`), MySQL, MongoDB como replica set `rs0` y el emulador de Firestore. La primera vez aplica automáticamente los DDL y los seeds de `server/db/postgres`, `server/db/central` y `server/db/mysql`. El servicio de un solo uso `mongo-init` también se ejecuta solo: inicia el replica set y crea validadores `$jsonSchema`, índices y seed. Es idempotente; para repetirlo:

```bash
docker compose run --rm mongo-init
```

Siembra Firestore (también idempotente; con `--reset` limpia el emulador antes):

```bash
cp server/.env.example server/.env
```

```bash
pnpm --dir server install
```

```bash
pnpm --dir server db:seed:firestore
```

El emulador de Firestore se ejecuta en memoria: después de reiniciar el contenedor `firestore`, vuelva a ejecutar el seed.

Para volver al estado inicial de todas las bases:

```bash
docker compose down -v
```

### 2. Backend

```bash
pnpm --dir server dev
```

La API queda en `http://localhost:4000/api`. Variables en `server/.env.example`:

| Variable | Uso |
|---|---|
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma y vigencia del token (claims `userId`, `role`, `institutionId`) |
| `CENTRAL_DATABASE_URL` | PostgreSQL `red_central`: usuarios, instituciones y bitácora |
| `POSTGRES_URL`, `MYSQL_URL` | Hospital General y Clínica Odontológica |
| `MONGO_URL`, `MONGO_DB` | Laboratorio Clínico (el URL debe incluir `replicaSet=rs0`) |
| `FIREBASE_PROJECT_ID`, `FIRESTORE_EMULATOR_HOST` | Centro Médico Pediátrico |
| `INITIAL_USER_PASSWORD` | Contraseña de los usuarios creados desde Administración |

### 3. Frontend

```bash
cp .env.example .env.local
```

```bash
pnpm install
```

```bash
pnpm dev
```

| Variable | Valor |
|---|---|
| `VITE_USE_MOCKS` | `false` para usar la API. Si no se define, la app usa los datos de `src/mocks` (modo demostración, p. ej. en Figma Make) |
| `VITE_API_URL` | URL base de la API, por defecto `http://localhost:4000/api` |

## Pruebas

Con las bases levantadas y sembradas:

```bash
pnpm --dir server test
```

| Suite | Qué verifica |
|---|---|
| `test/domain.test.ts` | Reglas de negocio puras (DPI, CIE-10, transiciones de estado, disponibilidad, vacunación, RBAC) y el factory abierto a un 5º motor |
| `test/engines.test.ts` | La **misma suite de contrato** contra los 4 motores reales: OP-PAC, OP-CON, OP-FAR, OP-LAB y la **reversión total** cuando falla la receta (Eje B) |
| `test/engine-security.test.ts` | Seguridad aplicada por el propio motor: roles, privilegios por columna y RLS en PostgreSQL; `firestore.rules` en el emulador |
| `test/http.test.ts` | Login (hash, estado, `ultimo_acceso`), JWT y RBAC en la API: la secretaria recibe 403 en información restringida |
| `test/cross-engine.test.ts` | Prueba cruzada 5.4 |

Para ejecutar la prueba cruzada y regenerar `docs/prueba-cruzada.md`:

```bash
pnpm --dir server cross-test
```

Verificación de tipos y compilación:

```bash
pnpm --dir server typecheck
```

```bash
pnpm build
```

Las pruebas crean pacientes con nombre "Prueba …" en las bases de desarrollo. Para limpiar, use `docker compose down -v` y vuelva a sembrar.

## Estructura

```
src/                     Frontend
  services/              Única capa de acceso a datos (mocks o API vía httpClient.ts)
  types/                 Contrato compartido con el backend
  mocks/                 Datos de demostración
server/
  src/domain/            Entidades y reglas de negocio puras (sin drivers)
  src/ports/             Interfaces: IPatientPort, IConsultationPort, IPrescriptionPort, ILabPort, IAuthPort…
  src/application/       Casos de uso (OP-PAC, OP-CON, OP-FAR, OP-LAB, OP-SEC) y autorización
  src/adapters/          postgres/ mysql/ (comparten sql/), mongo/, firestore/, central/, DatabaseAdapterFactory
  src/http/              Controladores, DTOs (zod), JWT, RBAC y presenters
  db/                    DDL, seeds, validadores, firestore.rules
docs/                    diagramas.md (+ diagramas/*.svg), comparativo.md, modelo-nosql.md, prueba-cruzada.md
docker-compose.yml
```

Los componentes y páginas nunca importan `src/mocks`: todo pasa por `src/services`, que conserva sus firmas públicas en ambos modos.

## Documentación

- [`docs/comparativo.md`](docs/comparativo.md): los 4 ejes (modelado, transacciones, RBAC y justificación institución–motor) y las contradicciones entre fuentes resueltas.
- [`docs/diagramas.md`](docs/diagramas.md): diagramas ER y relacional (sedes SQL y base central), modelos documentales de MongoDB y Firestore, arquitectura hexagonal y secuencias de login y transacción, alineados con el sistema implementado.
- [`docs/modelo-nosql.md`](docs/modelo-nosql.md): qué se embebe y qué se referencia en MongoDB y Firestore.
- [`docs/prueba-cruzada.md`](docs/prueba-cruzada.md): resultados de la prueba cruzada.
- [`INSTRUCCIONES_ENTREGA_II.md`](INSTRUCCIONES_ENTREGA_II.md): guía y checklist de la entrega.
