import { describe, expect, it } from "vitest";
import { DatabaseAdapterFactory } from "../src/adapters/DatabaseAdapterFactory.ts";
import { medicineLabel, resolveMedicine } from "../src/domain/Catalog.ts";
import {
  assertCanReceiveDiagnoses,
  assertConsultationTransition,
  assertSlotAvailable,
  buildEncounterDiagnoses,
  normalizeCie10,
  prepareEncounter,
} from "../src/domain/Consultation.ts";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "../src/domain/errors.ts";
import { assertLabTransition, statusAfterResults } from "../src/domain/LabOrder.ts";
import { assertPatientTransition, assertUnique, normalizeDpi, preparePatient } from "../src/domain/Patient.ts";
import { can } from "../src/domain/security.ts";
import { vaccinationScheme } from "../src/domain/Specialty.ts";
import { assertCanLogin, type User } from "../src/domain/User.ts";
import type { EngineProvider } from "../src/ports/index.ts";
import { newPatient } from "./helpers.ts";

describe("Dominio · Paciente", () => {
  it("normaliza DPI, correo y tipo de sangre; exige 13 dígitos", () => {
    const p = preparePatient({ ...newPatient(1), dpi: "2784 10293 0101", email: " Ana@Correo.GT ", bloodType: "O+" });
    expect(p).toMatchObject({ dpi: "2784102930101", email: "ana@correo.gt", bloodType: "o+" });
    expect(() => preparePatient({ ...newPatient(1), dpi: "123" })).toThrow(ValidationError);
    expect(normalizeDpi("2784-10293-0101")).toBe("2784102930101");
  });

  it("elimina alergias duplicadas y contactos vacíos", () => {
    const p = preparePatient({
      ...newPatient(1),
      allergies: [
        { substance: "Penicilina", reaction: null, severity: "grave" },
        { substance: "penicilina ", reaction: null, severity: null },
        { substance: " ", reaction: null, severity: null },
      ],
      emergencyContacts: [{ name: "", relationship: "", phone: "", alternativePhone: null }],
    });
    expect(p.allergies).toHaveLength(1);
    expect(p.emergencyContacts).toHaveLength(0);
  });

  it("unicidad y transiciones de estado (fallecido es terminal)", () => {
    const existing = { id: "1" } as never;
    expect(() => assertUnique(existing, null)).toThrow(ConflictError);
    expect(() => assertUnique(existing, null, "1")).not.toThrow();
    expect(() => assertPatientTransition("activo", "archivado")).not.toThrow();
    expect(() => assertPatientTransition("archivado", "activo")).not.toThrow();
    expect(() => assertPatientTransition("fallecido", "activo")).toThrow(ValidationError);
  });
});

describe("Dominio · Consulta y farmacoterapia", () => {
  it("valida CIE-10", () => {
    expect(normalizeCie10(" g44.2 ")).toBe("G44.2");
    expect(normalizeCie10("J18")).toBe("J18");
    expect(() => normalizeCie10("44.2")).toThrow(ValidationError);
    expect(() => normalizeCie10("G4")).toThrow(ValidationError);
  });

  it("transiciones: programada → atendida|cancelada; atendida y cancelada son finales", () => {
    expect(() => assertConsultationTransition("programada", "atendida")).not.toThrow();
    expect(() => assertConsultationTransition("atendida", "cancelada")).toThrow(ValidationError);
    expect(() => assertConsultationTransition("cancelada", "programada")).toThrow(ValidationError);
    expect(() => assertCanReceiveDiagnoses("programada")).toThrow(ValidationError);
  });

  it("disponibilidad del médico (OP-CON-01)", () => {
    const busy = [{ id: "a", status: "programada", scheduledAt: "2026-03-24T08:30" }] as never;
    expect(() => assertSlotAvailable(busy)).toThrow(ConflictError);
    expect(() => assertSlotAvailable(busy, "a")).not.toThrow();
    expect(() => assertSlotAvailable([{ id: "b", status: "cancelada" }] as never)).not.toThrow();
  });

  it("arma la cadena diagnóstico → tratamiento → receta y calcula la fecha fin", () => {
    const [dx] = buildEncounterDiagnoses(
      [{ cie10: "g44.2", description: "Cefalea tensional", type: "definitivo", date: "2026-02-10" }],
      [{ medicineId: "1", dose: "1 tableta", frequency: "Cada 8 horas", durationDays: 5, instructions: "" }],
    );
    expect(dx.cie10).toBe("G44.2");
    expect(dx.treatments[0]).toMatchObject({ description: "Plan terapéutico: Cefalea tensional", estimatedEndDate: "2026-02-15" });
    expect(dx.treatments[0].prescriptions[0].instructions).toBeNull();
    expect(() => buildEncounterDiagnoses([], [{ medicineId: "1", dose: "1", frequency: "x", durationDays: 1, instructions: null }])).toThrow(ValidationError);
  });

  it("un borrador no admite diagnósticos y atender exige notas", () => {
    const base = {
      consultationId: null,
      patientId: "1",
      doctorId: "1",
      institutionId: 1,
      scheduledAt: "2026-03-24T08:30",
      reason: "Dolor",
      notes: "",
      diagnoses: [],
    };
    expect(() => prepareEncounter({ ...base, status: "atendida" }, null)).toThrow(/notas clínicas/);
    expect(() => prepareEncounter({ ...base, status: "programada", diagnoses: [{} as never] }, null)).toThrow(/consulta atendida/);
  });

  it("resuelve medicamentos del catálogo por nombre de presentación", () => {
    const catalog = [{ id: "7", genericName: "Paracetamol", brandName: null, presentation: "Tableta", concentration: "500 mg" }];
    expect(medicineLabel(catalog[0])).toBe("Paracetamol 500 mg");
    expect(resolveMedicine(catalog, { name: "paracetamol 500 MG" }).id).toBe("7");
    expect(() => resolveMedicine(catalog, { name: "Ibuprofeno" })).toThrow(NotFoundError);
  });
});

