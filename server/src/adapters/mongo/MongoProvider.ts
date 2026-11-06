import { MongoClient, MongoServerError, ObjectId, type ClientSession, type Db, type Document, type UpdateFilter } from "mongodb";

/** $push / $set sobre colecciones sin tipar (los tipos del driver no aceptan Document genérico). */
const upd = (u: Document) => u as UpdateFilter<Document>;
import type { Doctor, ExamType, Medicine, NewDoctor, Vaccine } from "../../domain/Catalog.ts";
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
  IPrescriptionPort,
} from "../../ports/index.ts";
import { guard } from "../shared/guards.ts";
import { dayRange, toNaiveDate } from "../shared/naiveTime.ts";
import * as m from "./mappers.ts";

/** Errores del servidor Mongo → dominio. */
export function translateMongoError(e: unknown): Error {
  if (e instanceof DomainError) return e;
  if (e instanceof MongoServerError) {
    if (e.code === 11000) {
      const key = JSON.stringify(e.keyPattern ?? e.message);
      if (key.includes("dpi_cui")) return new ConflictError("Ya existe un paciente con este DPI/CUI");
      if (key.includes("correo")) return new ConflictError("Este correo ya está registrado");
      if (key.includes("id_medico")) return new ConflictError("El médico ya tiene una consulta en ese horario");
      return new ConflictError("Registro duplicado");
    }
    if (e.code === 121) return new ValidationError("El documento no cumple el esquema de validación ($jsonSchema)");
  }
  return e instanceof Error ? e : new Error(String(e));
}

/** Contexto compartido por los repositorios Mongo de una petición. */
class MongoContext {
  constructor(
    readonly client: MongoClient,
    readonly db: Db,
    readonly ctx: AccessContext,
  ) {}

  col(name: string) {
    return this.db.collection(name);
  }

  async op<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (e) {
      throw translateMongoError(e);
    }
  }

  /** Eje B: transacción multi-documento (requiere replica set). Cualquier excepción aborta todo. */
  async tx<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(work, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    } catch (e) {
      throw translateMongoError(e);
    } finally {
      await session.endSession();
    }
  }

  async doctorNames(ids: ObjectId[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const docs = await this.col("medicos").find({ _id: { $in: ids } }, { projection: { nombre_completo: 1 } }).toArray();
    return new Map(docs.map((d) => [d._id.toHexString(), d.nombre_completo]));
  }

  /** Mongo no tiene FKs: integridad referencial de recetas → medicamentos verificada dentro de la transacción. */
  async assertMedicinesExist(refs: ObjectId[], session: ClientSession) {
    const unique = [...new Map(refs.map((r) => [r.toHexString(), r])).values()];
    if (!unique.length) return;
    const found = await this.col("medicamentos").countDocuments({ _id: { $in: unique } }, { session });
    if (found !== unique.length) throw new ValidationError("Medicamento inexistente en el catálogo");
  }
}

// ─────────────────────────────── Pacientes ───────────────────────────────
class MongoPatientRepository implements IPatientPort {
  constructor(private readonly x: MongoContext) {}
  private scope(extra: Document = {}) {
    return { ...extra, id_institucion: this.x.ctx.institutionId };
  }
  private async findOne(filter: Document) {
    const d = await this.x.col("pacientes").findOne(this.scope(filter));
    return d ? m.toPatient(d) : null;
  }

