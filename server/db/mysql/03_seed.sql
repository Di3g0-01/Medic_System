-- Seed Clínica Odontológica (i2). Pacientes p3 y p8 de los mocks.
SET NAMES utf8mb4;

INSERT INTO institucion (id_institucion, nombre, tipo, direccion, telefono) VALUES
  (2, 'Clínica Odontológica', 'clinica', 'Zona 10, Ciudad de Guatemala', '2200-2000');

INSERT INTO medico (id_medico, nombre_completo, no_colegiado, especialidad, telefono, correo, estado, id_institucion) VALUES
  (1, 'Dr. Andrés Castillo', 'COL-20411', 'Odontología general', '5555-2001', 'andres.castillo@clinica.gt', 'activo', 2);

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
  (1, 'Valeria', 'Isabel',   'Castillo', 'Ruiz', '1994-07-19', 'f', '3021490270101', '5555-0182', 'valeria.castillo@correo.gt', 'Zona 10, Ciudad de Guatemala', 'Guatemala', 'Guatemala', 'o+', '2025-02-01 08:00', 'activo', 2),
  (2, 'Daniel',  'Estuardo', 'Vásquez',  'Lima', '1999-06-05', 'm', '2890115720101', '5555-0182', 'daniel.vasquez@correo.gt',   'Zona 10, Ciudad de Guatemala', 'Guatemala', 'Guatemala', 'o+', '2025-02-03 08:00', 'activo', 2);

INSERT INTO paciente_alergia (id_paciente, alergia, reaccion, severidad) VALUES
  (1, 'Penicilina', 'Urticaria', 'moderada'),
  (2, 'Penicilina', 'Urticaria', 'moderada');
INSERT INTO contacto_emergencia (nombre_completo, parentesco, telefono, id_paciente) VALUES
  ('Andrea López', 'Hermana', '5555-0199', 1),
  ('Andrea López', 'Hermana', '5555-0199', 2);

INSERT INTO consulta (id_consulta, fecha_hora, motivo_consulta, notas_clinicas, estado, id_paciente, id_medico, id_institucion) VALUES
  (1, '2026-03-15 10:00', 'Dolor dental', 'Caries en pieza 36, sin compromiso pulpar.', 'atendida', 2, 1, 2),
  (2, '2026-03-20 15:00', 'Revisión de ortodoncia', 'Ajuste de brackets sin complicaciones.', 'atendida', 1, 1, 2),
  (3, '2026-03-25 14:00', 'Limpieza dental', NULL, 'cancelada', 1, 1, 2);

INSERT INTO diagnostico (id_diagnostico, codigo_cie10, descripcion, tipo, fecha, id_consulta) VALUES
  (1, 'K02.1', 'Caries de la dentina', 'definitivo', '2026-03-15', 1);
INSERT INTO tratamiento (id_tratamiento, descripcion, fecha_inicio, fecha_fin_estimada, id_diagnostico) VALUES
  (1, 'Plan terapéutico: Caries de la dentina', '2026-03-15', '2026-03-18', 1);
INSERT INTO receta (dosis, frecuencia, duracion_dias, indicaciones, id_tratamiento, id_medicamento) VALUES
  ('1 tableta', 'Cada 8 horas', 3, 'Solo si hay dolor.', 1, 1);
