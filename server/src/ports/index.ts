/**
 * Puertos (interfaces) del núcleo. Segregados por catálogo de operaciones (ISP);
 * los casos de uso dependen solo de estas abstracciones (DIP). Cada motor los
 * implementa con comportamiento intercambiable (LSP): la misma suite de
 * contrato (test/contract.ts) se ejecuta contra los 4 adaptadores.
 */
import type { Doctor, ExamType, Medicine, NewDoctor, Vaccine } from "../domain/Catalog.ts";
import type { Appointment, Consultation, Diagnosis, EncounterWrite, NewAppointment, Treatment } from "../domain/Consultation.ts";
import type { LabOrder, LabResult, NewLabOrder } from "../domain/LabOrder.ts";
import type { Allergy, EmergencyContact, NewPatient, Patient, PatientChanges } from "../domain/Patient.ts";
import type { Admission, GrowthRecord, VaccinationDose } from "../domain/Specialty.ts";
import type { NewUser, PublicUser, User, UserChanges } from "../domain/User.ts";
import type { ConsultationStatus, InstitutionId, LabStatus, LocalDateTime, PatientStatus, Role } from "../domain/values.ts";

/** OP-PAC-01..05 */
export interface IPatientPort {
  create(patient: NewPatient): Promise<Patient>;
  findById(id: string): Promise<Patient | null>;
  findByDpi(dpi: string): Promise<Patient | null>;
  findByEmail(email: string): Promise<Patient | null>;
  list(): Promise<Patient[]>;
  update(id: string, changes: PatientChanges): Promise<Patient | null>;
  updateStatus(id: string, status: PatientStatus): Promise<Patient | null>;
  addEmergencyContacts(id: string, contacts: EmergencyContact[]): Promise<Patient | null>;
  addAllergies(id: string, allergies: Allergy[]): Promise<Patient | null>;
}

export interface AppointmentFilter {
  doctorId?: string;
  patientId?: string;
  /** Día "YYYY-MM-DD". */
  date?: string;
}

/** OP-CON-01, 03, 04 — proyección CONFIDENCIAL (sin notas ni diagnósticos). */
export interface IConsultationPort {
  create(appointment: NewAppointment): Promise<Appointment>;
  findById(id: string): Promise<Appointment | null>;
  list(filter: AppointmentFilter): Promise<Appointment[]>;
  /** OP-CON-04 */
  listByDoctor(doctorId: string, date: string): Promise<Appointment[]>;
  /** Consultas vigentes del médico en ese horario (validación de disponibilidad). */
  findByDoctorAt(doctorId: string, scheduledAt: LocalDateTime): Promise<Appointment[]>;
  reschedule(id: string, changes: { scheduledAt?: LocalDateTime; reason?: string; doctorId?: string }): Promise<Appointment | null>;
  updateStatus(id: string, status: ConsultationStatus): Promise<Appointment | null>;
}

/**
 * IClinicalEncounterRepository — OP-CON-02 y OP-FAR-01..04, proyección CLÍNICA.
 * saveEncounter y addTreatmentWithPrescription son atómicos en cada motor.
 */
export interface IPrescriptionPort {
  saveEncounter(encounter: EncounterWrite): Promise<Consultation>;
  findEncounter(id: string): Promise<Consultation | null>;
  addDiagnosis(consultationId: string, diagnosis: Diagnosis): Promise<Consultation>;
  addTreatmentWithPrescription(diagnosisId: string, treatment: Treatment): Promise<Consultation>;
  /** Historial clínico completo del paciente (consultas con diagnósticos, tratamientos y recetas). */
  getPatientHistory(patientId: string): Promise<Consultation[]>;
}
export type IClinicalEncounterRepository = IPrescriptionPort;

/** OP-LAB-01..04 */
export interface ILabPort {
  createOrder(order: NewLabOrder): Promise<LabOrder>;
  updateStatus(id: string, status: LabStatus): Promise<LabOrder | null>;
  /** Registra resultados y estado en una sola operación atómica. */
  addResults(id: string, results: LabResult[], status: LabStatus): Promise<LabOrder | null>;
  getOrderReport(id: string): Promise<LabOrder | null>;
  list(filter: { patientId?: string }): Promise<LabOrder[]>;
}

export interface ICatalogPort {
  listMedicines(): Promise<Medicine[]>;
  listVaccines(): Promise<Vaccine[]>;
  listExamTypes(): Promise<ExamType[]>;
  addMedicine(m: Omit<Medicine, "id">): Promise<Medicine>;
  addVaccine(v: Omit<Vaccine, "id">): Promise<Vaccine>;
  addExamType(e: Omit<ExamType, "id">): Promise<ExamType>;
}

export interface IDoctorPort {
  list(): Promise<Doctor[]>;
  findById(id: string): Promise<Doctor | null>;
  create(doctor: NewDoctor): Promise<Doctor>;
}

/** Solo Hospital General. */
export interface IAdmissionPort {
  listByPatient(patientId: string): Promise<Admission[]>;
}

/** Solo Centro Médico Pediátrico (subcolecciones crecimiento / vacunas). */
export interface IPediatricPort {
  listGrowth(patientId: string): Promise<GrowthRecord[]>;
  listVaccinations(patientId: string): Promise<VaccinationDose[]>;
}

/** Repositorios de una institución, ya ligados al contexto de acceso. */
export interface InstitutionRepositories {
  patients: IPatientPort;
  consultations: IConsultationPort;
  encounters: IPrescriptionPort;
  lab: ILabPort;
  catalogs: ICatalogPort;
  doctors: IDoctorPort;
  admissions?: IAdmissionPort;
  pediatrics?: IPediatricPort;
}

/** Contexto con el que un adaptador ejecuta (rol para SET ROLE / filtrado, sede para RLS). */
export interface AccessContext {
  role: Role;
  institutionId: InstitutionId;
}

export interface EngineDescriptor {
  key: string;
  label: string;
}

/** Un motor de persistencia enchufable en el DatabaseAdapterFactory. */
export interface EngineProvider {
  readonly descriptor: EngineDescriptor;
  repositories(ctx: AccessContext): InstitutionRepositories;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** OP-SEC-01 y 03 (directorio central). */
export interface IAuthPort {
  findByUsername(username: string): Promise<User | null>;
  findById(id: number): Promise<User | null>;
  recordSuccessfulLogin(userId: number): Promise<void>;
}

export interface IUserDirectoryPort {
  list(): Promise<PublicUser[]>;
  create(user: NewUser): Promise<PublicUser>;
  update(id: number, changes: UserChanges): Promise<PublicUser | null>;
}

export interface Institution {
  id: InstitutionId;
  name: string;
  kind: "hospital" | "clinica" | "laboratorio" | "pediatrico";
}

export interface IInstitutionPort {
  listInstitutions(): Promise<Institution[]>;
  findInstitution(id: InstitutionId): Promise<Institution | null>;
}

export interface AuditEntry {
  userId: number | null;
  institutionId: InstitutionId | null;
  action: string;
  entity?: string;
  entityId?: string;
  detail?: Record<string, unknown>;
}

export interface IAuditPort {
  record(entry: AuditEntry): Promise<void>;
  listAudit(limit: number): Promise<(AuditEntry & { at: LocalDateTime })[]>;
}

export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

/** Resolución de repositorios por institución (lo implementa DatabaseAdapterFactory). */
export interface IRepositoryResolver {
  forContext(ctx: AccessContext): InstitutionRepositories;
  describe(institutionId: InstitutionId): EngineDescriptor;
}