  /** OP-PAC-01: alergias y contactos embebidos → un solo documento, atomicidad nativa. */
  create(p: NewPatient): Promise<Patient> {
    return this.x.op(async () => {
      const doc = {
        primer_nombre: p.firstName,
        segundo_nombre: p.middleName,
        primer_apellido: p.lastName,
        segundo_apellido: p.secondLastName,
        fecha_nacimiento: toNaiveDate(p.birthDate),
        sexo: p.sex,
        dpi_cui: p.dpi,
        telefono: p.phone,
        correo: p.email,
        direccion: p.address,
        municipio: p.municipality,
        departamento: p.department,
        tipo_sangre: p.bloodType,
        fecha_registro: toNaiveDate(new Date().toISOString().slice(0, 16)),
        estado: "activo",
        id_institucion: p.institutionId,
        ultima_visita: null,
        alergias: p.allergies.map(m.allergyDoc),
        contactos_emergencia: p.emergencyContacts.map(m.contactDoc),
      };
      const { insertedId } = await this.x.col("pacientes").insertOne(doc);
      return m.toPatient({ ...doc, _id: insertedId });
    });
  }
  findById(id: string) {
    const _id = m.oid(id);
    return _id ? this.x.op(() => this.findOne({ _id })) : Promise.resolve(null);
  }
  findByDpi(dpi: string) {
    return this.x.op(() => this.findOne({ dpi_cui: dpi }));
  }
  findByEmail(email: string) {
    return this.x.op(() => this.findOne({ correo: email.toLowerCase() }));
  }
  list() {
    return this.x.op(async () =>
      (await this.x.col("pacientes").find(this.scope()).sort({ primer_apellido: 1, primer_nombre: 1 }).toArray()).map(m.toPatient),
    );
  }
  private patch(id: string, update: UpdateFilter<Document>) {
    const _id = m.oid(id);
    if (!_id) return Promise.resolve(null);
    return this.x.op(async () => {
      const d = await this.x.col("pacientes").findOneAndUpdate(this.scope({ _id }), update, { returnDocument: "after" });
      return d ? m.toPatient(d) : null;
    });
  }
  update(id: string, changes: PatientChanges) {
    const $set = Object.fromEntries(Object.entries(changes).map(([k, v]) => [m.PATIENT_FIELDS[k as keyof PatientChanges], v]));
    return this.patch(id, { $set });
  }
  updateStatus(id: string, status: PatientStatus) {
    return this.patch(id, { $set: { estado: status } });
  }
  /** OP-PAC-02: $push sobre arreglos embebidos (atómico en el documento). */
  addEmergencyContacts(id: string, contacts: EmergencyContact[]) {
    return this.patch(id, upd({ $push: { contactos_emergencia: { $each: contacts.map(m.contactDoc) } } }));
  }
  addAllergies(id: string, allergies: Allergy[]) {
    return this.patch(id, upd({ $push: { alergias: { $each: allergies.map(m.allergyDoc) } } }));
  }
}

// ───────────────────── Agenda: proyección confidencial en el adaptador ─────────────────────
const CONFIDENTIAL_PROJECTION = { notas_clinicas: 0, diagnosticos: 0 } as const;

class MongoConsultationRepository implements IConsultationPort {
  constructor(private readonly x: MongoContext) {}
  private async find(filter: Document): Promise<Appointment[]> {
    const docs = await this.x
      .col("consultas")
      .find({ ...filter, id_institucion: this.x.ctx.institutionId }, { projection: CONFIDENTIAL_PROJECTION })
      .sort({ fecha_hora: 1 })
      .toArray();
    const names = await this.x.doctorNames(docs.map((d) => d.id_medico));
    return docs.map((d) => m.toAppointment(d, names));
  }
  private async one(_id: ObjectId) {
    return (await this.find({ _id }))[0] ?? null;
  }
  create(a: NewAppointment) {
    return this.x.op(async () => {
      const { insertedId } = await this.x.col("consultas").insertOne({
        fecha_hora: toNaiveDate(a.scheduledAt),
        motivo_consulta: a.reason,
        notas_clinicas: null,
        estado: "programada",
        id_paciente: m.oidOrThrowaway(a.patientId),
        id_medico: m.oidOrThrowaway(a.doctorId),
        id_institucion: a.institutionId,
        diagnosticos: [],
      });
      return (await this.one(insertedId))!;
    });
  }
  findById(id: string) {
    const _id = m.oid(id);
    return _id ? this.x.op(() => this.one(_id)) : Promise.resolve(null);
  }
  list(filter: AppointmentFilter) {
    const q: Document = {};
    if (filter.doctorId) q.id_medico = m.oid(filter.doctorId);
    if (filter.patientId) q.id_paciente = m.oid(filter.patientId);
    if (filter.date) {
      const [from, to] = dayRange(filter.date);
      q.fecha_hora = { $gte: from, $lt: to };
    }
    return this.x.op(() => this.find(q));
  }
  listByDoctor(doctorId: string, date: string) {
    return this.list({ doctorId, date });
  }
  findByDoctorAt(doctorId: string, scheduledAt: LocalDateTime) {
    return this.x.op(() => this.find({ id_medico: m.oid(doctorId), fecha_hora: toNaiveDate(scheduledAt), estado: { $ne: "cancelada" } }));
  }
  private set(id: string, $set: Document) {
    const _id = m.oid(id);
    if (!_id) return Promise.resolve(null);
    return this.x.op(async () => {
      await this.x.col("consultas").updateOne({ _id, id_institucion: this.x.ctx.institutionId }, { $set });
      return this.one(_id);
    });
  }
  reschedule(id: string, c: { scheduledAt?: LocalDateTime; reason?: string; doctorId?: string }) {
    const $set: Document = {};
    if (c.scheduledAt) $set.fecha_hora = toNaiveDate(c.scheduledAt);
    if (c.reason) $set.motivo_consulta = c.reason;
    if (c.doctorId) $set.id_medico = m.oidOrThrowaway(c.doctorId);
    return this.set(id, $set);
  }
  updateStatus(id: string, status: ConsultationStatus) {
    return this.set(id, { estado: status });
  }
}

