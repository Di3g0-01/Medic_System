import { getApps, initializeApp, type App } from "firebase-admin/app";
import { FieldPath, FieldValue, Timestamp, getFirestore, type DocumentData, type DocumentSnapshot, type Firestore, type Query, type Transaction } from "firebase-admin/firestore";
import { medicineLabel, type Doctor, type ExamType, type Medicine, type NewDoctor, type Vaccine } from "../../domain/Catalog.ts";
import type { Appointment, Consultation, Diagnosis, EncounterWrite, NewAppointment, Treatment } from "../../domain/Consultation.ts";
import { ConflictError, DomainError, NotFoundError, ValidationError } from "../../domain/errors.ts";
import type { LabOrder, LabResult, NewLabOrder } from "../../domain/LabOrder.ts";
import type { Allergy, EmergencyContact, NewPatient, Patient, PatientChanges } from "../../domain/Patient.ts";
import type { ConsultationStatus, LabStatus, LocalDateTime, PatientStatus } from "../../domain/values.ts";
import type {
  AccessContext,
  AppointmentFilter,
  EngineProvider,
  ICatalogPort,
  IConsultationPort,
  IDoctorPort,
  ILabPort,
  InstitutionRepositories,
  IPatientPort,
  IPediatricPort,
  IPrescriptionPort,
} from "../../ports/index.ts";
import { guard } from "../shared/guards.ts";
import { dayRange } from "../shared/naiveTime.ts";
import * as m from "./mappers.ts";

/** gRPC 6 = ALREADY_EXISTS (documento centinela duplicado). */
export function translateFirestoreError(e: unknown): Error {
  if (e instanceof DomainError) return e;
  const err = e as { code?: number; message?: string };
  if (err.code === 6) {
    if (err.message?.includes("pacientes_correo")) return new ConflictError("Este correo ya está registrado");
    return new ConflictError("Ya existe un paciente con este DPI/CUI");
  }
  return e instanceof Error ? e : new Error(String(e));
}

const AGENDA_FIELDS = ["fecha_hora", "motivo_consulta", "estado", "id_paciente", "id_medico", "id_institucion", "nombre_medico"];

class FsContext {
  constructor(
    readonly db: Firestore,
    readonly ctx: AccessContext,
  ) {}
  col(name: string) {
    return this.db.collection(name);
  }
  async op<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (e) {
      throw translateFirestoreError(e);
    }
  }
  /** Eje B: runTransaction — las escrituras se aplican todas o ninguna. */
  tx<T>(work: (t: Transaction) => Promise<T>): Promise<T> {
    return this.op(() => this.db.runTransaction(work));
  }
  scoped(name: string): Query {
    return this.col(name).where("id_institucion", "==", this.ctx.institutionId);
  }
  /** Lee los medicamentos referenciados (dentro de la transacción) para validar y sellar su etiqueta. */
  async medicineNames(t: Transaction, ids: string[]) {
    const unique = [...new Set(ids)].filter(Boolean);
    const snaps = unique.length ? await t.getAll(...unique.map((id) => this.col("medicamentos").doc(id))) : [];
    const names = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, medicineLabel(m.toMedicine(s))]));
    return { names, missing: ids.some((id) => !names.has(id)) };
  }
}

const medicineIds = (diagnoses: Diagnosis[]) => diagnoses.flatMap((d) => d.treatments.flatMap((t) => t.prescriptions.map((p) => p.medicineId)));

// ─────────────────────────────── Pacientes ───────────────────────────────
class FirestorePatientRepository implements IPatientPort {
  constructor(private readonly x: FsContext) {}
  private async one(id: string) {
    const s = await this.x.col("pacientes").doc(id).get();
    return s.exists && s.get("id_institucion") === this.x.ctx.institutionId ? m.toPatient(s) : null;
  }
  private async findBy(field: string, value: string) {
    const q = await this.x.scoped("pacientes").where(field, "==", value).limit(1).get();
    return q.empty ? null : m.toPatient(q.docs[0]);
  }

