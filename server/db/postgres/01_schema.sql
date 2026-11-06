-- =====================================================================
-- Hospital General (i1) · PostgreSQL · esquema maestro en 3FN.
-- PK subrogadas serial, FKs ON DELETE RESTRICT (borrado lógico vía estado),
-- CHECK en todos los dominios enumerados del diccionario de datos.
-- Extensión documentada: paciente_alergia.reaccion / severidad (la UI las captura).
-- =====================================================================

CREATE TABLE institucion (
  id_institucion serial       PRIMARY KEY,
  nombre         varchar(120) NOT NULL,
  tipo           varchar(50)  NOT NULL CHECK (tipo IN ('hospital', 'clinica', 'laboratorio', 'pediatrico')),
  direccion      text,
  telefono       varchar(15)
);

CREATE TABLE medico (
  id_medico       serial       PRIMARY KEY,
  nombre_completo varchar(100) NOT NULL,
  no_colegiado    varchar(20)  NOT NULL UNIQUE,
  especialidad    varchar(80),
  telefono        varchar(15),
  correo          varchar(100) UNIQUE,
  estado          varchar(20)  NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  id_institucion  integer      NOT NULL REFERENCES institucion ON DELETE RESTRICT
);

CREATE TABLE paciente (
  id_paciente      serial       PRIMARY KEY,
  primer_nombre    varchar(50)  NOT NULL,
  segundo_nombre   varchar(50),
  primer_apellido  varchar(50)  NOT NULL,
  segundo_apellido varchar(50),
  fecha_nacimiento date         NOT NULL,
  sexo             char(1)      NOT NULL CHECK (sexo IN ('m', 'f', 'o')),
  dpi_cui          varchar(20)  NOT NULL UNIQUE,
  telefono         varchar(15),
  correo           varchar(100) UNIQUE,
  direccion        text,
  municipio        varchar(60),
  departamento     varchar(60),
  tipo_sangre      varchar(5)   CHECK (tipo_sangre IN ('a+', 'a-', 'b+', 'b-', 'ab+', 'ab-', 'o+', 'o-')),
  fecha_registro   timestamp    NOT NULL DEFAULT now(),
  estado           varchar(20)  NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'archivado', 'fallecido')),
  id_institucion   integer      NOT NULL REFERENCES institucion ON DELETE RESTRICT
);
CREATE INDEX ix_paciente_institucion ON paciente (id_institucion);

CREATE TABLE paciente_alergia (
  id_paciente_alergia serial       PRIMARY KEY,
  id_paciente         integer      NOT NULL REFERENCES paciente ON DELETE RESTRICT,
  alergia             varchar(100) NOT NULL,
  reaccion            varchar(100),
  severidad           varchar(20)  CHECK (severidad IN ('leve', 'moderada', 'grave')),
  CONSTRAINT uq_paciente_alergia UNIQUE (id_paciente, alergia)
);

CREATE TABLE contacto_emergencia (
  id_contacto          serial       PRIMARY KEY,
  nombre_completo      varchar(100) NOT NULL,
  parentesco           varchar(40)  NOT NULL,
  telefono             varchar(15)  NOT NULL,
  telefono_alternativo varchar(15),
  id_paciente          integer      NOT NULL REFERENCES paciente ON DELETE RESTRICT
);
CREATE INDEX ix_contacto_paciente ON contacto_emergencia (id_paciente);

CREATE TABLE consulta (
  id_consulta     serial      PRIMARY KEY,
  fecha_hora      timestamp   NOT NULL,
  motivo_consulta text        NOT NULL,
  notas_clinicas  text,
  estado          varchar(20) NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada', 'atendida', 'cancelada')),
  id_paciente     integer     NOT NULL REFERENCES paciente ON DELETE RESTRICT,
  id_medico       integer     NOT NULL REFERENCES medico ON DELETE RESTRICT,
  id_institucion  integer     NOT NULL REFERENCES institucion ON DELETE RESTRICT
);
CREATE INDEX ix_consulta_paciente ON consulta (id_paciente, fecha_hora DESC);
-- Respaldo físico de OP-CON-01 (la regla vive en el dominio): un médico no
-- puede tener dos consultas vigentes en el mismo horario.
CREATE UNIQUE INDEX uq_consulta_horario_medico ON consulta (id_medico, fecha_hora) WHERE estado <> 'cancelada';

CREATE TABLE diagnostico (
  id_diagnostico serial      PRIMARY KEY,
  codigo_cie10   varchar(10),
  descripcion    text        NOT NULL,
  tipo           varchar(30) CHECK (tipo IN ('presuntivo', 'definitivo', 'diferencial')),
  fecha          date        NOT NULL,
  id_consulta    integer     NOT NULL REFERENCES consulta ON DELETE RESTRICT
);
CREATE INDEX ix_diagnostico_consulta ON diagnostico (id_consulta);

