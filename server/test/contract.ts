/**
 * Suite de contrato de los puertos (Liskov): se ejecuta idéntica contra los
 * cuatro motores. Incluye la prueba del Eje B: si falla la receta, se revierte
 * consulta + diagnóstico + tratamiento.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, ValidationError } from "../src/domain/errors.ts";
import type { Diagnosis } from "../src/domain/Consultation.ts";
import type { Role } from "../src/domain/values.ts";
import type { EngineProvider, InstitutionRepositories } from "../src/ports/index.ts";
import { newPatient, uniqueSlot } from "./helpers.ts";

const diagnosis = (medicineId: string): Diagnosis => ({
  cie10: "J06.9",
  description: "Infección aguda de vías respiratorias superiores",
  type: "definitivo",
  date: "2031-01-05",
  treatments: [
    {
      description: "Plan terapéutico: IVRS",
      startDate: "2031-01-05",
      estimatedEndDate: "2031-01-10",
      observations: null,
      prescriptions: [{ medicineId, dose: "1 tableta", frequency: "Cada 8 horas", durationDays: 5, instructions: "Con alimentos" }],
    },
  ],
});

export function contractSuite(opts: {
  name: string;
  institutionId: number;
  provider: () => EngineProvider;
  /** El motor impide físicamente la doble reserva (índice único). */
  slotBackstop: boolean;
}) {
  describe(`Contrato de puertos · ${opts.name}`, () => {
    let provider: EngineProvider;
    let as: (role: Role) => InstitutionRepositories;
    let medico: InstitutionRepositories;
    let doctorId: string;
    let medicineId: string;
    let examTypeId: string;

    beforeAll(async () => {
      provider = opts.provider();
      as = (role) => provider.repositories({ role, institutionId: opts.institutionId });
      medico = as("medico");
      await provider.ping();
      doctorId = (await medico.doctors.list())[0].id;
      medicineId = (await medico.catalogs.listMedicines())[0].id;
      examTypeId = (await medico.catalogs.listExamTypes())[0].id;
    });
    afterAll(() => provider.close());

    it("OP-PAC-01..05: alta, búsqueda por id/DPI/correo, edición, contactos/alergias y archivado", async () => {
      const input = newPatient(opts.institutionId);
      const created = await medico.patients.create(input);
      expect(created).toMatchObject({ dpi: input.dpi, status: "activo", institutionId: opts.institutionId, lastVisit: null });
      expect(created.allergies).toEqual(input.allergies);
      expect(created.emergencyContacts).toEqual(input.emergencyContacts);

      expect((await medico.patients.findById(created.id))?.dpi).toBe(input.dpi);
      expect((await medico.patients.findByDpi(input.dpi))?.id).toBe(created.id);
      expect((await medico.patients.findByEmail(input.email!.toUpperCase()))?.id).toBe(created.id);
      expect((await medico.patients.list()).some((p) => p.id === created.id)).toBe(true);

      const updated = await medico.patients.update(created.id, { phone: "5555-2222", municipality: "Mixco" });
      expect(updated).toMatchObject({ phone: "5555-2222", municipality: "Mixco", address: "Zona 1" });

      const withContacts = await medico.patients.addEmergencyContacts(created.id, [
        { name: "Contacto Dos", relationship: "Padre", phone: "5555-3333", alternativePhone: "5555-4444" },
      ]);
      expect(withContacts?.emergencyContacts).toHaveLength(2);
      const withAllergies = await medico.patients.addAllergies(created.id, [{ substance: "Ibuprofeno", reaction: null, severity: "grave" }]);
      expect(withAllergies?.allergies.map((a) => a.substance)).toEqual(["Látex", "Ibuprofeno"]);

      expect((await medico.patients.updateStatus(created.id, "archivado"))?.status).toBe("archivado");
      expect(await medico.patients.findById("no-existe")).toBeNull();
    });

    it("el motor respalda la unicidad del DPI y del correo", async () => {
      const input = newPatient(opts.institutionId);
      await medico.patients.create(input);
      await expect(medico.patients.create({ ...newPatient(opts.institutionId), dpi: input.dpi })).rejects.toBeInstanceOf(ConflictError);
      await expect(medico.patients.create({ ...newPatient(opts.institutionId), email: input.email })).rejects.toBeInstanceOf(ConflictError);
    });

    it("OP-CON-01/03/04: programar, listar por médico y fecha, reprogramar y cancelar", async () => {
      const patient = await medico.patients.create(newPatient(opts.institutionId));
      const slot = uniqueSlot();
      const appt = await as("secretaria").consultations.create({
        patientId: patient.id,
        doctorId,
        institutionId: opts.institutionId,
        scheduledAt: slot,
        reason: "Chequeo",
      });
      expect(appt).toMatchObject({ patientId: patient.id, doctorId, scheduledAt: slot, status: "programada" });
      expect(appt.doctorName).toBeTruthy();
      expect(appt).not.toHaveProperty("notes");

      expect((await medico.consultations.findByDoctorAt(doctorId, slot)).map((a) => a.id)).toEqual([appt.id]);
      expect((await medico.consultations.listByDoctor(doctorId, slot.slice(0, 10))).some((a) => a.id === appt.id)).toBe(true);
      if (opts.slotBackstop)
        await expect(
          medico.consultations.create({ patientId: patient.id, doctorId, institutionId: opts.institutionId, scheduledAt: slot, reason: "Doble" }),
        ).rejects.toBeInstanceOf(ConflictError);

      const next = uniqueSlot();
      expect((await medico.consultations.reschedule(appt.id, { scheduledAt: next, reason: "Chequeo anual" }))?.scheduledAt).toBe(next);
      expect((await as("secretaria").consultations.updateStatus(appt.id, "cancelada"))?.status).toBe("cancelada");
      expect(await medico.consultations.findByDoctorAt(doctorId, next)).toEqual([]);
    });

    it("OP-CON-02 + OP-FAR-01..04: encuentro clínico atómico y historial farmacoterapéutico", async () => {
      const patient = await medico.patients.create(newPatient(opts.institutionId));
      const appt = await medico.consultations.create({ patientId: patient.id, doctorId, institutionId: opts.institutionId, scheduledAt: uniqueSlot(), reason: "Tos" });
      const saved = await medico.encounters.saveEncounter({
        consultationId: appt.id,
        patientId: patient.id,
        doctorId,
        institutionId: opts.institutionId,
        scheduledAt: appt.scheduledAt,
        reason: "Tos y fiebre",
        notes: "Faringe hiperémica",
        status: "atendida",
        diagnoses: [diagnosis(medicineId)],
      });
      expect(saved).toMatchObject({ id: appt.id, status: "atendida", notes: "Faringe hiperémica", reason: "Tos y fiebre" });
      const [dx] = saved.diagnoses;
      expect(dx).toMatchObject({ cie10: "J06.9", type: "definitivo", date: "2031-01-05" });
      expect(dx.treatments[0].prescriptions[0]).toMatchObject({ medicineId, dose: "1 tableta", durationDays: 5 });
      expect(dx.treatments[0].prescriptions[0].medicineName).toBeTruthy();
      expect((await medico.patients.findById(patient.id))?.lastVisit).toBe(appt.scheduledAt);

      const withDx = await medico.encounters.addDiagnosis(saved.id, { ...diagnosis(medicineId), cie10: "R50.9", description: "Fiebre", treatments: [] });
      expect(withDx.diagnoses).toHaveLength(2);
      const second = withDx.diagnoses.find((d) => d.cie10 === "R50.9")!;
      const withTx = await medico.encounters.addTreatmentWithPrescription(second.id!, diagnosis(medicineId).treatments[0]);
      expect(withTx.diagnoses.find((d) => d.id === second.id)!.treatments).toHaveLength(1);

      const history = await medico.encounters.getPatientHistory(patient.id);
      expect(history.map((c) => c.id)).toEqual([saved.id]);
      expect(history[0].diagnoses.flatMap((d) => d.treatments.flatMap((t) => t.prescriptions))).toHaveLength(2);
    });

    it("Eje B: si falla la receta se revierte TODO (consulta, diagnóstico, tratamiento y última visita)", async () => {
      const patient = await medico.patients.create(newPatient(opts.institutionId));
      const bad = diagnosis("000000000000000000000999");
      // Caso 1: consulta nueva → no debe quedar ninguna consulta
      await expect(
        medico.encounters.saveEncounter({
          consultationId: null,
          patientId: patient.id,
          doctorId,
          institutionId: opts.institutionId,
          scheduledAt: uniqueSlot(),
          reason: "Dolor",
          notes: "Exploración",
          status: "atendida",
          diagnoses: [bad],
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(await medico.encounters.getPatientHistory(patient.id)).toEqual([]);
      expect((await medico.patients.findById(patient.id))?.lastVisit).toBeNull();

      // Caso 2: cita existente → sigue 'programada', sin notas ni diagnósticos
      const appt = await medico.consultations.create({ patientId: patient.id, doctorId, institutionId: opts.institutionId, scheduledAt: uniqueSlot(), reason: "Control" });
      await expect(
        medico.encounters.saveEncounter({
          consultationId: appt.id,
          patientId: patient.id,
          doctorId,
          institutionId: opts.institutionId,
          scheduledAt: appt.scheduledAt,
          reason: "Control",
          notes: "Notas que no deben persistir",
          status: "atendida",
          diagnoses: [diagnosis(medicineId), bad],
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      const after = await medico.encounters.findEncounter(appt.id);
      expect(after).toMatchObject({ status: "programada", notes: null, diagnoses: [] });
      expect((await medico.patients.findById(patient.id))?.lastVisit).toBeNull();
    });

    it("Eje C: el adaptador niega datos restringidos a secretaría y admin", async () => {
      const patient = await medico.patients.create(newPatient(opts.institutionId));
      for (const role of ["secretaria", "admin"] as const) {
        await expect(as(role).encounters.getPatientHistory(patient.id)).rejects.toBeInstanceOf(ForbiddenError);
        await expect(as(role).lab.list({})).rejects.toBeInstanceOf(ForbiddenError);
        await expect(as(role).encounters.saveEncounter({} as never)).rejects.toBeInstanceOf(ForbiddenError);
      }
      // La secretaría sí ve los datos confidenciales del paciente
      expect((await as("secretaria").patients.findById(patient.id))?.dpi).toBe(patient.dpi);
    });

    it("OP-LAB-01..04: orden ligada a consulta, captura de muestra, resultados e informe", async () => {
      const patient = await medico.patients.create(newPatient(opts.institutionId));
      const enc = await medico.encounters.saveEncounter({
        consultationId: null,
        patientId: patient.id,
        doctorId,
        institutionId: opts.institutionId,
        scheduledAt: uniqueSlot(),
        reason: "Chequeo",
        notes: "Se solicita laboratorio",
        status: "atendida",
        diagnoses: [],
      });
      const order = await medico.lab.createOrder({
        consultationId: enc.id,
        examTypeId,
        requestedAt: enc.scheduledAt,
        results: [
          { parameter: "Hemoglobina", value: "", referenceRange: "12–16 g/dL", observations: null },
          { parameter: "Leucocitos", value: "", referenceRange: "4.5–11", observations: null },
        ],
      });
      expect(order).toMatchObject({ status: "solicitado", consultationId: enc.id, patientId: patient.id });
      expect(order.requestedBy).toBeTruthy();
      expect((await medico.lab.updateStatus(order.id, "en_proceso"))?.status).toBe("en_proceso");
      const done = await medico.lab.addResults(
        order.id,
        [
          { parameter: "Hemoglobina", value: "13.5 g/dL", referenceRange: "12–16 g/dL", observations: null },
          { parameter: "Leucocitos", value: "7.1", referenceRange: "4.5–11", observations: "Normal" },
        ],
        "completado",
      );
      expect(done).toMatchObject({ status: "completado" });
      expect(done!.results.map((r) => r.value)).toEqual(["13.5 g/dL", "7.1"]);
      expect((await medico.lab.getOrderReport(order.id))?.results[1].observations).toBe("Normal");
      expect((await medico.lab.list({ patientId: patient.id })).map((o) => o.id)).toEqual([order.id]);
      await expect(
        medico.lab.createOrder({ consultationId: "999999", examTypeId, requestedAt: enc.scheduledAt, results: [] }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
}