  /** OP-PAC-01: Firestore no tiene índices únicos → centinelas pacientes_dpi/{dpi} y pacientes_correo/{correo} creados en la misma transacción. */
  create(p: NewPatient): Promise<Patient> {
    const ref = this.x.col("pacientes").doc();
    return this.x
      .tx(async (t) => {
        t.create(this.x.col("pacientes_dpi").doc(p.dpi), { id_paciente: ref.id });
        if (p.email) t.create(this.x.col("pacientes_correo").doc(p.email), { id_paciente: ref.id });
        t.set(ref, {
          primer_nombre: p.firstName,
          segundo_nombre: p.middleName,
          primer_apellido: p.lastName,
          segundo_apellido: p.secondLastName,
          fecha_nacimiento: m.ts(p.birthDate),
          sexo: p.sex,
          dpi_cui: p.dpi,
          telefono: p.phone,
          correo: p.email,
          direccion: p.address,
          municipio: p.municipality,
          departamento: p.department,
          tipo_sangre: p.bloodType,
          fecha_registro: m.ts(new Date().toISOString().slice(0, 16)),
          estado: "activo",
          id_institucion: p.institutionId,
          ultima_visita: null,
          alergias: p.allergies.map(m.allergyDoc),
          contactos_emergencia: p.emergencyContacts.map(m.contactDoc),
        });
      })
      .then(() => this.x.op(async () => (await this.one(ref.id))!));
  }
  findById(id: string) {
    return this.x.op(() => this.one(id));
  }
  findByDpi(dpi: string) {
    return this.x.op(() => this.findBy("dpi_cui", dpi));
  }
  findByEmail(email: string) {
    return this.x.op(() => this.findBy("correo", email.toLowerCase()));
  }
  list() {
    return this.x.op(async () => (await this.x.scoped("pacientes").orderBy("primer_apellido").get()).docs.map(m.toPatient));
  }
  /** OP-PAC-04: si cambia el correo, el centinela se mueve en la misma transacción. */
  update(id: string, changes: PatientChanges) {
    const ref = this.x.col("pacientes").doc(id);
    return this.x
      .tx(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists || snap.get("id_institucion") !== this.x.ctx.institutionId) return false;
        const data = Object.fromEntries(Object.entries(changes).map(([k, v]) => [m.PATIENT_FIELDS[k as keyof PatientChanges], v]));
        const oldEmail = snap.get("correo");
        if ("email" in changes && changes.email !== oldEmail) {
          if (oldEmail) t.delete(this.x.col("pacientes_correo").doc(oldEmail));
          if (changes.email) t.create(this.x.col("pacientes_correo").doc(changes.email), { id_paciente: id });
        }
        t.update(ref, data);
        return true;
      })
      .then((ok) => (ok ? this.findById(id) : null));
  }
  private async patch(id: string, data: DocumentData) {
    return this.x.op(async () => {
      if (!(await this.one(id))) return null;
      await this.x.col("pacientes").doc(id).update(data);
      return this.one(id);
    });
  }
  updateStatus(id: string, status: PatientStatus) {
    return this.patch(id, { estado: status });
  }
  /** OP-PAC-02: arrayUnion sobre arreglos embebidos. */
  addEmergencyContacts(id: string, contacts: EmergencyContact[]) {
    return this.patch(id, { contactos_emergencia: FieldValue.arrayUnion(...contacts.map(m.contactDoc)) });
  }
  addAllergies(id: string, allergies: Allergy[]) {
    return this.patch(id, { alergias: FieldValue.arrayUnion(...allergies.map(m.allergyDoc)) });
  }
}