// ───────────────────── Encuentro clínico (diagnósticos/tratamientos/recetas embebidos) ─────────────────────
class MongoEncounterRepository implements IPrescriptionPort {
  constructor(private readonly x: MongoContext) {}

  private async hydrate(docs: Document[]): Promise<Consultation[]> {
    const names = await this.x.doctorNames(docs.map((d) => d.id_medico));
    const medIds = docs.flatMap((d) => m.medicineRefs(d.diagnosticos ?? []));
    const meds = medIds.length ? await this.x.col("medicamentos").find({ _id: { $in: medIds } }).toArray() : [];
    const medicines = new Map(meds.map((d) => [d._id.toHexString(), m.toMedicine(d)]));
    return docs.map((d) => m.toConsultation(d, names, medicines));
  }
  private async one(_id: ObjectId) {
    guard(this.x.ctx, "clinical:read");
    const d = await this.x.col("consultas").findOne({ _id, id_institucion: this.x.ctx.institutionId });
    return d ? (await this.hydrate([d]))[0] : null;
  }

  /**
   * Eje B con session.withTransaction():
   *   1) consulta (con diagnósticos/tratamientos/recetas embebidos)
   *   2) paciente.ultima_visita (segundo documento)
   *   3) verificación referencial de recetas → si falla se aborta TODO.
   */
  async saveEncounter(e: EncounterWrite): Promise<Consultation> {
    guard(this.x.ctx, "clinical:write");
    return this.x
      .tx(async (session) => {
        const diagnosticos = e.diagnoses.map(m.diagnosisDoc);
        let _id: ObjectId;
        if (e.consultationId) {
          _id = m.oidOrThrowaway(e.consultationId);
          const r = await this.x
            .col("consultas")
            .updateOne(
              { _id, id_institucion: this.x.ctx.institutionId, estado: "programada" },
              upd({ $set: { motivo_consulta: e.reason, notas_clinicas: e.notes, estado: e.status }, $push: { diagnosticos: { $each: diagnosticos } } }),
              { session },
            );
          if (!r.matchedCount) throw new ConflictError("La consulta ya no está programada");
        } else {
          _id = (
            await this.x.col("consultas").insertOne(
              {
                fecha_hora: toNaiveDate(e.scheduledAt),
                motivo_consulta: e.reason,
                notas_clinicas: e.notes,
                estado: e.status,
                id_paciente: m.oidOrThrowaway(e.patientId),
                id_medico: m.oidOrThrowaway(e.doctorId),
                id_institucion: e.institutionId,
                diagnosticos,
              },
              { session },
            )
          ).insertedId;
        }
        if (e.status === "atendida")
          await this.x
            .col("pacientes")
            .updateOne(
              { _id: m.oidOrThrowaway(e.patientId), id_institucion: this.x.ctx.institutionId },
              { $max: { ultima_visita: toNaiveDate(e.scheduledAt) } },
              { session },
            );
        await this.x.assertMedicinesExist(m.medicineRefs(diagnosticos), session);
        return _id;
      })
      .then((id) => this.x.op(async () => (await this.one(id))!));
  }

  findEncounter(id: string) {
    const _id = m.oid(id);
    return _id ? this.x.op(() => this.one(_id)) : Promise.resolve(null);
  }

  /** OP-FAR-01 */
  async addDiagnosis(consultationId: string, d: Diagnosis) {
    guard(this.x.ctx, "clinical:write");
    const _id = m.oidOrThrowaway(consultationId);
    return this.x
      .tx(async (session) => {
        const doc = m.diagnosisDoc(d);
        const r = await this.x
          .col("consultas")
          .updateOne({ _id, id_institucion: this.x.ctx.institutionId }, upd({ $push: { diagnosticos: doc } }), { session });
        if (!r.matchedCount) throw new NotFoundError("Consulta no encontrada");
        await this.x.assertMedicinesExist(m.medicineRefs([doc]), session);
      })
      .then(() => this.x.op(async () => (await this.one(_id))!));
  }

