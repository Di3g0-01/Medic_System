-- =====================================================================
-- Clínica Odontológica · vistas restringidas (Eje C).
-- El adaptador MySQL lee la agenda de secretaría/admin SOLO desde v_agenda,
-- que no expone notas_clinicas; diagnósticos y recetas no tienen vista
-- confidencial. El historial farmacoterapéutico (OP-FAR-04) es solo médico.
-- =====================================================================

CREATE SQL SECURITY INVOKER VIEW v_agenda AS
SELECT c.id_consulta, c.fecha_hora, c.motivo_consulta, c.estado, c.id_paciente, c.id_medico, c.id_institucion,
       m.nombre_completo AS nombre_medico
FROM consulta c
JOIN medico m ON m.id_medico = c.id_medico;

CREATE SQL SECURITY INVOKER VIEW v_historial_farmacoterapeutico AS
SELECT c.id_paciente, c.id_consulta, c.fecha_hora, d.id_diagnostico, d.codigo_cie10, d.descripcion AS diagnostico,
       t.id_tratamiento, t.descripcion AS tratamiento, t.fecha_inicio, t.fecha_fin_estimada,
       r.id_receta, r.dosis, r.frecuencia, r.duracion_dias, r.indicaciones,
       md.id_medicamento, md.nombre_generico, md.concentracion, md.presentacion
FROM consulta c
JOIN diagnostico d ON d.id_consulta = c.id_consulta
JOIN tratamiento t ON t.id_diagnostico = d.id_diagnostico
JOIN receta r ON r.id_tratamiento = t.id_tratamiento
JOIN medicamento md ON md.id_medicamento = r.id_medicamento;