// ───────────────────── Agenda: proyección confidencial con select() ─────────────────────
class FirestoreConsultationRepository implements IConsultationPort {
  constructor(private readonly x: FsContext) {}
  private async one(id: string): Promise<Appointment | null> {
    const q = await this.x.scoped("consultas").where(FieldPath.documentId(), "==", this.x.col("consultas").doc(id)).select(...AGENDA_FIELDS).get();
    return q.empty ? null : m.toAppointment(q.docs[0]);
  }
  private async query(q: Query) {
    return (await q.select(...AGENDA_FIELDS).get()).docs.map(m.toAppointment).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }
  create(a: NewAppointment) {
    return this.x.op(async () => {
      const doctor = await this.x.col("medicos").doc(a.doctorId).get();
      const ref = await this.x.col("consultas").add({
        fecha_hora: m.ts(a.scheduledAt),
        motivo_consulta: a.reason,
        notas_clinicas: null,
        estado: "programada",
        id_paciente: a.patientId,
        id_medico: a.doctorId,
        nombre_medico: doctor.get("nombre_completo") ?? "",
        id_institucion: a.institutionId,
        diagnosticos: [],
      });
      return (await this.one(ref.id))!;
    });
  }
  findById(id: string) {
    return this.x.op(() => this.one(id));
  }
  list(filter: AppointmentFilter) {
    let q = this.x.scoped("consultas");
    if (filter.doctorId) q = q.where("id_medico", "==", filter.doctorId);
    if (filter.patientId) q = q.where("id_paciente", "==", filter.patientId);
    if (filter.date) {
      const [from, to] = dayRange(filter.date);
      q = q.where("fecha_hora", ">=", Timestamp.fromDate(from)).where("fecha_hora", "<", Timestamp.fromDate(to));
    }
    return this.x.op(() => this.query(q));
  }
  listByDoctor(doctorId: string, date: string) {
    return this.list({ doctorId, date });
  }
  findByDoctorAt(doctorId: string, scheduledAt: LocalDateTime) {
    return this.x.op(async () =>
      (await this.query(this.x.scoped("consultas").where("id_medico", "==", doctorId).where("fecha_hora", "==", m.ts(scheduledAt)))).filter(
        (a) => a.status !== "cancelada",
      ),
    );
  }
  private async set(id: string, data: DocumentData) {
    return this.x.op(async () => {
      if (!(await this.one(id))) return null;
      await this.x.col("consultas").doc(id).update(data);
      return this.one(id);
    });
  }
  async reschedule(id: string, c: { scheduledAt?: LocalDateTime; reason?: string; doctorId?: string }) {
    const data: DocumentData = {};
    if (c.scheduledAt) data.fecha_hora = m.ts(c.scheduledAt);
    if (c.reason) data.motivo_consulta = c.reason;
    if (c.doctorId) {
      data.id_medico = c.doctorId;
      data.nombre_medico = (await this.x.col("medicos").doc(c.doctorId).get()).get("nombre_completo") ?? "";
    }
    return this.set(id, data);
  }
  updateStatus(id: string, status: ConsultationStatus) {
    return this.set(id, { estado: status });
  }
}

// ───────────────────── Encuentro clínico (runTransaction) ─────────────────────
class FirestoreEncounterRepository implements IPrescriptionPort {
  constructor(private readonly x: FsContext) {}
  private async one(id: string): Promise<Consultation | null> {
    guard(this.x.ctx, "clinical:read");
    const s = await this.x.col("consultas").doc(id).get();
    return s.exists && s.get("id_institucion") === this.x.ctx.institutionId ? m.toConsultation(s) : null;
  }

