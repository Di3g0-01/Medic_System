-- =====================================================================
-- Hospital General · RBAC en el motor (Eje C).
--   rc_app (LOGIN, NOINHERIT) no tiene privilegios propios: cada operación
--   del adaptador ejecuta  SET LOCAL ROLE rc_<rol>  y
--   SET LOCAL app.id_institucion = <id>  dentro de su transacción.
--   * Privilegios por columna: rc_secretaria / rc_admin NO pueden leer
--     consulta.notas_clinicas ni tabla clínica alguna (diagnóstico,
--     tratamiento, receta, exámenes, antropometría, internamiento).
--   * RLS: cada fila con id_institucion solo es visible para la sede de la sesión.
--   * Nadie tiene DELETE: el archivado es lógico (OP-PAC-05).
-- =====================================================================

CREATE ROLE rc_medico NOLOGIN;
CREATE ROLE rc_secretaria NOLOGIN;
CREATE ROLE rc_admin NOLOGIN;
GRANT rc_medico, rc_secretaria, rc_admin TO rc_app;

GRANT CONNECT ON DATABASE hospital_general TO rc_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO rc_medico, rc_secretaria, rc_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rc_medico, rc_secretaria, rc_admin;

-- Información pública (catálogos, sede, médicos)
GRANT SELECT ON institucion, medico, medicamento, vacuna, tipo_examen TO rc_medico, rc_secretaria, rc_admin;

-- Médico: acceso clínico completo (sin DELETE).
GRANT SELECT, INSERT, UPDATE ON
  paciente, paciente_alergia, contacto_emergencia, consulta, diagnostico, tratamiento, receta,
  examen, resultado_examen, registro_crecimiento, esquema_vacunacion, internamiento
TO rc_medico;

-- Secretaría: datos confidenciales del paciente y agenda; nada restringido.
GRANT SELECT, INSERT, UPDATE ON paciente, paciente_alergia, contacto_emergencia TO rc_secretaria;
GRANT SELECT (id_consulta, fecha_hora, motivo_consulta, estado, id_paciente, id_medico, id_institucion) ON consulta TO rc_secretaria;
GRANT INSERT (fecha_hora, motivo_consulta, estado, id_paciente, id_medico, id_institucion) ON consulta TO rc_secretaria;
GRANT UPDATE (fecha_hora, motivo_consulta, estado, id_medico) ON consulta TO rc_secretaria;

-- Administrador: catálogos y perfiles de médico; lectura confidencial; sin historial clínico.
GRANT INSERT, UPDATE ON medicamento, vacuna, tipo_examen, medico TO rc_admin;
GRANT SELECT ON paciente, paciente_alergia, contacto_emergencia TO rc_admin;
GRANT SELECT (id_consulta, fecha_hora, motivo_consulta, estado, id_paciente, id_medico, id_institucion) ON consulta TO rc_admin;

-- Row Level Security por institución
ALTER TABLE paciente ENABLE ROW LEVEL SECURITY;
ALTER TABLE consulta ENABLE ROW LEVEL SECURITY;
ALTER TABLE medico   ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_paciente_sede ON paciente USING (id_institucion = current_setting('app.id_institucion', true)::int)
  WITH CHECK (id_institucion = current_setting('app.id_institucion', true)::int);
CREATE POLICY p_consulta_sede ON consulta USING (id_institucion = current_setting('app.id_institucion', true)::int)
  WITH CHECK (id_institucion = current_setting('app.id_institucion', true)::int);
CREATE POLICY p_medico_sede ON medico USING (id_institucion = current_setting('app.id_institucion', true)::int)
  WITH CHECK (id_institucion = current_setting('app.id_institucion', true)::int);

-- Vista restringida de agenda: sin notas clínicas. security_invoker aplica RLS y privilegios de quien consulta.
CREATE VIEW v_agenda WITH (security_invoker = true) AS
SELECT c.id_consulta, c.fecha_hora, c.motivo_consulta, c.estado, c.id_paciente, c.id_medico, c.id_institucion,
       m.nombre_completo AS nombre_medico
FROM consulta c
JOIN medico m ON m.id_medico = c.id_medico;
GRANT SELECT ON v_agenda TO rc_medico, rc_secretaria, rc_admin;

-- OP-FAR-04: historial farmacoterapéutico (solo médicos).
CREATE VIEW v_historial_farmacoterapeutico WITH (security_invoker = true) AS
SELECT c.id_paciente, c.id_consulta, c.fecha_hora, d.id_diagnostico, d.codigo_cie10, d.descripcion AS diagnostico,
       t.id_tratamiento, t.descripcion AS tratamiento, t.fecha_inicio, t.fecha_fin_estimada,
       r.id_receta, r.dosis, r.frecuencia, r.duracion_dias, r.indicaciones,
       md.id_medicamento, md.nombre_generico, md.concentracion, md.presentacion
FROM consulta c
JOIN diagnostico d ON d.id_consulta = c.id_consulta
JOIN tratamiento t ON t.id_diagnostico = d.id_diagnostico
JOIN receta r ON r.id_tratamiento = t.id_tratamiento
JOIN medicamento md ON md.id_medicamento = r.id_medicamento;
GRANT SELECT ON v_historial_farmacoterapeutico TO rc_medico;