describe("Dominio · Laboratorio, pediatría, seguridad", () => {
  it("estados de la orden de laboratorio", () => {
    expect(() => assertLabTransition("solicitado", "completado")).toThrow(ValidationError);
    expect(statusAfterResults([{ parameter: "a", value: "1", referenceRange: null, observations: null }])).toBe("completado");
    expect(statusAfterResults([{ parameter: "a", value: "", referenceRange: null, observations: null }])).toBe("en_proceso");
  });

  it("OP-ESP-04: esquema de vacunación pendiente contra dosis requeridas", () => {
    const catalog = [
      { id: "bcg", name: "BCG", requiredDoses: 1 },
      { id: "penta", name: "Pentavalente", requiredDoses: 3 },
    ];
    const scheme = vaccinationScheme(catalog, [{ id: "1", consultationId: "c", vaccineId: "penta", doseNumber: 1, appliedOn: "2018-03-30", lot: "L" }]);
    expect(scheme.map((s) => [s.vaccine.name, s.doseNumber, s.applied])).toEqual([
      ["BCG", 1, false],
      ["Pentavalente", 1, true],
      ["Pentavalente", 2, false],
    ]);
  });

  it("RBAC: solo el médico accede a lo restringido; el admin no altera historial", () => {
    expect(can("medico", "clinical:write")).toBe(true);
    expect(can("secretaria", "clinical:read")).toBe(false);
    expect(can("secretaria", "patient:write")).toBe(true);
    expect(can("admin", "clinical:read")).toBe(false);
    expect(can("admin", "patient:write")).toBe(false);
    expect(can("admin", "catalog:write")).toBe(true);
  });

  it("OP-SEC-01: credenciales y estado del usuario", () => {
    const user = { status: "bloqueado" } as User;
    expect(() => assertCanLogin(null, false)).toThrow(UnauthorizedError);
    expect(() => assertCanLogin(user, true)).toThrow(/bloqueado/);
    expect(() => assertCanLogin({ ...user, status: "activo" }, false)).toThrow(UnauthorizedError);
  });
});

describe("DatabaseAdapterFactory (OCP)", () => {
  const fake = (label: string): EngineProvider => ({
    descriptor: { key: label, label },
    repositories: () => ({}) as never,
    ping: async () => undefined,
    close: async () => undefined,
  });

  it("enruta por institución, crea el proveedor una sola vez y acepta un 5º motor sin cambios", () => {
    let created = 0;
    const factory = new DatabaseAdapterFactory()
      .register("postgres", () => (created++, fake("PostgreSQL")))
      .route(1, "postgres")
      .register("cassandra", () => fake("Cassandra"))
      .route(5, "cassandra");
    expect(factory.describe(1).label).toBe("PostgreSQL");
    factory.forContext({ role: "medico", institutionId: 1 });
    expect(created).toBe(1);
    expect(factory.describe(5).label).toBe("Cassandra");
    expect(() => factory.describe(9)).toThrow(NotFoundError);
  });
});