  /**
   * Eje B con runTransaction(): Firestore exige leer antes de escribir, así que
   * primero se leen consulta/médico/medicamentos; luego se encolan las escrituras
   * (consulta + paciente.ultima_visita) y por último se valida la integridad de
   * las recetas. Si un medicamento no existe se lanza el error y Firestore
   * descarta TODAS las escrituras encoladas.
   */
  async saveEncounter(e: EncounterWrite): Promise<Consultation> {
    guard(this.x.ctx, "clinical:write");
    const ref = e.consultationId ? this.x.col("consultas").doc(e.consultationId) : this.x.col("consultas").doc();
    return this.x
      .tx(async (t) => {
        const current = e.consultationId ? await t.get(ref) : null;
        const doctor = await t.get(this.x.col("medicos").doc(e.doctorId));
        const { names, missing } = await this.x.medicineNames(t, medicineIds(e.diagnoses));
        const diagnosticos = e.diagnoses.map((d) => m.diagnosisDoc(d, names));

        if (current) {
          if (!current.exists || current.get("estado") !== "programada" || current.get("id_institucion") !== this.x.ctx.institutionId)
            throw new ConflictError("La consulta ya no está programada");
          t.update(ref, {
            motivo_consulta: e.reason,
            notas_clinicas: e.notes,
            estado: e.status,
            ...(diagnosticos.length && {
              diagnosticos: FieldValue.arrayUnion(...diagnosticos),
              ids_diagnosticos: FieldValue.arrayUnion(...diagnosticos.map((d) => d.id)),
            }),
          });
        } else {
          t.set(ref, {
            fecha_hora: m.ts(e.scheduledAt),
            motivo_consulta: e.reason,
            notas_clinicas: e.notes,
            estado: e.status,
            id_paciente: e.patientId,
            id_medico: e.doctorId,
            nombre_medico: doctor.get("nombre_completo") ?? "",
            id_institucion: e.institutionId,
            diagnosticos,
            ids_diagnosticos: diagnosticos.map((d) => d.id),
          });
        }
        if (e.status === "atendida") t.update(this.x.col("pacientes").doc(e.patientId), { ultima_visita: m.ts(e.scheduledAt) });
        if (missing) throw new ValidationError("Medicamento inexistente en el catálogo");
      })
      .then(() => this.x.op(async () => (await this.one(ref.id))!));
  }

  findEncounter(id: string) {
    return this.x.op(() => this.one(id));
  }

  /** Reescribe el arreglo de diagnósticos de la consulta dentro de una transacción. */
  private async mutateDiagnoses(consultationId: string, mutate: (list: DocumentData[], names: Map<string, string>) => void, medicines: string[]) {
    guard(this.x.ctx, "clinical:write");
    const ref = this.x.col("consultas").doc(consultationId);
    return this.x
      .tx(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists || snap.get("id_institucion") !== this.x.ctx.institutionId) throw new NotFoundError("Consulta no encontrada");
        const { names, missing } = await this.x.medicineNames(t, medicines);
        const list = [...(snap.get("diagnosticos") ?? [])];
        mutate(list, names);
        t.update(ref, { diagnosticos: list, ids_diagnosticos: list.map((d) => d.id) });
        if (missing) throw new ValidationError("Medicamento inexistente en el catálogo");
      })
      .then(() => this.x.op(async () => (await this.one(consultationId))!));
  }

  addDiagnosis(consultationId: string, d: Diagnosis) {
    return this.mutateDiagnoses(consultationId, (list, names) => list.push(m.diagnosisDoc(d, names)), medicineIds([d]));
  }

  /** OP-FAR-02/03 */
  async addTreatmentWithPrescription(diagnosisId: string, t: Treatment) {
    guard(this.x.ctx, "clinical:write");
    // Firestore no consulta dentro de arreglos de mapas: ids_diagnosticos es un índice array-contains.
    const found = await this.x.op(() => this.x.scoped("consultas").where("ids_diagnosticos", "array-contains", diagnosisId).limit(1).get());
    const owner = found.docs[0];
    if (!owner) throw new NotFoundError("Diagnóstico no encontrado");
    return this.mutateDiagnoses(
      owner.id,
      (list, names) => {
        const dx = list.find((d) => d.id === diagnosisId)!;
        dx.tratamientos = [...dx.tratamientos, m.treatmentDoc(t, names)];
      },
      t.prescriptions.map((p) => p.medicineId),
    );
  }

  async getPatientHistory(patientId: string) {
    guard(this.x.ctx, "clinical:read");
    return this.x.op(async () =>
      (await this.x.scoped("consultas").where("id_paciente", "==", patientId).get()).docs
        .map(m.toConsultation)
        .filter((c) => c.status === "atendida" || (c.status === "programada" && c.notes != null))
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    );
  }
}

