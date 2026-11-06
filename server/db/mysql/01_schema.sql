-- =====================================================================
-- Clínica Odontológica (i2) · MySQL 8.4 · esquema maestro en 3FN (InnoDB).
-- Mismo modelo que PostgreSQL: PK subrogadas AUTO_INCREMENT, FKs
-- ON DELETE RESTRICT y CHECK (aplicados desde MySQL 8.0.16).
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE institucion (
  id_institucion INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL,
  tipo           VARCHAR(50)  NOT NULL,
  direccion      TEXT,
  telefono       VARCHAR(15),
  CONSTRAINT ck_institucion_tipo CHECK (tipo IN ('hospital', 'clinica', 'laboratorio', 'pediatrico'))
) ENGINE = InnoDB;

CREATE TABLE medico (
  id_medico       INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre_completo VARCHAR(100) NOT NULL,
  no_colegiado    VARCHAR(20)  NOT NULL UNIQUE,
  especialidad    VARCHAR(80),
  telefono        VARCHAR(15),
  correo          VARCHAR(100) UNIQUE,
  estado          VARCHAR(20)  NOT NULL DEFAULT 'activo',
  id_institucion  INT          NOT NULL,
  CONSTRAINT ck_medico_estado CHECK (estado IN ('activo', 'inactivo')),
  CONSTRAINT fk_medico_institucion FOREIGN KEY (id_institucion) REFERENCES institucion (id_institucion) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE paciente (
  id_paciente      INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  primer_nombre    VARCHAR(50)  NOT NULL,
  segundo_nombre   VARCHAR(50),
  primer_apellido  VARCHAR(50)  NOT NULL,
  segundo_apellido VARCHAR(50),
  fecha_nacimiento DATE         NOT NULL,
  sexo             CHAR(1)      NOT NULL,
  dpi_cui          VARCHAR(20)  NOT NULL UNIQUE,
  telefono         VARCHAR(15),
  correo           VARCHAR(100) UNIQUE,
  direccion        TEXT,
  municipio        VARCHAR(60),
  departamento     VARCHAR(60),
  tipo_sangre      VARCHAR(5),
  fecha_registro   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado           VARCHAR(20)  NOT NULL DEFAULT 'activo',
  id_institucion   INT          NOT NULL,
  CONSTRAINT ck_paciente_sexo CHECK (sexo IN ('m', 'f', 'o')),
  CONSTRAINT ck_paciente_sangre CHECK (tipo_sangre IN ('a+', 'a-', 'b+', 'b-', 'ab+', 'ab-', 'o+', 'o-')),
  CONSTRAINT ck_paciente_estado CHECK (estado IN ('activo', 'archivado', 'fallecido')),
  CONSTRAINT fk_paciente_institucion FOREIGN KEY (id_institucion) REFERENCES institucion (id_institucion) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE paciente_alergia (
  id_paciente_alergia INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_paciente         INT          NOT NULL,
  alergia             VARCHAR(100) NOT NULL,
  reaccion            VARCHAR(100),
  severidad           VARCHAR(20),
  CONSTRAINT uq_paciente_alergia UNIQUE (id_paciente, alergia),
  CONSTRAINT ck_alergia_severidad CHECK (severidad IN ('leve', 'moderada', 'grave')),
  CONSTRAINT fk_alergia_paciente FOREIGN KEY (id_paciente) REFERENCES paciente (id_paciente) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE contacto_emergencia (
  id_contacto          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre_completo      VARCHAR(100) NOT NULL,
  parentesco           VARCHAR(40)  NOT NULL,
  telefono             VARCHAR(15)  NOT NULL,
  telefono_alternativo VARCHAR(15),
  id_paciente          INT          NOT NULL,
  CONSTRAINT fk_contacto_paciente FOREIGN KEY (id_paciente) REFERENCES paciente (id_paciente) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE consulta (
  id_consulta     INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  fecha_hora      DATETIME    NOT NULL,
  motivo_consulta TEXT        NOT NULL,
  notas_clinicas  TEXT,
  estado          VARCHAR(20) NOT NULL DEFAULT 'programada',
  id_paciente     INT         NOT NULL,
  id_medico       INT         NOT NULL,
  id_institucion  INT         NOT NULL,
  -- MySQL no tiene índices parciales: columna generada NULL para canceladas
  -- (los NULL no colisionan en UNIQUE) como respaldo físico de OP-CON-01.
  horario_vigente TINYINT AS (IF(estado <> 'cancelada', 1, NULL)) STORED,
  CONSTRAINT ck_consulta_estado CHECK (estado IN ('programada', 'atendida', 'cancelada')),
  CONSTRAINT uq_consulta_horario_medico UNIQUE (id_medico, fecha_hora, horario_vigente),
  CONSTRAINT fk_consulta_paciente FOREIGN KEY (id_paciente) REFERENCES paciente (id_paciente) ON DELETE RESTRICT,
  CONSTRAINT fk_consulta_medico FOREIGN KEY (id_medico) REFERENCES medico (id_medico) ON DELETE RESTRICT,
  CONSTRAINT fk_consulta_institucion FOREIGN KEY (id_institucion) REFERENCES institucion (id_institucion) ON DELETE RESTRICT,
  INDEX ix_consulta_paciente (id_paciente, fecha_hora)
) ENGINE = InnoDB;

CREATE TABLE diagnostico (
  id_diagnostico INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  codigo_cie10   VARCHAR(10),
  descripcion    TEXT        NOT NULL,
  tipo           VARCHAR(30),
  fecha          DATE        NOT NULL,
  id_consulta    INT         NOT NULL,
  CONSTRAINT ck_diagnostico_tipo CHECK (tipo IN ('presuntivo', 'definitivo', 'diferencial')),
  CONSTRAINT fk_diagnostico_consulta FOREIGN KEY (id_consulta) REFERENCES consulta (id_consulta) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE tratamiento (
  id_tratamiento     INT  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  descripcion        TEXT NOT NULL,
  fecha_inicio       DATE NOT NULL,
  fecha_fin_estimada DATE,
  observaciones      TEXT,
  id_diagnostico     INT  NOT NULL,
  CONSTRAINT ck_tratamiento_fechas CHECK (fecha_fin_estimada IS NULL OR fecha_fin_estimada >= fecha_inicio),
  CONSTRAINT fk_tratamiento_diagnostico FOREIGN KEY (id_diagnostico) REFERENCES diagnostico (id_diagnostico) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE medicamento (
  id_medicamento   INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre_generico  VARCHAR(100) NOT NULL,
  nombre_comercial VARCHAR(100),
  presentacion     VARCHAR(60),
  concentracion    VARCHAR(40)
) ENGINE = InnoDB;

CREATE TABLE receta (
  id_receta      INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dosis          VARCHAR(50) NOT NULL,
  frecuencia     VARCHAR(50) NOT NULL,
  duracion_dias  INT,
  indicaciones   TEXT,
  id_tratamiento INT         NOT NULL,
  id_medicamento INT         NOT NULL,
  CONSTRAINT ck_receta_duracion CHECK (duracion_dias > 0),
  CONSTRAINT fk_receta_tratamiento FOREIGN KEY (id_tratamiento) REFERENCES tratamiento (id_tratamiento) ON DELETE RESTRICT,
  CONSTRAINT fk_receta_medicamento FOREIGN KEY (id_medicamento) REFERENCES medicamento (id_medicamento) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE tipo_examen (
  id_tipo_examen INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  descripcion    TEXT
) ENGINE = InnoDB;

CREATE TABLE examen (
  id_examen       INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  fecha_solicitud DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado          VARCHAR(20) NOT NULL DEFAULT 'solicitado',
  id_consulta     INT         NOT NULL,
  id_tipo_examen  INT         NOT NULL,
  CONSTRAINT ck_examen_estado CHECK (estado IN ('solicitado', 'en_proceso', 'completado')),
  CONSTRAINT fk_examen_consulta FOREIGN KEY (id_consulta) REFERENCES consulta (id_consulta) ON DELETE RESTRICT,
  CONSTRAINT fk_examen_tipo FOREIGN KEY (id_tipo_examen) REFERENCES tipo_examen (id_tipo_examen) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE resultado_examen (
  id_resultado     INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  parametro        VARCHAR(80) NOT NULL,
  valor_obtenido   VARCHAR(50) NOT NULL,
  rango_referencia VARCHAR(50),
  observaciones    TEXT,
  id_examen        INT         NOT NULL,
  CONSTRAINT fk_resultado_examen FOREIGN KEY (id_examen) REFERENCES examen (id_examen) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE registro_crecimiento (
  id_registro        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  fecha_medicion     DATE         NOT NULL,
  peso_kg            DECIMAL(5,2) NOT NULL,
  talla_cm           DECIMAL(5,2) NOT NULL,
  perimetro_cefalico DECIMAL(5,2),
  id_consulta        INT          NOT NULL,
  CONSTRAINT ck_crecimiento_valores CHECK (peso_kg > 0 AND talla_cm > 0 AND (perimetro_cefalico IS NULL OR perimetro_cefalico > 0)),
  CONSTRAINT fk_crecimiento_consulta FOREIGN KEY (id_consulta) REFERENCES consulta (id_consulta) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE vacuna (
  id_vacuna        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre_vacuna    VARCHAR(100) NOT NULL,
  dosis_requeridas INT          NOT NULL,
  CONSTRAINT ck_vacuna_dosis CHECK (dosis_requeridas > 0)
) ENGINE = InnoDB;

CREATE TABLE esquema_vacunacion (
  id_esquema       INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  no_dosis         INT         NOT NULL,
  fecha_aplicacion DATE        NOT NULL,
  lote             VARCHAR(30),
  id_consulta      INT         NOT NULL,
  id_vacuna        INT         NOT NULL,
  CONSTRAINT ck_esquema_dosis CHECK (no_dosis > 0),
  CONSTRAINT fk_esquema_consulta FOREIGN KEY (id_consulta) REFERENCES consulta (id_consulta) ON DELETE RESTRICT,
  CONSTRAINT fk_esquema_vacuna FOREIGN KEY (id_vacuna) REFERENCES vacuna (id_vacuna) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE internamiento (
  id_internamiento INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  fecha_ingreso    DATETIME    NOT NULL,
  fecha_egreso     DATETIME,
  numero_cama      VARCHAR(20),
  motivo_ingreso   TEXT        NOT NULL,
  id_consulta      INT         NOT NULL,
  CONSTRAINT ck_internamiento_fechas CHECK (fecha_egreso IS NULL OR fecha_egreso >= fecha_ingreso),
  CONSTRAINT fk_internamiento_consulta FOREIGN KEY (id_consulta) REFERENCES consulta (id_consulta) ON DELETE RESTRICT
) ENGINE = InnoDB;
