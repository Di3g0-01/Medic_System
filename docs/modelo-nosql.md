# Modelo documental — MongoDB (Laboratorio Clínico) y Firestore (Centro Médico Pediátrico)

> Criterio rector (INSTRUCCIONES §4): un paciente acumula cientos de consultas y análisis en décadas. Lo que crece sin límite se **referencia**; lo acotado y de ciclo de vida acoplado se **embebe**. Límites físicos: 16 MB por documento BSON y 1 MiB por documento Firestore.

## Tabla embeber vs. referenciar (implementada)

| Entidad relacional | MongoDB (`laboratorio_clinico`) | Firestore (`demo-red-clinica`) | Justificación |
|---|---|---|---|
| `paciente_alergia` | **Embebida**: `pacientes.alergias[]` `{alergia, reaccion, severidad}` | **Embebida**: `pacientes/{id}.alergias[]` | Volumen acotado (≤ 15) y lectura obligatoria al abrir la ficha. Un solo documento da atomicidad nativa al alta (OP-PAC-01). |
| `contacto_emergencia` | **Embebida**: `pacientes.contactos_emergencia[]` | **Embebida**: `pacientes/{id}.contactos_emergencia[]` | Relación 1:pocos y ciclo de vida dependiente: nunca se consultan aisladas. OP-PAC-02 usa `$push` / `arrayUnion`. |
| `consulta` | **Referenciada**: colección `consultas` con `id_paciente` (ObjectId) | **Referenciada**: colección `consultas` con `id_paciente` | Crece sin límite en el tiempo; embeberla inflaría la ficha del paciente. |
| `diagnostico` → `tratamiento` → `receta` | **Embebidos** en la consulta: `diagnosticos[].tratamientos[].recetas[]` | **Embebidos** en la consulta (cada nodo con `id` UUID) | Se redactan y leen como una unidad de atención (1–3 diagnósticos por consulta). Mantienen la cadena 3FN diagnóstico → tratamiento → receta como anidamiento. |
| `medicamento` (desde `receta`) | **Referenciado**: `recetas[].id_medicamento` (ObjectId) | **Referenciado** + **etiqueta sellada**: `recetas[].id_medicamento` y `recetas[].medicamento` | Catálogo maestro único. En Firestore se copia la etiqueta al prescribir (orden médica sellada; ahorra una lectura por receta). |
| `examen` + `resultado_examen` | **Referenciado**: colección `examenes_laboratorio` con `id_consulta` e `id_paciente`; `resultados[]` embebidos y **heterogéneos** | **Referenciado**: colección `examenes_laboratorio` (+ `nombre_tipo`, `solicitado_por`, `id_institucion` desnormalizados) | El laboratorio opera de forma asíncrona a la consulta. Los resultados varían por prueba (un valor, un antibiograma de 50 filas…): el validador solo exige `parametro` y `valor_obtenido`. |
| `tipo_examen`, `vacuna`, `medicamento` | Colecciones maestras `tipos_examen`, `vacunas`, `medicamentos` | Colecciones maestras `tipos_examen`, `vacunas`, `medicamentos` | Normalización y actualización centralizada. |
| `registro_crecimiento` | — (módulo pediátrico) | **Subcolección** `pacientes/{id}/crecimiento/{id}` con `id_consulta` | Serie temporal leída de forma independiente para graficar curvas (OP-ESP-02) sin descargar el expediente. |
| `esquema_vacunacion` | — (módulo pediátrico) | **Subcolección** `pacientes/{id}/vacunas/{id}` con `id_consulta`, `id_vacuna`, `no_dosis`, `lote` | Igual que crecimiento; OP-ESP-04 compara contra `vacunas.dosis_requeridas`. |
| `medico`, `institucion` | Colecciones `medicos`, `instituciones` | Colecciones `medicos`, `instituciones` (+ `nombre_medico` sellado en cada consulta) | Información pública referenciada. |
| `usuario` | — | — | **Base central PostgreSQL `red_central`**: el login ocurre antes de conocer el motor (OP-SEC-02). |

## Esquemas y restricciones por motor

### MongoDB — `server/db/mongo/init.js`
- `$jsonSchema` con `validationLevel: "strict"` en las 8 colecciones: tipos BSON, enumeraciones de estado (`activo|archivado|fallecido`, `programada|atendida|cancelada`, `solicitado|en_proceso|completado`), DPI de 13 dígitos y enteros (`int`) para `id_institucion` y `dosis_requeridas`.
- Índices: `pacientes.dpi_cui` único; `pacientes.correo` único parcial (solo cuando es texto); `consultas (id_medico, fecha_hora)` único parcial para estados vigentes (respaldo físico de OP-CON-01); `consultas (id_paciente, fecha_hora)`; `examenes_laboratorio (id_paciente, fecha_solicitud)`, `(id_consulta)`, `(estado)`.
- Integridad referencial: MongoDB no tiene FKs. El adaptador verifica dentro de la transacción que los medicamentos de las recetas existan; si no, aborta.

### Firestore — `server/db/firestore/`
- `firestore.rules`: RBAC por `request.auth.token.role` e `institutionId` (ver `comparativo.md`, Eje C).
- `firestore.indexes.json`: compuestos `consultas (id_paciente, fecha_hora)`, `consultas (id_medico, fecha_hora)` y `examenes_laboratorio (id_paciente, fecha_solicitud)`.
- **Unicidad**: Firestore no tiene índices únicos. Se usan documentos centinela `pacientes_dpi/{dpi}` y `pacientes_correo/{correo}`, creados con `create()` en la misma transacción que el paciente (falla con `ALREADY_EXISTS`).
- **Búsqueda dentro de arreglos de mapas**: Firestore no consulta campos anidados en arreglos, así que cada consulta mantiene `ids_diagnosticos[]` para localizar un diagnóstico con `array-contains` (OP-FAR-02).

## Ejemplo de documento `consultas` (MongoDB)

```json
{
  "_id": "ObjectId",
  "fecha_hora": "ISODate (hora local naive)",
  "motivo_consulta": "Fiebre y odinofagia",
  "notas_clinicas": "Amígdalas hipertróficas con exudado.",
  "estado": "atendida",
  "id_paciente": "ObjectId → pacientes",
  "id_medico": "ObjectId → medicos",
  "id_institucion": 3,
  "diagnosticos": [
    {
      "_id": "ObjectId", "codigo_cie10": "J03.9", "descripcion": "Amigdalitis aguda", "tipo": "definitivo", "fecha": "ISODate",
      "tratamientos": [
        {
          "_id": "ObjectId", "descripcion": "Plan terapéutico: Amigdalitis aguda", "fecha_inicio": "ISODate", "fecha_fin_estimada": "ISODate",
          "recetas": [
            { "_id": "ObjectId", "id_medicamento": "ObjectId → medicamentos", "dosis": "1 cápsula", "frecuencia": "Cada 8 horas", "duracion_dias": 7, "indicaciones": "Completar el esquema" }
          ]
        }
      ]
    }
  ]
}
```

## Fechas

Los `timestamp` del diccionario son hora local sin zona. En los motores documentales se guardan como `Date`/`Timestamp` que representan esa hora local "naive" en UTC (`server/src/adapters/shared/naiveTime.ts`), equivalentes a `timestamp without time zone` / `DATETIME` en SQL. Así una cita de las 08:30 es 08:30 en los cuatro motores.