// ─────────────────────────────── Laboratorio ───────────────────────────────
class FirestoreLabRepository implements ILabPort {
  constructor(private readonly x: FsContext) {}
  private async one(id: string): Promise<LabOrder | null> {
    guard(this.x.ctx, "lab:read");
    const s = await this.x.col("examenes_laboratorio").doc(id).get();
    return s.exists && s.get("id_institucion") === this.x.ctx.institutionId ? m.toLabOrder(s) : null;
  }
  async createOrder(o: NewLabOrder) {
    guard(this.x.ctx, "lab:write");
    return this.x.op(async () => {
      const consulta = await this.x.col("consultas").doc(o.consultationId).get();
      if (!consulta.exists || consulta.get("id_institucion") !== this.x.ctx.institutionId) throw new ValidationError("La consulta referenciada no existe");
      const tipo = await this.x.col("tipos_examen").doc(o.examTypeId).get();
      if (!tipo.exists) throw new ValidationError("Tipo de examen inexistente");
      const ref = await this.x.col("examenes_laboratorio").add({
        fecha_solicitud: m.ts(o.requestedAt),
        estado: "solicitado",
        id_consulta: consulta.id,
        id_paciente: consulta.get("id_paciente"),
        id_tipo_examen: tipo.id,
        nombre_tipo: tipo.get("nombre"),
        solicitado_por: consulta.get("nombre_medico"),
        id_institucion: this.x.ctx.institutionId,
        resultados: o.results.map((r) => ({ parametro: r.parameter, valor_obtenido: r.value, rango_referencia: r.referenceRange, observaciones: r.observations })),
      });
      return (await this.one(ref.id))!;
    });
  }
  async updateStatus(id: string, status: LabStatus) {
    guard(this.x.ctx, "lab:write");
    return this.x.op(async () => {
      if (!(await this.one(id))) return null;
      await this.x.col("examenes_laboratorio").doc(id).update({ estado: status });
      return this.one(id);
    });
  }
  async addResults(id: string, results: LabResult[], status: LabStatus) {
    guard(this.x.ctx, "lab:write");
    const ref = this.x.col("examenes_laboratorio").doc(id);
    return this.x
      .tx(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists || snap.get("id_institucion") !== this.x.ctx.institutionId) return false;
        const merged: DocumentData[] = [...snap.get("resultados")];
        for (const r of results) {
          const i = merged.findIndex((x) => x.parametro === r.parameter);
          const next = { ...(i >= 0 ? merged[i] : {}), parametro: r.parameter, valor_obtenido: r.value, rango_referencia: r.referenceRange, observaciones: r.observations };
          if (i >= 0) merged[i] = next;
          else merged.push(next);
        }
        t.update(ref, { resultados: merged, estado: status });
        return true;
      })
      .then((ok) => (ok ? this.x.op(() => this.one(id)) : null));
  }
  getOrderReport(id: string) {
    return this.x.op(() => this.one(id));
  }
  async list(filter: { patientId?: string }) {
    guard(this.x.ctx, "lab:read");
    let q = this.x.scoped("examenes_laboratorio");
    if (filter.patientId) q = q.where("id_paciente", "==", filter.patientId);
    return this.x.op(async () => (await q.get()).docs.map(m.toLabOrder).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)));
  }
}

// ───────────────────── Pediatría: subcolecciones pacientes/{id}/crecimiento|vacunas ─────────────────────
class FirestorePediatricRepository implements IPediatricPort {
  constructor(private readonly x: FsContext) {}
  private async sub(patientId: string, name: string, orderBy: string) {
    guard(this.x.ctx, "clinical:read");
    const patient = await this.x.col("pacientes").doc(patientId).get();
    if (!patient.exists || patient.get("id_institucion") !== this.x.ctx.institutionId) return [];
    return (await patient.ref.collection(name).orderBy(orderBy).get()).docs;
  }
  listGrowth(patientId: string) {
    return this.x.op(async () => (await this.sub(patientId, "crecimiento", "fecha_medicion")).map(m.toGrowth));
  }
  listVaccinations(patientId: string) {
    return this.x.op(async () => (await this.sub(patientId, "vacunas", "fecha_aplicacion")).map(m.toDose));
  }
}