  /** OP-FAR-02/03: $push con arrayFilters sobre el diagnóstico embebido + verificación de medicamentos, en transacción. */
  async addTreatmentWithPrescription(diagnosisId: string, t: Treatment) {
    guard(this.x.ctx, "clinical:write");
    const dxId = m.oidOrThrowaway(diagnosisId);
    return this.x
      .tx(async (session) => {
        const doc = m.treatmentDoc(t);
        const owner = await this.x
          .col("consultas")
          .findOneAndUpdate(
            { "diagnosticos._id": dxId, id_institucion: this.x.ctx.institutionId },
            upd({ $push: { "diagnosticos.$[d].tratamientos": doc } }),
            { arrayFilters: [{ "d._id": dxId }], session, projection: { _id: 1 } },
          );
        if (!owner) throw new NotFoundError("Diagnóstico no encontrado");
        await this.x.assertMedicinesExist(
          doc.recetas.map((r) => r.id_medicamento),
          session,
        );
        return owner._id as ObjectId;
      })
      .then((id) => this.x.op(async () => (await this.one(id))!));
  }

  async getPatientHistory(patientId: string) {
    guard(this.x.ctx, "clinical:read");
    const pid = m.oid(patientId);
    if (!pid) return Promise.resolve([]);
    return this.x.op(async () =>
      this.hydrate(
        await this.x
          .col("consultas")
          .find({
            id_paciente: pid,
            id_institucion: this.x.ctx.institutionId,
            $or: [{ estado: "atendida" }, { estado: "programada", notas_clinicas: { $ne: null } }],
          })
          .sort({ fecha_hora: -1 })
          .toArray(),
      ),
    );
  }
}

// ─────────────────────────────── Laboratorio ───────────────────────────────
class MongoLabRepository implements ILabPort {
  constructor(private readonly x: MongoContext) {}

  private async hydrate(docs: Document[]): Promise<LabOrder[]> {
    if (!docs.length) return [];
    const [types, consultas] = await Promise.all([
      this.x.col("tipos_examen").find({ _id: { $in: docs.map((d) => d.id_tipo_examen) } }).toArray(),
      this.x.col("consultas").find({ _id: { $in: docs.map((d) => d.id_consulta) } }, { projection: { id_medico: 1 } }).toArray(),
    ]);
    const names = await this.x.doctorNames(consultas.map((c) => c.id_medico));
    const requestedBy = new Map(consultas.map((c) => [c._id.toHexString(), names.get(c.id_medico.toHexString()) ?? ""]));
    return docs.map((d) => m.toLabOrder(d, new Map(types.map((t) => [t._id.toHexString(), t.nombre])), requestedBy));
  }
  /** Las órdenes pertenecen a la sede a través de su consulta. */
  private async find(filter: Document) {
    guard(this.x.ctx, "lab:read");
    const own = await this.x.col("consultas").distinct("_id", { id_institucion: this.x.ctx.institutionId });
    return this.hydrate(
      await this.x
        .col("examenes_laboratorio")
        .find({ ...filter, id_consulta: { $in: own } })
        .sort({ fecha_solicitud: -1 })
        .toArray(),
    );
  }
  private async one(_id: ObjectId) {
    return (await this.find({ _id }))[0] ?? null;
  }

