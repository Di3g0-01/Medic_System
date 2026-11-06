-- =====================================================================
-- Base central "red_central" (PostgreSQL) — directorio de seguridad.
--
-- Por qué central: OP-SEC-02 exige conocer la institución ANTES de elegir
-- motor; si los usuarios vivieran en cada motor, el login tendría que
-- consultar los 4. Se aloja en PostgreSQL por ACID (bloqueos, último
-- acceso) y unicidad global de nombre_usuario.
--
-- Desviaciones documentadas respecto al diccionario (Entrega I):
--   * usuario.nombre_completo: la UI muestra el nombre de secretarias y
--     admins, que no tienen registro en "medico".
--   * usuario.id_medico es varchar(40) y referencia LÓGICA (sin FK): el
--     médico vive en el motor de su institución (entero en SQL, ObjectId
--     en Mongo, id de documento en Firestore). Por eso la unicidad es
--     (id_institucion, id_medico) y no id_medico solo.
-- =====================================================================

CREATE TABLE institucion (
  id_institucion serial       PRIMARY KEY,
  nombre         varchar(120) NOT NULL,
  tipo           varchar(50)  NOT NULL CHECK (tipo IN ('hospital', 'clinica', 'laboratorio', 'pediatrico')),
  direccion      text,
  telefono       varchar(15)
);

CREATE TABLE usuario (
  id_usuario      serial       PRIMARY KEY,
  nombre_usuario  varchar(60)  NOT NULL UNIQUE,
  contrasena_hash varchar(255) NOT NULL,
  nombre_completo varchar(100) NOT NULL,
  rol             varchar(30)  NOT NULL CHECK (rol IN ('medico', 'secretaria', 'admin')),
  estado          varchar(20)  NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'bloqueado', 'inactivo')),
  ultimo_acceso   timestamp,
  id_institucion  integer      NOT NULL REFERENCES institucion (id_institucion) ON DELETE RESTRICT,
  id_medico       varchar(40),
  CONSTRAINT uq_usuario_medico UNIQUE (id_institucion, id_medico),
  CONSTRAINT ck_usuario_medico CHECK (rol = 'medico' OR id_medico IS NULL)
);
CREATE INDEX ix_usuario_institucion ON usuario (id_institucion);

-- Bitácora de auditoría (PDF §6, rol administrador).
CREATE TABLE bitacora_auditoria (
  id_bitacora    bigserial    PRIMARY KEY,
  fecha_hora     timestamp    NOT NULL DEFAULT now(),
  id_usuario     integer      REFERENCES usuario (id_usuario) ON DELETE RESTRICT,
  id_institucion integer      REFERENCES institucion (id_institucion) ON DELETE RESTRICT,
  accion         varchar(60)  NOT NULL,
  entidad        varchar(60),
  id_entidad     varchar(40),
  detalle        jsonb
);
CREATE INDEX ix_bitacora_fecha ON bitacora_auditoria (fecha_hora DESC);

GRANT CONNECT ON DATABASE red_central TO rc_app;
-- El rol de aplicación es NOINHERIT; en la base central se le otorga directamente.
GRANT SELECT, INSERT, UPDATE ON institucion, usuario, bitacora_auditoria TO rc_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO rc_app;
