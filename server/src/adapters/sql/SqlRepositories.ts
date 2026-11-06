/**
 * Repositorios relacionales (PostgreSQL y MySQL comparten el esquema maestro 3FN).
 * Solo traducen puertos ⇄ SQL; las reglas de negocio viven en el dominio.
 * Cada método corre en una transacción del motor (SqlEngine.run).
 */
import type { Doctor, ExamType, Medicine, NewDoctor, Vaccine } from "../../domain/Catalog.ts";
import type { Appointment, Consultation, Diagnosis, EncounterWrite, NewAppointment, Treatment } from "../../domain/Consultation.ts";
import { ConflictError, NotFoundError } from "../../domain/errors.ts";
import type { LabOrder, LabResult, NewLabOrder } from "../../domain/LabOrder.ts";
import type { Allergy, EmergencyContact, NewPatient, Patient, PatientChanges } from "../../domain/Patient.ts";
import type { Admission } from "../../domain/Specialty.ts";
import type { ConsultationStatus, LabStatus, LocalDateTime, PatientStatus } from "../../domain/values.ts";
import type {
  AccessContext,
  AppointmentFilter,
  IAdmissionPort,
  ICatalogPort,
  IConsultationPort,
  IDoctorPort,
  ILabPort,
  IPatientPort,
  IPrescriptionPort,
} from "../../ports/index.ts";
import { guard } from "../shared/guards.ts";
import * as m from "./mappers.ts";
import { placeholders, type Row, type SqlEngine, type SqlSession } from "./SqlSession.ts";

abstract class SqlRepository {
  constructor(
    protected readonly engine: SqlEngine,
    protected readonly ctx: AccessContext,
  ) {}
  protected run<T>(work: (s: SqlSession) => Promise<T>): Promise<T> {
    return this.engine.run(this.ctx, work);
  }
}

// ─────────────────────────────── Pacientes ───────────────────────────────
const SELECT_PATIENT = `
  SELECT p.*, (SELECT MAX(c.fecha_hora) FROM consulta c WHERE c.id_paciente = p.id_paciente AND c.estado = 'atendida') AS ultima_visita
  FROM paciente p`;

