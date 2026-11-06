-- Seed Hospital General (i1). Datos equivalentes a src/mocks/data.ts para esta sede.
-- DPI/CUI se almacena normalizado (13 dígitos); la API lo presenta con espacios.

INSERT INTO institucion (id_institucion, nombre, tipo, direccion, telefono) VALUES
  (1, 'Hospital General', 'hospital', 'Zona 1, Ciudad de Guatemala', '2200-1000');

INSERT INTO medico (id_medico, nombre_completo, no_colegiado, especialidad, telefono, correo, estado, id_institucion) VALUES
  (1, 'Dra. Ana Lucía Méndez', 'COL-10234', 'Medicina interna', '5555-1001', 'ana.mendez@hospital.gt', 'activo', 1);

INSERT INTO medicamento (id_medicamento, nombre_generico, nombre_comercial, presentacion, concentracion) VALUES
  (1, 'Paracetamol',   'Panadol', 'Tableta oral', '500 mg'),
  (2, 'Amoxicilina',   'Amoxil',  'Cápsula oral', '500 mg'),
  (3, 'Atorvastatina', 'Lipitor', 'Tableta oral', '20 mg');
INSERT INTO vacuna (id_vacuna, nombre_vacuna, dosis_requeridas) VALUES
  (1, 'BCG', 1), (2, 'Pentavalente', 3), (3, 'Influenza', 1);
INSERT INTO tipo_examen (id_tipo_examen, nombre, descripcion) VALUES
  (1, 'Hematología completa', '8 parámetros'),
  (2, 'Perfil lipídico',      '4 parámetros'),
  (3, 'Glucosa en ayunas',    '1 parámetro');

INSERT INTO paciente (id_paciente, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento, sexo, dpi_cui,
                      telefono, correo, direccion, municipio, departamento, tipo_sangre, fecha_registro, estado, id_institucion) VALUES
  (1, 'Lucía',  'Fernanda', 'López',   'García', '2001-05-14', 'f', '2784102930101', '5555-0182', 'lucia.lopez@correo.gt',   'Zona 10, Ciudad de Guatemala', 'Guatemala', 'Guatemala', 'o+', '2025-01-10 08:00', 'activo',    1),
  (2, 'Mateo',  'José',     'Ramírez', 'Soto',   '1988-11-02', 'm', '1942773810101', '5555-0182', 'mateo.ramirez@correo.gt', 'Zona 10, Ciudad de Guatemala', 'Guatemala', 'Guatemala', 'o+', '2025-01-12 08:00', 'activo',    1),
  (3, 'Elena',  'María',    'Cabrera', 'Vega',   '1965-12-26', 'f', '1459210040101', '5555-0182', 'elena.cabrera@correo.gt', 'Zona 10, Ciudad de Guatemala', 'Guatemala', 'Guatemala', 'o+', '2025-01-15 08:00', 'archivado', 1);

INSERT INTO paciente_alergia (id_paciente, alergia, reaccion, severidad) VALUES
  (1, 'Penicilina', 'Urticaria', 'moderada'),
  (2, 'Penicilina', 'Urticaria', 'moderada'),
  (3, 'Penicilina', 'Urticaria', 'moderada');
INSERT INTO contacto_emergencia (nombre_completo, parentesco, telefono, id_paciente) VALUES
  ('Andrea López', 'Hermana', '5555-0199', 1),
  ('Andrea López', 'Hermana', '5555-0199', 2),
  ('Andrea López', 'Hermana', '5555-0199', 3);

INSERT INTO consulta (id_consulta, fecha_hora, motivo_consulta, notas_clinicas, estado, id_paciente, id_medico, id_institucion) VALUES
  (1, '2025-11-03 07:30', 'Dificultad respiratoria', 'Fiebre y estertores en base derecha. Se ordena ingreso.', 'atendida', 2, 1, 1),
  (2, '2026-01-18 10:00', 'Control metabólico', 'Paciente estable. Se refuerzan hábitos saludables.', 'atendida', 2, 1, 1),
  (3, '2026-02-10 09:00', 'Cefalea recurrente', 'Dolor frontal de intensidad moderada, sin signos de alarma.', 'atendida', 1, 1, 1),
  (4, '2026-03-23 09:30', 'Fatiga y palidez', 'Se solicita hematología completa.', 'atendida', 1, 1, 1),
  (5, '2026-03-24 08:30', 'Control de presión arterial', NULL, 'programada', 1, 1, 1),
  (6, '2026-03-24 10:00', 'Dolor abdominal', NULL, 'programada', 2, 1, 1),
  (7, '2026-03-24 11:30', 'Seguimiento', NULL, 'atendida', 3, 1, 1);

INSERT INTO diagnostico (id_diagnostico, codigo_cie10, descripcion, tipo, fecha, id_consulta) VALUES
  (1, 'J18.9', 'Neumonía adquirida en comunidad', 'definitivo', '2025-11-03', 1),
  (2, 'E78.5', 'Hiperlipidemia', 'definitivo', '2026-01-18', 2),
  (3, 'G44.2', 'Cefalea tensional', 'definitivo', '2026-02-10', 3);
INSERT INTO tratamiento (id_tratamiento, descripcion, fecha_inicio, fecha_fin_estimada, id_diagnostico) VALUES
  (1, 'Plan terapéutico: Hiperlipidemia', '2026-01-18', '2026-02-17', 2),
  (2, 'Plan terapéutico: Cefalea tensional', '2026-02-10', '2026-02-15', 3);
INSERT INTO receta (dosis, frecuencia, duracion_dias, indicaciones, id_tratamiento, id_medicamento) VALUES
  ('1 tableta', 'Cada noche',    30, 'Continuar hasta próxima evaluación.', 1, 3),
  ('1 tableta', 'Cada 8 horas',  5,  'Tomar después de alimentos si hay dolor.', 2, 1);

INSERT INTO internamiento (fecha_ingreso, fecha_egreso, numero_cama, motivo_ingreso, id_consulta) VALUES
  ('2025-11-03 09:00', '2025-11-08 12:00', 'M-204', 'Neumonía adquirida en comunidad', 1);

INSERT INTO examen (id_examen, fecha_solicitud, estado, id_consulta, id_tipo_examen) VALUES
  (1048, '2026-03-23 09:45', 'en_proceso', 4, 1),
  (1049, '2026-03-24 07:00', 'solicitado', 2, 3);
INSERT INTO resultado_examen (parametro, valor_obtenido, rango_referencia, id_examen) VALUES
  ('Hemoglobina', '', '12–16 g/dL', 1048),
  ('Leucocitos',  '', '4.5–11 x10³/µL', 1048),
  ('Glucosa',     '', '70–100 mg/dL', 1049);

-- Ajuste de secuencias tras ids explícitos
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name, column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_default LIKE 'nextval%' LOOP
    EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, %L), GREATEST((SELECT COALESCE(max(%I), 0) FROM %I), 1))',
                   r.table_name, r.column_name, r.column_name, r.table_name);
  END LOOP;
END $$;
