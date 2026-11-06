/** Controladores REST: validan el DTO, invocan el caso de uso y presentan el resultado en el contrato del frontend. */
import { Router, type NextFunction, type Request, type Response } from "express";
import * as admin from "../application/admin.ts";
import * as appointments from "../application/appointments.ts";
import * as auth from "../application/auth.ts";
import { contextFor, type AppDeps } from "../application/context.ts";
import * as encounters from "../application/encounters.ts";
import * as lab from "../application/lab.ts";
import * as patients from "../application/patients.ts";
import * as specialty from "../application/specialty.ts";
import { NotFoundError, ValidationError } from "../domain/errors.ts";
import { authorize, type Permission } from "../domain/security.ts";
import * as dto from "./dto.ts";
import { authenticate, signToken } from "./jwt.ts";
import * as present from "./presenters.ts";

export interface HttpOptions {
  jwtSecret: string;
  jwtExpiresIn: string;
}

/** Middleware RBAC (primera barrera); los casos de uso vuelven a autorizar con la misma matriz. */
const requires = (permission: Permission) => (req: Request, _res: Response, next: NextFunction) => {
  authorize(req.actor!.role, permission);
  next();
};

export function buildRouter(deps: AppDeps, options: HttpOptions): Router {
  const r = Router();
  const ctx = (req: Request) => contextFor(deps, req.actor!);
  const today = () => deps.clock.now().slice(0, 10);
  const param = (req: Request, name: string) => String(req.params[name]);

  const sessionBody = (s: auth.SessionInfo) => ({
    user: present.presentUser(s.user),
    institution: present.presentInstitution(s.institution, s.engine),
  });

  // ─────────── Seguridad y sesiones (OP-SEC-01..03) ───────────
  r.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  r.post("/auth/login", async (req, res) => {
    const { username, password } = dto.loginDto.parse(req.body);
    const session = await auth.login(deps, username, password);
    res.json({ token: signToken(session.actor, options.jwtSecret, options.jwtExpiresIn), ...sessionBody(session) });
  });

  r.use(authenticate(options.jwtSecret));

  r.get("/auth/me", async (req, res) => {
    res.json(sessionBody(await auth.restoreSession(deps, req.actor!)));
  });

  // ─────────── Pacientes (OP-PAC-01..05) ───────────
  r.get("/patients", async (req, res) => {
    res.json((await patients.listPatients(ctx(req))).map(present.presentPatient));
  });
  r.post("/patients/validate-unique", async (req, res) => {
    const { cui, email } = dto.uniqueDto.parse(req.body);
    const result = await patients.checkPatientUniqueness(ctx(req), cui, email);
    res.json({ cui: result.dpi, email: result.email });
  });
  r.get("/patients/by-dpi/:dpi", async (req, res) => {
    res.json(present.presentPatient(await patients.findPatientByDpi(ctx(req), param(req, "dpi"))));
  });
  r.get("/patients/:id", async (req, res) => {
    res.json(present.presentPatient(await patients.getPatient(ctx(req), param(req, "id"))));
  });
  r.post("/patients", async (req, res) => {
    res.status(201).json(present.presentPatient(await patients.registerPatient(ctx(req), dto.patientDto.parse(req.body))));
  });
  r.patch("/patients/:id", async (req, res) => {
    res.json(present.presentPatient(await patients.updatePatient(ctx(req), param(req, "id"), dto.patientUpdateDto.parse(req.body))));
  });
  r.patch("/patients/:id/status", async (req, res) => {
    const { status } = dto.statusDto.parse(req.body);
    res.json(present.presentPatient(await patients.changePatientStatus(ctx(req), param(req, "id"), status)));
  });
  r.post("/patients/:id/contacts", async (req, res) => {
    const { contacts } = dto.contactsDto.parse(req.body);
    res.json(present.presentPatient(await patients.addEmergencyContacts(ctx(req), param(req, "id"), contacts)));
  });
  r.post("/patients/:id/allergies", async (req, res) => {
    const { allergies } = dto.allergiesDto.parse(req.body);
    res.json(present.presentPatient(await patients.addAllergies(ctx(req), param(req, "id"), allergies)));
  });

  // Información restringida del paciente (solo médicos)
  r.get("/patients/:id/consultations", requires("clinical:read"), async (req, res) => {
    res.json((await encounters.getPatientConsultations(ctx(req), param(req, "id"))).map(present.presentConsultation));
  });
  r.get("/patients/:id/pharmacotherapy", requires("clinical:read"), async (req, res) => {
    const history = await encounters.getPharmacotherapyHistory(ctx(req), param(req, "id"));
    res.json(history.map((h) => ({ ...h, prescription: { ...h.prescription, duration: present.formatDuration(h.prescription.durationDays) } })));
  });
  r.get("/patients/:id/lab-orders", requires("lab:read"), async (req, res) => {
    res.json((await lab.listLabOrders(ctx(req), { patientId: param(req, "id") })).map(present.presentLabOrder));
  });
  r.get("/patients/:id/growth", requires("clinical:read"), async (req, res) => {
    res.json((await specialty.listGrowthRecords(ctx(req), param(req, "id"))).map(present.presentGrowth));
  });
  r.get("/patients/:id/vaccines", requires("clinical:read"), async (req, res) => {
    res.json((await specialty.getVaccinationScheme(ctx(req), param(req, "id"))).map(present.presentVaccine));
  });
  r.get("/patients/:id/admissions", requires("clinical:read"), async (req, res) => {
    res.json((await specialty.listAdmissions(ctx(req), param(req, "id"))).map(present.presentAdmission));
  });

  // ─────────── Agenda (OP-CON-01, 03, 04) ───────────
  r.get("/doctors", async (req, res) => {
    res.json((await appointments.listDoctors(ctx(req))).map(present.presentDoctor));
  });
  r.get("/doctors/:id/agenda", async (req, res) => {
    const date = String(req.query.date ?? today());
    res.json((await appointments.listDoctorAgenda(ctx(req), param(req, "id"), date)).map(present.presentAppointment));
  });
  r.get("/appointments", async (req, res) => {
    const { doctorId, date, patientId } = req.query as Record<string, string | undefined>;
    res.json((await appointments.listAppointments(ctx(req), { doctorId, date, patientId })).map(present.presentAppointment));
  });
  r.post("/appointments", async (req, res) => {
    res.status(201).json(present.presentAppointment(await appointments.scheduleAppointment(ctx(req), dto.appointmentDto.parse(req.body))));
  });
  r.patch("/appointments/:id", async (req, res) => {
    const c = ctx(req);
    const id = param(req, "id");
    const body = dto.appointmentUpdateDto.parse(req.body);
    const current = await appointments.listAppointments(c, {}).then((l) => l.find((a) => a.id === id));
    if (!current) throw new NotFoundError("Consulta no encontrada");
    let result = current;
    const date = body.date ?? current.scheduledAt.slice(0, 10);
    const time = body.time ?? current.scheduledAt.slice(11, 16);
    const scheduledAt = `${date}T${time}`;
    if (scheduledAt !== current.scheduledAt || (body.reason !== undefined && body.reason !== current.reason) || (body.doctorId && body.doctorId !== current.doctorId))
      result = await appointments.rescheduleAppointment(c, id, { scheduledAt, reason: body.reason, doctorId: body.doctorId });
    if (body.status && body.status !== result.status) result = await appointments.changeAppointmentStatus(c, id, body.status);
    res.json(present.presentAppointment(result));
  });
  r.patch("/appointments/:id/status", async (req, res) => {
    const { status } = dto.appointmentStatusDto.parse(req.body);
    res.json(present.presentAppointment(await appointments.changeAppointmentStatus(ctx(req), param(req, "id"), status)));
  });

  // ─────────── Atención clínica y farmacoterapia (OP-CON-02, OP-FAR-01..04) ───────────
  r.post("/consultations", requires("clinical:write"), async (req, res) => {
    const saved = await encounters.attendConsultation(ctx(req), dto.consultationDto(today()).parse(req.body));
    res.status(201).json(present.presentConsultation(saved));
  });
  r.get("/consultations/:id", requires("clinical:read"), async (req, res) => {
    res.json(present.presentConsultation(await encounters.getConsultation(ctx(req), param(req, "id"))));
  });
  r.post("/consultations/:id/diagnoses", requires("clinical:write"), async (req, res) => {
    const saved = await encounters.addDiagnosis(ctx(req), param(req, "id"), dto.diagnosisCreateDto(today()).parse(req.body));
    res.status(201).json(present.presentConsultation(saved));
  });
  r.post("/diagnoses/:id/treatments", requires("clinical:write"), async (req, res) => {
    const saved = await encounters.addTreatmentWithPrescription(ctx(req), param(req, "id"), dto.treatmentDto(today()).parse(req.body));
    res.status(201).json(present.presentConsultation(saved));
  });

  // ─────────── Laboratorio (OP-LAB-01..04) ───────────
  r.get("/lab-orders", requires("lab:read"), async (req, res) => {
    res.json((await lab.listLabOrders(ctx(req), {})).map(present.presentLabOrder));
  });
  r.get("/lab-orders/:id", requires("lab:read"), async (req, res) => {
    res.json(present.presentLabOrder(await lab.getLabReport(ctx(req), param(req, "id"))));
  });
  r.post("/lab-orders", requires("lab:write"), async (req, res) => {
    res.status(201).json(present.presentLabOrder(await lab.createLabOrder(ctx(req), dto.labOrderDto.parse(req.body))));
  });
  r.patch("/lab-orders/:id", requires("lab:write"), async (req, res) => {
    const c = ctx(req);
    const id = param(req, "id");
    const { results, status } = dto.labUpdateDto.parse(req.body);
    if (results?.length) return res.json(present.presentLabOrder(await lab.recordLabResults(c, id, results)));
    if (status === "en_proceso") return res.json(present.presentLabOrder(await lab.registerSampleCapture(c, id)));
    throw new ValidationError("Indique los resultados o el nuevo estado de la orden");
  });

  // ─────────── Catálogos ───────────
  r.get("/catalogs", async (req, res) => {
    const { medicines, vaccines, exams } = await admin.getCatalogs(ctx(req));
    res.json({
      medicines: medicines.map(present.presentMedicine),
      vaccines: vaccines.map(present.presentVaccineItem),
      exams: exams.map(present.presentExamType),
    });
  });
  r.post("/catalogs/:catalog", requires("catalog:write"), async (req, res) => {
    const { name, detail } = dto.catalogItemDto.parse(req.body);
    const kind = param(req, "catalog");
    const c = ctx(req);
    if (kind === "medicines") {
      const { item } = await admin.addCatalogItem(c, { kind, value: dto.splitMedicineName(name, detail) });
      return res.status(201).json(present.presentMedicine(item as never));
    }
    if (kind === "vaccines") {
      const { item } = await admin.addCatalogItem(c, { kind, value: { name, requiredDoses: dto.requiredDosesFrom(detail) } });
      return res.status(201).json(present.presentVaccineItem(item as never));
    }
    if (kind === "exams") {
      const { item } = await admin.addCatalogItem(c, { kind, value: { name, description: detail || null } });
      return res.status(201).json(present.presentExamType(item as never));
    }
    throw new NotFoundError(`Catálogo desconocido: ${kind}`);
  });

  // ─────────── Administración de usuarios y auditoría ───────────
  r.get("/institutions", async (_req, res) => {
    res.json((await deps.institutions.listInstitutions()).map((i) => present.presentInstitution(i, deps.resolver.describe(i.id))));
  });
  r.get("/admin/users", requires("user:admin"), async (req, res) => {
    res.json((await admin.listUsers(ctx(req))).map(present.presentUser));
  });
  r.post("/admin/users", requires("user:admin"), async (req, res) => {
    res.status(201).json(present.presentUser(await admin.createUser(ctx(req), dto.userCreateDto.parse(req.body))));
  });
  r.patch("/admin/users/:id", requires("user:admin"), async (req, res) => {
    res.json(present.presentUser(await admin.updateUser(ctx(req), Number(param(req, "id")), dto.userUpdateDto.parse(req.body))));
  });
  r.get("/admin/audit", requires("audit:read"), async (req, res) => {
    res.json(await admin.listAudit(ctx(req), Number(req.query.limit ?? 100)));
  });

  return r;
}