export class SqlPatientRepository extends SqlRepository implements IPatientPort {
  private async hydrate(s: SqlSession, rows: Row[]): Promise<Patient[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id_paciente);
    const [allergies, contacts] = await Promise.all([
      s.query(`SELECT * FROM paciente_alergia WHERE id_paciente IN (${placeholders(ids.length)}) ORDER BY id_paciente_alergia`, ids),
      s.query(`SELECT * FROM contacto_emergencia WHERE id_paciente IN (${placeholders(ids.length)}) ORDER BY id_contacto`, ids),
    ]);
    const byAllergy = m.groupBy(allergies, "id_paciente", m.toAllergy);
    const byContact = m.groupBy(contacts, "id_paciente", m.toContact);
    return rows.map((r) => m.toPatient(r, byAllergy.get(String(r.id_paciente)) ?? [], byContact.get(String(r.id_paciente)) ?? []));
  }

  private async findWhere(s: SqlSession, where: string, params: unknown[]): Promise<Patient | null> {
    const rows = await s.query(`${SELECT_PATIENT} WHERE ${where} AND p.id_institucion = ?`, [...params, this.ctx.institutionId]);
    return (await this.hydrate(s, rows))[0] ?? null;
  }

  private insertChildren(s: SqlSession, id: number, allergies: Allergy[], contacts: EmergencyContact[]) {
    return Promise.all([
      ...allergies.map((a) =>
        s.execute("INSERT INTO paciente_alergia (id_paciente, alergia, reaccion, severidad) VALUES (?, ?, ?, ?)", [id, a.substance, a.reaction, a.severity]),
      ),
      ...contacts.map((c) =>
        s.execute(
          "INSERT INTO contacto_emergencia (nombre_completo, parentesco, telefono, telefono_alternativo, id_paciente) VALUES (?, ?, ?, ?, ?)",
          [c.name, c.relationship, c.phone, c.alternativePhone, id],
        ),
      ),
    ]);
  }

  /** OP-PAC-01: paciente + alergias + contactos en una transacción. */
  create(p: NewPatient): Promise<Patient> {
    return this.run(async (s) => {
      const id = await s.insert(
        `INSERT INTO paciente (primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento, sexo, dpi_cui,
           telefono, correo, direccion, municipio, departamento, tipo_sangre, estado, id_institucion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?)`,
        [p.firstName, p.middleName, p.lastName, p.secondLastName, p.birthDate, p.sex, p.dpi, p.phone, p.email, p.address, p.municipality, p.department, p.bloodType, p.institutionId],
        "id_paciente",
      );
      await this.insertChildren(s, id, p.allergies, p.emergencyContacts);
      return (await this.findWhere(s, "p.id_paciente = ?", [id]))!;
    });
  }

  findById(id: string) {
    const pk = m.sqlId(id);
    return pk == null ? Promise.resolve(null) : this.run((s) => this.findWhere(s, "p.id_paciente = ?", [pk]));
  }

  findByDpi(dpi: string) {
    return this.run((s) => this.findWhere(s, "p.dpi_cui = ?", [dpi]));
  }

  findByEmail(email: string) {
    return this.run((s) => this.findWhere(s, "LOWER(p.correo) = ?", [email.toLowerCase()]));
  }

  list() {
    return this.run(async (s) =>
      this.hydrate(s, await s.query(`${SELECT_PATIENT} WHERE p.id_institucion = ? ORDER BY p.primer_apellido, p.primer_nombre`, [this.ctx.institutionId])),
    );
  }

  /** OP-PAC-04 */
  update(id: string, changes: PatientChanges) {
    const pk = m.sqlId(id);
    if (pk == null) return Promise.resolve(null);
    const entries = Object.entries(changes) as [keyof PatientChanges, string | null][];
    return this.run(async (s) => {
      if (entries.length)
        await s.execute(`UPDATE paciente SET ${entries.map(([k]) => `${m.PATIENT_COLUMNS[k]} = ?`).join(", ")} WHERE id_paciente = ? AND id_institucion = ?`, [
          ...entries.map(([, v]) => v),
          pk,
          this.ctx.institutionId,
        ]);
      return this.findWhere(s, "p.id_paciente = ?", [pk]);
    });
  }

  /** OP-PAC-05: baja lógica. */
  updateStatus(id: string, status: PatientStatus) {
    const pk = m.sqlId(id);
    if (pk == null) return Promise.resolve(null);
    return this.run(async (s) => {
      await s.execute("UPDATE paciente SET estado = ? WHERE id_paciente = ? AND id_institucion = ?", [status, pk, this.ctx.institutionId]);
      return this.findWhere(s, "p.id_paciente = ?", [pk]);
    });
  }

  /** OP-PAC-02 */
  addEmergencyContacts(id: string, contacts: EmergencyContact[]) {
    return this.addChildren(id, [], contacts);
  }

  addAllergies(id: string, allergies: Allergy[]) {
    return this.addChildren(id, allergies, []);
  }

  private addChildren(id: string, allergies: Allergy[], contacts: EmergencyContact[]) {
    const pk = m.sqlId(id);
    if (pk == null) return Promise.resolve(null);
    return this.run(async (s) => {
      if (!(await this.findWhere(s, "p.id_paciente = ?", [pk]))) return null;
      await this.insertChildren(s, pk, allergies, contacts);
      return this.findWhere(s, "p.id_paciente = ?", [pk]);
    });
  }
}

// ───────────────────────── Agenda (proyección confidencial) ─────────────────────────
/** v_agenda no expone notas_clinicas: es la única fuente de la agenda en ambos motores. */
export class SqlConsultationRepository extends SqlRepository implements IConsultationPort {
  private select(s: SqlSession, where: string[], params: unknown[]) {
    return s
      .query(`SELECT * FROM v_agenda WHERE ${["id_institucion = ?", ...where].join(" AND ")} ORDER BY fecha_hora`, [this.ctx.institutionId, ...params])
      .then((rows) => rows.map(m.toAppointment));
  }

  private one(s: SqlSession, id: number) {
    return this.select(s, ["id_consulta = ?"], [id]).then((r) => r[0] ?? null);
  }

  create(a: NewAppointment): Promise<Appointment> {
    return this.run(async (s) => {
      const id = await s.insert(
        "INSERT INTO consulta (fecha_hora, motivo_consulta, estado, id_paciente, id_medico, id_institucion) VALUES (?, ?, 'programada', ?, ?, ?)",
        [m.toSqlTimestamp(a.scheduledAt), a.reason, m.sqlId(a.patientId), m.sqlId(a.doctorId), a.institutionId],
        "id_consulta",
      );
      return (await this.one(s, id))!;
    });
  }

