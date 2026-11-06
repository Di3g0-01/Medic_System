-- Seed del directorio central. Contraseña de todos los usuarios demo: demo123 (bcrypt, cost 10).
INSERT INTO institucion (id_institucion, nombre, tipo, direccion, telefono) VALUES
  (1, 'Hospital General',         'hospital',    'Zona 1, Ciudad de Guatemala',  '2200-1000'),
  (2, 'Clínica Odontológica',     'clinica',     'Zona 10, Ciudad de Guatemala', '2200-2000'),
  (3, 'Laboratorio Clínico',      'laboratorio', 'Zona 9, Ciudad de Guatemala',  '2200-3000'),
  (4, 'Centro Médico Pediátrico', 'pediatrico',  'Zona 15, Ciudad de Guatemala', '2200-4000');
SELECT setval('institucion_id_institucion_seq', 4);

-- id_medico apunta al médico en el motor de cada institución:
--   i1 PostgreSQL → 1 · i2 MySQL → 1 · i3 MongoDB → ObjectId · i4 Firestore → id de documento
INSERT INTO usuario (id_usuario, nombre_usuario, contrasena_hash, nombre_completo, rol, estado, id_institucion, id_medico) VALUES
  (1, 'medico',      '$2b$10$LTQ0/oPwj7MKO73kyHsLMOWyQCVnT7/LgcN.iCmaD4hBsg9qpxv1e', 'Dra. Ana Lucía Méndez', 'medico',     'activo', 1, '1'),
  (2, 'secretaria',  '$2b$10$LTQ0/oPwj7MKO73kyHsLMOWyQCVnT7/LgcN.iCmaD4hBsg9qpxv1e', 'María José Pineda',     'secretaria', 'activo', 2, NULL),
  (3, 'admin',       '$2b$10$LTQ0/oPwj7MKO73kyHsLMOWyQCVnT7/LgcN.iCmaD4hBsg9qpxv1e', 'Carlos Roberto León',   'admin',      'activo', 3, NULL),
  (4, 'pediatra',    '$2b$10$LTQ0/oPwj7MKO73kyHsLMOWyQCVnT7/LgcN.iCmaD4hBsg9qpxv1e', 'Dra. Sofía Herrera',    'medico',     'activo', 4, 'medico-sofia-herrera'),
  (5, 'laboratorio', '$2b$10$LTQ0/oPwj7MKO73kyHsLMOWyQCVnT7/LgcN.iCmaD4hBsg9qpxv1e', 'Dr. Diego Morales',     'medico',     'activo', 3, '665f00000000000000000001'),
  (6, 'odontologo',  '$2b$10$LTQ0/oPwj7MKO73kyHsLMOWyQCVnT7/LgcN.iCmaD4hBsg9qpxv1e', 'Dr. Andrés Castillo',   'medico',     'activo', 2, '1');
SELECT setval('usuario_id_usuario_seq', 6);