  /** OP-LAB-01: la orden REFERENCIA consulta y paciente. */
  async createOrder(o: NewLabOrder) {
    guard(this.x.ctx, "lab:write");
    return this.x.op(async () => {
      const consulta = await this.x
        .col("consultas")
        .findOne({ _id: m.oidOrThrowaway(o.consultationId), id_institucion: this.x.ctx.institutionId }, { projection: { id_paciente: 1 } });
      if (!consulta) throw new ValidationError("La consulta referenciada no existe");
      const tipo = await this.x.col("tipos_examen").findOne({ _id: m.oidOrThrowaway(o.examTypeId) });
      if (!tipo) throw new ValidationError("Tipo de examen inexistente");
      const { insertedId } = await this.x.col("examenes_laboratorio").insertOne({
        fecha_solicitud: toNaiveDate(o.requestedAt),
        estado: "solicitado",
        id_consulta: consulta._id,
        id_paciente: consulta.id_paciente,
        id_tipo_examen: tipo._id,
        resultados: o.results.map((r) => ({ parametro: r.parameter, valor_obtenido: r.value, rango_referencia: r.referenceRange, observaciones: r.observations })),
      });
      return (await this.one(insertedId))!;
    });
  }
  async updateStatus(id: string, status: LabStatus) {
    guard(this.x.ctx, "lab:write");
    const _id = m.oid(id);
    if (!_id) return Promise.resolve(null);
    return this.x.op(async () => {
      await this.x.col("examenes_laboratorio").updateOne({ _id }, { $set: { estado: status } });
      return this.one(_id);
    });
  }
  /**
   * OP-LAB-03: un único updateOne sobre el documento (atomicidad de documento único).
   * Se fusiona por parámetro conservando campos heterogéneos ya presentes (p. ej. "unidad").
   */
  async addResults(id: string, results: LabResult[], status: LabStatus) {
    guard(this.x.ctx, "lab:write");
    const _id = m.oid(id);
    if (!_id) return Promise.resolve(null);
    return this.x.op(async () => {
      const current = await this.x.col("examenes_laboratorio").findOne({ _id });
      if (!current) return null;
      const merged: Document[] = [...current.resultados];
      for (const r of results) {
        const i = merged.findIndex((x) => x.parametro === r.parameter);
        const next = { ...(i >= 0 ? merged[i] : {}), parametro: r.parameter, valor_obtenido: r.value, rango_referencia: r.referenceRange, observaciones: r.observations };
        if (i >= 0) merged[i] = next;
        else merged.push(next);
      }
      const r = await this.x
        .col("examenes_laboratorio")
        .updateOne({ _id, estado: current.estado }, { $set: { resultados: merged, estado: status } });
      if (!r.matchedCount) throw new ConflictError("La orden cambió de estado durante la captura; intente de nuevo");
      return this.one(_id);
    });
  }
  getOrderReport(id: string) {
    const _id = m.oid(id);
    return _id ? this.x.op(() => this.one(_id)) : Promise.resolve(null);
  }
  list(filter: { patientId?: string }) {
    return this.x.op(() => this.find(filter.patientId ? { id_paciente: m.oid(filter.patientId) } : {}));
  }
}

// ─────────────────────────────── Catálogos y médicos ───────────────────────────────
class MongoCatalogRepository implements ICatalogPort {
  constructor(private readonly x: MongoContext) {}
  private all<T>(name: string, sort: Document, map: (d: Document) => T) {
    return this.x.op(async () => (await this.x.col(name).find().sort(sort).toArray()).map(map));
  }
  private add<T extends object>(name: string, doc: Document, value: T) {
    return this.x.op(async () => ({ ...value, id: (await this.x.col(name).insertOne(doc)).insertedId.toHexString() }));
  }
  listMedicines() {
    return this.all("medicamentos", { nombre_generico: 1 }, m.toMedicine);
  }
  listVaccines() {
    return this.all("vacunas", { _id: 1 }, m.toVaccine);
  }
  listExamTypes() {
    return this.all("tipos_examen", { _id: 1 }, m.toExamType);
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

class MongoDoctorRepository implements IDoctorPort {
  constructor(private readonly x: MongoContext) {}
  list() {
    return this.x.op(async () =>
      (await this.x.col("medicos").find({ id_institucion: this.x.ctx.institutionId }).sort({ nombre_completo: 1 }).toArray()).map(m.toDoctor),
    );
  }
  findById(id: string) {
    const _id = m.oid(id);
    if (!_id) return Promise.resolve(null);
    return this.x.op(async () => {
      const d = await this.x.col("medicos").findOne({ _id, id_institucion: this.x.ctx.institutionId });
      return d ? m.toDoctor(d) : null;
    });
  }
  create(d: NewDoctor): Promise<Doctor> {
    return this.x.op(async () => {
      const { insertedId } = await this.x.col("medicos").insertOne({
        nombre_completo: d.fullName,
        no_colegiado: d.licenseNumber,
        especialidad: d.specialty,
        estado: d.status,
        id_institucion: d.institutionId,
      });
      return { ...d, id: insertedId.toHexString() };
    });
  }
}

/** Laboratorio Clínico (i3). */
export class MongoProvider implements EngineProvider {
  readonly descriptor = { key: "mongodb", label: "MongoDB" };
  private readonly client: MongoClient;
  private readonly db: Db;

  constructor(uri: string, dbName: string) {
    this.client = new MongoClient(uri);
    this.db = this.client.db(dbName);
  }

  repositories(ctx: AccessContext): InstitutionRepositories {
    const x = new MongoContext(this.client, this.db, ctx);
    return {
      patients: new MongoPatientRepository(x),
      consultations: new MongoConsultationRepository(x),
      encounters: new MongoEncounterRepository(x),
      lab: new MongoLabRepository(x),
      catalogs: new MongoCatalogRepository(x),
      doctors: new MongoDoctorRepository(x),
    };
  }

  async ping() {
    await this.db.command({ ping: 1 });
  }

  close() {
    return this.client.close();
  }
}