CREATE TABLE tratamiento (
  id_tratamiento     serial  PRIMARY KEY,
  descripcion        text    NOT NULL,
  fecha_inicio       date    NOT NULL,
  fecha_fin_estimada date,
  observaciones      text,
  id_diagnostico     integer NOT NULL REFERENCES diagnostico ON DELETE RESTRICT,
  CONSTRAINT ck_tratamiento_fechas CHECK (fecha_fin_estimada IS NULL OR fecha_fin_estimada >= fecha_inicio)
);
CREATE INDEX ix_tratamiento_diagnostico ON tratamiento (id_diagnostico);

CREATE TABLE medicamento (
  id_medicamento   serial       PRIMARY KEY,
  nombre_generico  varchar(100) NOT NULL,
  nombre_comercial varchar(100),
  presentacion     varchar(60),
  concentracion    varchar(40)
);

CREATE TABLE receta (
  id_receta      serial      PRIMARY KEY,
  dosis          varchar(50) NOT NULL,
  frecuencia     varchar(50) NOT NULL,
  duracion_dias  integer     CHECK (duracion_dias > 0),
  indicaciones   text,
  id_tratamiento integer     NOT NULL REFERENCES tratamiento ON DELETE RESTRICT,
  id_medicamento integer     NOT NULL REFERENCES medicamento ON DELETE RESTRICT
);
CREATE INDEX ix_receta_tratamiento ON receta (id_tratamiento);

CREATE TABLE tipo_examen (
  id_tipo_examen serial       PRIMARY KEY,
  nombre         varchar(100) NOT NULL,
  descripcion    text
);

CREATE TABLE examen (
  id_examen       serial      PRIMARY KEY,
  fecha_solicitud timestamp   NOT NULL DEFAULT now(),
  estado          varchar(20) NOT NULL DEFAULT 'solicitado' CHECK (estado IN ('solicitado', 'en_proceso', 'completado')),
  id_consulta     integer     NOT NULL REFERENCES consulta ON DELETE RESTRICT,
  id_tipo_examen  integer     NOT NULL REFERENCES tipo_examen ON DELETE RESTRICT
);
CREATE INDEX ix_examen_consulta ON examen (id_consulta);

-- valor_obtenido = '' marca un parámetro solicitado aún sin resultado.
CREATE TABLE resultado_examen (
  id_resultado     serial      PRIMARY KEY,
  parametro        varchar(80) NOT NULL,
  valor_obtenido   varchar(50) NOT NULL,
  rango_referencia varchar(50),
  observaciones    text,
  id_examen        integer     NOT NULL REFERENCES examen ON DELETE RESTRICT
);
CREATE INDEX ix_resultado_examen ON resultado_examen (id_examen);

CREATE TABLE registro_crecimiento (
  id_registro        serial       PRIMARY KEY,
  fecha_medicion     date         NOT NULL,
  peso_kg            numeric(5,2) NOT NULL CHECK (peso_kg > 0),
  talla_cm           numeric(5,2) NOT NULL CHECK (talla_cm > 0),
  perimetro_cefalico numeric(5,2) CHECK (perimetro_cefalico > 0),
  id_consulta        integer      NOT NULL REFERENCES consulta ON DELETE RESTRICT
);

CREATE TABLE vacuna (
  id_vacuna        serial       PRIMARY KEY,
  nombre_vacuna    varchar(100) NOT NULL,
  dosis_requeridas integer      NOT NULL CHECK (dosis_requeridas > 0)
);

CREATE TABLE esquema_vacunacion (
  id_esquema       serial      PRIMARY KEY,
  no_dosis         integer     NOT NULL CHECK (no_dosis > 0),
  fecha_aplicacion date        NOT NULL,
  lote             varchar(30),
  id_consulta      integer     NOT NULL REFERENCES consulta ON DELETE RESTRICT,
  id_vacuna        integer     NOT NULL REFERENCES vacuna ON DELETE RESTRICT
);

CREATE TABLE internamiento (
  id_internamiento serial      PRIMARY KEY,
  fecha_ingreso    timestamp   NOT NULL,
  fecha_egreso     timestamp,
  numero_cama      varchar(20),
  motivo_ingreso   text        NOT NULL,
  id_consulta      integer     NOT NULL REFERENCES consulta ON DELETE RESTRICT,
  CONSTRAINT ck_internamiento_fechas CHECK (fecha_egreso IS NULL OR fecha_egreso >= fecha_ingreso)
);
CREATE INDEX ix_internamiento_consulta ON internamiento (id_consulta);