  findById(id: string) {
    const pk = m.sqlId(id);
    return pk == null ? Promise.resolve(null) : this.run((s) => this.one(s, pk));
  }

  list(filter: AppointmentFilter) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.doctorId) where.push("id_medico = ?"), params.push(m.sqlId(filter.doctorId));
    if (filter.patientId) where.push("id_paciente = ?"), params.push(m.sqlId(filter.patientId));
    if (filter.date) where.push("fecha_hora >= ? AND fecha_hora < ?"), params.push(`${filter.date} 00:00:00`, `${filter.date} 23:59:59.999`);
    return this.run((s) => this.select(s, where, params));
  }

  listByDoctor(doctorId: string, date: string) {
    return this.list({ doctorId, date });
  }

  findByDoctorAt(doctorId: string, scheduledAt: LocalDateTime) {
    return this.run((s) =>
      this.select(s, ["id_medico = ?", "fecha_hora = ?", "estado <> 'cancelada'"], [m.sqlId(doctorId), m.toSqlTimestamp(scheduledAt)]),
    );
  }

  reschedule(id: string, changes: { scheduledAt?: LocalDateTime; reason?: string; doctorId?: string }) {
    const pk = m.sqlId(id);
    if (pk == null) return Promise.resolve(null);
    const sets: [string, unknown][] = [];
    if (changes.scheduledAt) sets.push(["fecha_hora", m.toSqlTimestamp(changes.scheduledAt)]);
    if (changes.reason) sets.push(["motivo_consulta", changes.reason]);
    if (changes.doctorId) sets.push(["id_medico", m.sqlId(changes.doctorId)]);
    return this.run(async (s) => {
      if (sets.length)
        await s.execute(`UPDATE consulta SET ${sets.map(([c]) => `${c} = ?`).join(", ")} WHERE id_consulta = ? AND id_institucion = ?`, [
          ...sets.map(([, v]) => v),
          pk,
          this.ctx.institutionId,
        ]);
      return this.one(s, pk);
    });
  }

  updateStatus(id: string, status: ConsultationStatus) {
    const pk = m.sqlId(id);
    if (pk == null) return Promise.resolve(null);
    return this.run(async (s) => {
      await s.execute("UPDATE consulta SET estado = ? WHERE id_consulta = ? AND id_institucion = ?", [status, pk, this.ctx.institutionId]);
      return this.one(s, pk);
    });
  }
}

// ─────────────────────── Encuentro clínico (proyección clínica) ───────────────────────
const SELECT_CONSULTATION = `
  SELECT c.*, md.nombre_completo AS nombre_medico
  FROM consulta c JOIN medico md ON md.id_medico = c.id_medico`;

export class SqlEncounterRepository extends SqlRepository implements IPrescriptionPort {
  private async load(s: SqlSession, where: string, params: unknown[]): Promise<Consultation[]> {
    guard(this.ctx, "clinical:read");
    const rows = await s.query(`${SELECT_CONSULTATION} WHERE ${where} AND c.id_institucion = ? ORDER BY c.fecha_hora DESC`, [
      ...params,
      this.ctx.institutionId,
    ]);
    if (!rows.length) return [];
    const cIds = rows.map((r) => r.id_consulta);
    const diagnoses = await s.query(`SELECT * FROM diagnostico WHERE id_consulta IN (${placeholders(cIds.length)}) ORDER BY id_diagnostico`, cIds);
    const dIds = diagnoses.map((d) => d.id_diagnostico);
    const treatments = dIds.length
      ? await s.query(`SELECT * FROM tratamiento WHERE id_diagnostico IN (${placeholders(dIds.length)}) ORDER BY id_tratamiento`, dIds)
      : [];
    const tIds = treatments.map((t) => t.id_tratamiento);
    const prescriptions = tIds.length
      ? await s.query(
          `SELECT r.*, md.nombre_generico, md.nombre_comercial, md.presentacion, md.concentracion
           FROM receta r JOIN medicamento md ON md.id_medicamento = r.id_medicamento
           WHERE r.id_tratamiento IN (${placeholders(tIds.length)}) ORDER BY r.id_receta`,
          tIds,
        )
      : [];
    const rxByTreatment = m.groupBy(prescriptions, "id_tratamiento", m.toPrescription);
    const txByDiagnosis = m.groupBy(treatments, "id_diagnostico", (t) => m.toTreatment(t, rxByTreatment.get(String(t.id_tratamiento)) ?? []));
    const dxByConsultation = m.groupBy(diagnoses, "id_consulta", (d) => m.toDiagnosis(d, txByDiagnosis.get(String(d.id_diagnostico)) ?? []));
    return rows.map((r) => m.toConsultation(r, dxByConsultation.get(String(r.id_consulta)) ?? []));
  }