// ─────────────────────────────── Catálogos y médicos ───────────────────────────────
class FirestoreCatalogRepository implements ICatalogPort {
  constructor(private readonly x: FsContext) {}
  private all<T>(name: string, map: (s: DocumentSnapshot) => T) {
    return this.x.op(async () => (await this.x.col(name).get()).docs.map(map));
  }
  private add<T extends object>(name: string, data: DocumentData, value: T) {
    return this.x.op(async () => ({ ...value, id: (await this.x.col(name).add(data)).id }));
  }
  listMedicines() {
    return this.all("medicamentos", m.toMedicine).then((l) => l.sort((a, b) => a.genericName.localeCompare(b.genericName)));
  }
  listVaccines() {
    return this.all("vacunas", m.toVaccine);
  }
  listExamTypes() {
    return this.all("tipos_examen", m.toExamType);
  }
  addMedicine(x: Omit<Medicine, "id">) {
    return this.add("medicamentos", { nombre_generico: x.genericName, nombre_comercial: x.brandName, presentacion: x.presentation, concentracion: x.concentration }, x);
  }
  addVaccine(x: Omit<Vaccine, "id">) {
    return this.add("vacunas", { nombre_vacuna: x.name, dosis_requeridas: x.requiredDoses }, x);
  }
  addExamType(x: Omit<ExamType, "id">) {
    return this.add("tipos_examen", { nombre: x.name, descripcion: x.description }, x);
  }
}

class FirestoreDoctorRepository implements IDoctorPort {
  constructor(private readonly x: FsContext) {}
  list() {
    return this.x.op(async () => (await this.x.scoped("medicos").get()).docs.map(m.toDoctor).sort((a, b) => a.fullName.localeCompare(b.fullName)));
  }
  findById(id: string) {
    return this.x.op(async () => {
      const s = await this.x.col("medicos").doc(id).get();
      return s.exists && s.get("id_institucion") === this.x.ctx.institutionId ? m.toDoctor(s) : null;
    });
  }
  create(d: NewDoctor): Promise<Doctor> {
    return this.x.op(async () => {
      const ref = await this.x.col("medicos").add({
        nombre_completo: d.fullName,
        no_colegiado: d.licenseNumber,
        especialidad: d.specialty,
        estado: d.status,
        id_institucion: d.institutionId,
      });
      return { ...d, id: ref.id };
    });
  }
}

/** Centro Médico Pediátrico (i4). Con FIRESTORE_EMULATOR_HOST definido, firebase-admin usa el emulador. */
export class FirestoreProvider implements EngineProvider {
  readonly descriptor = { key: "firestore", label: "Firestore" };
  private readonly app: App;
  private readonly db: Firestore;

  constructor(projectId: string) {
    this.app = getApps().find((a) => a.name === "red-clinica") ?? initializeApp({ projectId }, "red-clinica");
    this.db = getFirestore(this.app);
  }

  repositories(ctx: AccessContext): InstitutionRepositories {
    const x = new FsContext(this.db, ctx);
    return {
      patients: new FirestorePatientRepository(x),
      consultations: new FirestoreConsultationRepository(x),
      encounters: new FirestoreEncounterRepository(x),
      lab: new FirestoreLabRepository(x),
      catalogs: new FirestoreCatalogRepository(x),
      doctors: new FirestoreDoctorRepository(x),
      pediatrics: new FirestorePediatricRepository(x),
    };
  }

  async ping() {
    await this.db.listCollections();
  }

  async close() {
    await this.db.terminate();
  }
}
