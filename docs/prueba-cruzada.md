# Prueba cruzada 5.4 — resultados

Generado por `pnpm --dir server cross-test` el 2026-11-06T18:03:25.839Z.

Flujo ejecutado vía API REST con un médico de cada institución: alta de paciente → cita → atención con diagnóstico y receta (transacción única) → diagnóstico adicional → tratamiento con receta → historial farmacoterapéutico → archivo.

## Identificadores nativos de cada motor (lo único que difiere)

| Institución | Motor | id paciente | id consulta | ids diagnóstico | OP-FAR-04 | Estado final |
|---|---|---|---|---|---|---|
| Hospital General | **PostgreSQL** | 14 | 15 | 11 | 2 recetas | archivado |
| Clínica Odontológica | **MySQL** | 13 | 11 | 9 | 2 recetas | archivado |
| Laboratorio Clínico | **MongoDB** | 6aee166d3e5164965771b350 | 6aee166d3e5164965771b351 | 6aee166d3e5164965771b352 | 2 recetas | archivado |
| Centro Médico Pediátrico | **Firestore** | tlYfh7SyYgd92o8UJA9s | hRRl3IlUMtZCXlabgIrS | f120a01a-e804-4542-8b8d-9d548b3a8292 | 2 recetas | archivado |

## Resultado normalizado (idéntico en los 4 motores)

Se excluyen ids, DPI/correo (únicos por corrida) e institución.

```json
{
  "alta": {
    "firstName": "Ana",
    "middleName": "Cruzada",
    "lastName": "Prueba",
    "secondLastName": "Motores",
    "birthDate": "1985-02-20",
    "sex": "F",
    "phone": "5555-7777",
    "address": "Zona 4",
    "municipality": "Guatemala",
    "department": "Guatemala",
    "bloodType": "B+",
    "status": "activo",
    "allergies": [
      {
        "substance": "Sulfas",
        "reaction": "Exantema",
        "severity": "grave"
      }
    ],
    "emergencyContacts": [
      {
        "name": "Luis Prueba",
        "relationship": "Esposo",
        "phone": "5555-8888"
      }
    ]
  },
  "cita": {
    "horaIgualALaSolicitada": true,
    "reason": "Fiebre y odinofagia",
    "status": "programada"
  },
  "consulta": {
    "status": "atendida",
    "reason": "Fiebre y odinofagia",
    "notes": "Amígdalas hipertróficas con exudado.",
    "diagnoses": [
      {
        "cie10": "J03.9",
        "description": "Amigdalitis aguda",
        "type": "definitivo"
      }
    ],
    "prescriptions": [
      {
        "medicine": "Amoxicilina 500 mg",
        "dose": "1 cápsula",
        "frequency": "Cada 8 horas",
        "duration": "7 días",
        "instructions": "Completar el esquema"
      }
    ]
  },
  "tratamiento": {
    "status": "atendida",
    "reason": "Fiebre y odinofagia",
    "notes": "Amígdalas hipertróficas con exudado.",
    "diagnoses": [
      {
        "cie10": "J03.9",
        "description": "Amigdalitis aguda",
        "type": "definitivo"
      },
      {
        "cie10": "R50.9",
        "description": "Fiebre no especificada",
        "type": "presuntivo"
      }
    ],
    "prescriptions": [
      {
        "medicine": "Amoxicilina 500 mg",
        "dose": "1 cápsula",
        "frequency": "Cada 8 horas",
        "duration": "7 días",
        "instructions": "Completar el esquema"
      },
      {
        "medicine": "Paracetamol 500 mg",
        "dose": "1 tableta",
        "frequency": "Cada 6 horas si hay fiebre",
        "duration": "3 días",
        "instructions": ""
      }
    ]
  },
  "historial": [
    {
      "cie10": "J03.9",
      "tratamiento": "Plan terapéutico: Amigdalitis aguda",
      "fin": "calculada",
      "medicamento": "Amoxicilina 500 mg",
      "dosis": "1 cápsula",
      "frecuencia": "Cada 8 horas",
      "duracion": "7 días"
    },
    {
      "cie10": "R50.9",
      "tratamiento": "Control de temperatura",
      "fin": "calculada",
      "medicamento": "Paracetamol 500 mg",
      "dosis": "1 tableta",
      "frecuencia": "Cada 6 horas si hay fiebre",
      "duracion": "3 días"
    }
  ],
  "archivo": {
    "firstName": "Ana",
    "middleName": "Cruzada",
    "lastName": "Prueba",
    "secondLastName": "Motores",
    "birthDate": "1985-02-20",
    "sex": "F",
    "phone": "5555-7777",
    "address": "Zona 4",
    "municipality": "Guatemala",
    "department": "Guatemala",
    "bloodType": "B+",
    "status": "archivado",
    "allergies": [
      {
        "substance": "Sulfas",
        "reaction": "Exantema",
        "severity": "grave"
      }
    ],
    "emergencyContacts": [
      {
        "name": "Luis Prueba",
        "relationship": "Esposo",
        "phone": "5555-8888"
      }
    ],
    "lastVisitIgualACita": true
  }
}
```