  private one(s: SqlSession, id: number) {
    return this.load(s, "c.id_consulta = ?", [id]).then((r) => r[0] ?? null);
  }

  private async insertTreatment(s: SqlSession, diagnosisId: number, t: Treatment) {
    const tId = await s.insert(
      "INSERT INTO tratamiento (descripcion, fecha_inicio, fecha_fin_estimada, observaciones, id_diagnostico) VALUES (?, ?, ?, ?, ?)",
      [t.description, t.startDate, t.estimatedEndDate, t.observations, diagnosisId],
      "id_tratamiento",
    );
    // La FK receta.id_medicamento es la que hace fallar (y revertir) la transacción ante un medicamento inexistente.
    for (const p of t.prescriptions)
      await s.execute(
        "INSERT INTO receta (dosis, frecuencia, duracion_dias, indicaciones, id_tratamiento, id_medicamento) VALUES (?, ?, ?, ?, ?, ?)",
        [p.dose, p.frequency, p.durationDays, p.instructions, tId, m.sqlId(p.medicineId) ?? -1],
      );
  }

  private async insertDiagnosis(s: SqlSession, consultationId: number, d: Diagnosis) {
    const dId = await s.insert(
      "INSERT INTO diagnostico (codigo_cie10, descripcion, tipo, fecha, id_consulta) VALUES (?, ?, ?, ?, ?)",
      [d.cie10, d.description, d.type, d.date, consultationId],
      "id_diagnostico",
    );
    for (const t of d.treatments) await this.insertTreatment(s, dId, t);
  }

  /** Eje B: consulta + diagnósticos + tratamientos + recetas en BEGIN … COMMIT; cualquier fallo → ROLLBACK total. */
  async saveEncounter(e: EncounterWrite): Promise<Consultation> {
    guard(this.ctx, "clinical:write");
    return this.run(async (s) => {
      let id: number;
      if (e.consultationId) {
        id = m.sqlId(e.consultationId) ?? -1;
        const changed = await s.execute(
          "UPDATE consulta SET motivo_consulta = ?, notas_clinicas = ?, estado = ? WHERE id_consulta = ? AND id_institucion = ? AND estado = 'programada'",
          [e.reason, e.notes, e.status, id, this.ctx.institutionId],
        );
        if (!changed) throw new ConflictError("La consulta ya no está programada");
      } else {
        id = await s.insert(
          "INSERT INTO consulta (fecha_hora, motivo_consulta, notas_clinicas, estado, id_paciente, id_medico, id_institucion) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [m.toSqlTimestamp(e.scheduledAt), e.reason, e.notes, e.status, m.sqlId(e.patientId), m.sqlId(e.doctorId), e.institutionId],
          "id_consulta",
        );
      }
      for (const d of e.diagnoses) await this.insertDiagnosis(s, id, d);
      return (await this.one(s, id))!;
    });
  }

  findEncounter(id: string) {
    const pk = m.sqlId(id);
    return pk == null ? Promise.resolve(null) : this.run((s) => this.one(s, pk));
  }

  /** OP-FAR-01 */
  async addDiagnosis(consultationId: string, d: Diagnosis) {
    guard(this.ctx, "clinical:write");
    return this.run(async (s) => {
      const pk = m.sqlId(consultationId) ?? -1;
      await this.insertDiagnosis(s, pk, d);
      return (await this.one(s, pk))!;
    });
  }

  /** OP-FAR-02 + OP-FAR-03: tratamiento y sus recetas, atómicos. */
  async addTreatmentWithPrescription(diagnosisId: string, t: Treatment) {
    guard(this.ctx, "clinical:write");
    return this.run(async (s) => {
      const [dx] = await s.query(
        "SELECT d.id_consulta FROM diagnostico d JOIN consulta c ON c.id_consulta = d.id_consulta WHERE d.id_diagnostico = ? AND c.id_institucion = ?",
        [m.sqlId(diagnosisId) ?? -1, this.ctx.institutionId],
      );
      if (!dx) throw new NotFoundError("Diagnóstico no encontrado");
      await this.insertTreatment(s, Number(diagnosisId), t);
      return (await this.one(s, dx.id_consulta))!;
    });
  }

  /** OP-FAR-04 y pestaña "Consultas": atendidas y borradores (programadas con notas). */
  getPatientHistory(patientId: string) {
    const pk = m.sqlId(patientId);
    if (pk == null) return Promise.resolve([]);
    return this.run((s) => this.load(s, "c.id_paciente = ? AND (c.estado = 'atendida' OR (c.estado = 'programada' AND c.notas_clinicas IS NOT NULL))", [pk]));
  }
}

// ─────────────────────────────── Laboratorio ───────────────────────────────
const SELECT_EXAM = `
  SELECT e.*, c.id_paciente, t.nombre AS nombre_tipo, md.nombre_completo AS nombre_medico
  FROM examen e
  JOIN consulta c ON c.id_consulta = e.id_consulta
  JOIN tipo_examen t ON t.id_tipo_examen = e.id_tipo_examen
  JOIN medico md ON md.id_medico = c.id_medico`;

export class SqlLabRepository extends SqlRepository implements ILabPort {
  private async load(s: SqlSession, where: string, params: unknown[]): Promise<LabOrder[]> {
    guard(this.ctx, "lab:read");
    const rows = await s.query(`${SELECT_EXAM} WHERE ${["c.id_institucion = ?", ...(where ? [where] : [])].join(" AND ")} ORDER BY e.fecha_solicitud DESC`, [
      this.ctx.institutionId,
      ...params,
    ]);
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id_examen);
    const results = await s.query(`SELECT * FROM resultado_examen WHERE id_examen IN (${placeholders(ids.length)}) ORDER BY id_resultado`, ids);
    const byExam = m.groupBy(results, "id_examen", m.toResult);
    return rows.map((r) => m.toLabOrder(r, byExam.get(String(r.id_examen)) ?? []));
  }

  private one(s: SqlSession, id: number) {
    return this.load(s, "e.id_examen = ?", [id]).then((r) => r[0] ?? null);
  }

  /** OP-LAB-01 */
  async createOrder(o: NewLabOrder) {
    guard(this.ctx, "lab:write");
    return this.run(async (s) => {
      const id = await s.insert(
        "INSERT INTO examen (fecha_solicitud, estado, id_consulta, id_tipo_examen) VALUES (?, 'solicitado', ?, ?)",
        [m.toSqlTimestamp(o.requestedAt), m.sqlId(o.consultationId) ?? -1, m.sqlId(o.examTypeId) ?? -1],
        "id_examen",
      );
      for (const r of o.results)
        await s.execute("INSERT INTO resultado_examen (parametro, valor_obtenido, rango_referencia, observaciones, id_examen) VALUES (?, ?, ?, ?, ?)", [
          r.parameter,
          r.value,
          r.referenceRange,
          r.observations,
          id,
        ]);
      return (await this.one(s, id))!;
    });
  }

  /** OP-LAB-02 */
  async updateStatus(id: string, status: LabStatus) {
    guard(this.ctx, "lab:write");
    const pk = m.sqlId(id);
    if (pk == null) return Promise.resolve(null);
    return this.run(async (s) => {
      await s.execute("UPDATE examen SET estado = ? WHERE id_examen = ?", [status, pk]);
      return this.one(s, pk);
    });
  }

  /** OP-LAB-03: resultados + estado en una transacción (sin DELETE: actualiza o inserta por parámetro). */
  async addResults(id: string, results: LabResult[], status: LabStatus) {
    guard(this.ctx, "lab:write");
    const pk = m.sqlId(id);
    if (pk == null) return Promise.resolve(null);
    return this.run(async (s) => {
      if (!(await this.one(s, pk))) return null;
      for (const r of results) {
        const updated = await s.execute(
          "UPDATE resultado_examen SET valor_obtenido = ?, rango_referencia = ?, observaciones = ? WHERE id_examen = ? AND parametro = ?",
          [r.value, r.referenceRange, r.observations, pk, r.parameter],
        );
        if (!updated)
          await s.execute("INSERT INTO resultado_examen (parametro, valor_obtenido, rango_referencia, observaciones, id_examen) VALUES (?, ?, ?, ?, ?)", [
            r.parameter,
            r.value,
            r.referenceRange,
            r.observations,
            pk,
          ]);
      }
      await s.execute("UPDATE examen SET estado = ? WHERE id_examen = ?", [status, pk]);
      return this.one(s, pk);
    });
  }

  /** OP-LAB-04 */
  getOrderReport(id: string) {
    const pk = m.sqlId(id);
    return pk == null ? Promise.resolve(null) : this.run((s) => this.one(s, pk));
  }

  list(filter: { patientId?: string }) {
    return this.run((s) => (filter.patientId ? this.load(s, "c.id_paciente = ?", [m.sqlId(filter.patientId) ?? -1]) : this.load(s, "", [])));
  }
}

// ─────────────────────────────── Catálogos y médicos ───────────────────────────────
export class SqlCatalogRepository extends SqlRepository implements ICatalogPort {
  listMedicines() {
    return this.run((s) => s.query("SELECT * FROM medicamento ORDER BY nombre_generico").then((r) => r.map(m.toMedicine)));
  }
  listVaccines() {
    return this.run((s) => s.query("SELECT * FROM vacuna ORDER BY id_vacuna").then((r) => r.map(m.toVaccine)));
  }
  listExamTypes() {
    return this.run((s) => s.query("SELECT * FROM tipo_examen ORDER BY id_tipo_examen").then((r) => r.map(m.toExamType)));
  }
  addMedicine(x: Omit<Medicine, "id">) {
    return this.run(async (s) => {
      const id = await s.insert(
        "INSERT INTO medicamento (nombre_generico, nombre_comercial, presentacion, concentracion) VALUES (?, ?, ?, ?)",
        [x.genericName, x.brandName, x.presentation, x.concentration],
        "id_medicamento",
      );
      return { ...x, id: String(id) };
    });
  }
  addVaccine(x: Omit<Vaccine, "id">) {
    return this.run(async (s) => ({
      ...x,
      id: String(await s.insert("INSERT INTO vacuna (nombre_vacuna, dosis_requeridas) VALUES (?, ?)", [x.name, x.requiredDoses], "id_vacuna")),
    }));
  }
  addExamType(x: Omit<ExamType, "id">) {
    return this.run(async (s) => ({
      ...x,
      id: String(await s.insert("INSERT INTO tipo_examen (nombre, descripcion) VALUES (?, ?)", [x.name, x.description], "id_tipo_examen")),
    }));
  }
}

export class SqlDoctorRepository extends SqlRepository implements IDoctorPort {
  list() {
    return this.run((s) => s.query("SELECT * FROM medico WHERE id_institucion = ? ORDER BY nombre_completo", [this.ctx.institutionId]).then((r) => r.map(m.toDoctor)));
  }
  findById(id: string) {
    return this.run((s) =>
      s.query("SELECT * FROM medico WHERE id_medico = ? AND id_institucion = ?", [m.sqlId(id) ?? -1, this.ctx.institutionId]).then((r) => (r[0] ? m.toDoctor(r[0]) : null)),
    );
  }
  create(d: NewDoctor): Promise<Doctor> {
    return this.run(async (s) => {
      const id = await s.insert(
        "INSERT INTO medico (nombre_completo, no_colegiado, especialidad, estado, id_institucion) VALUES (?, ?, ?, ?, ?)",
        [d.fullName, d.licenseNumber, d.specialty, d.status, d.institutionId],
        "id_medico",
      );
      return { ...d, id: String(id) };
    });
  }
}

export class SqlAdmissionRepository extends SqlRepository implements IAdmissionPort {
  async listByPatient(patientId: string): Promise<Admission[]> {
    guard(this.ctx, "clinical:read");
    return this.run((s) =>
      s
        .query(
          `SELECT i.* FROM internamiento i JOIN consulta c ON c.id_consulta = i.id_consulta
           WHERE c.id_paciente = ? AND c.id_institucion = ? ORDER BY i.fecha_ingreso DESC`,
          [m.sqlId(patientId) ?? -1, this.ctx.institutionId],
        )
        .then((r) => r.map(m.toAdmission)),
    );
  }
}

