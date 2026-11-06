import { appointments, consultations, labOrders, users } from "../mocks/data";
import type { Appointment, AppointmentStatus, Consultation, Doctor, LabOrder } from "../types";
import { mockResponse } from "./api";
import { enc, http, listOrEmpty, USE_MOCKS } from "./httpClient";

const mockConsultas = {
  listAppointments: (institutionId?: string) =>
    mockResponse(
      institutionId ? appointments.filter((a) => a.institutionId === institutionId) : appointments,
    ),
  updateAppointment: async (id: string, changes: Partial<Appointment>) => {
    const item = appointments.find((a) => a.id === id);
    if (item) Object.assign(item, changes);
    return mockResponse(item);
  },
  createAppointment: async (data: Omit<Appointment, "id">) => {
    const item = { ...data, id: `a${appointments.length + 1}` };
    appointments.push(item);
    return mockResponse(item);
  },
  getPatientConsultations: (patientId: string) =>
    mockResponse(consultations.filter((c) => c.patientId === patientId)),
  saveConsultation: async (item: Consultation) => {
    const index = consultations.findIndex((c) => c.id === item.id);
    if (index >= 0) consultations[index] = item;
    else consultations.push(item);
    const appointment = appointments.find((a) => a.id === item.appointmentId);
    if (appointment)
      appointment.status = item.status === "atendida" ? "atendida" : appointment.status;
    return mockResponse(item);
  },
  setAppointmentStatus: async (id: string, status: AppointmentStatus) => {
    const item = appointments.find((a) => a.id === id);
    if (item) item.status = status;
    return mockResponse(item);
  },
  /** Médicos de la institución (selector de agenda). */
  listDoctors: (institutionId?: string): Promise<Doctor[]> =>
    mockResponse(
      users
        .filter((u) => u.role === "medico" && (!institutionId || u.institutionId === institutionId))
        .map((u) => ({ id: u.id, name: u.name, specialty: u.specialty })),
    ),
};

const apiConsultas: typeof mockConsultas = {
  listAppointments: () => http.get<Appointment[]>("/appointments"),
  updateAppointment: (id, changes) => http.patch<Appointment>(`/appointments/${enc(id)}`, changes),
  createAppointment: (data) => http.post<Appointment>("/appointments", data),
  // Restringido: el backend responde 403 a quien no es médico.
  getPatientConsultations: (patientId) => listOrEmpty(http.get<Consultation[]>(`/patients/${enc(patientId)}/consultations`)),
  /** Consulta + diagnósticos + tratamientos + recetas en una sola transacción del motor. */
  saveConsultation: (item) => http.post<Consultation>("/consultations", item),
  setAppointmentStatus: (id, status) => http.patch<Appointment>(`/appointments/${enc(id)}/status`, { status }),
  listDoctors: () => http.get<Doctor[]>("/doctors"),
};

export const consultasService = USE_MOCKS ? mockConsultas : apiConsultas;

const mockLaboratorio = {
  list: () => mockResponse(labOrders),
  forPatient: (patientId: string) =>
    mockResponse(labOrders.filter((o) => o.patientId === patientId)),
  create: async (data: Omit<LabOrder, "id">) => {
    const order = { ...data, id: `LAB-${1050 + labOrders.length}` };
    labOrders.unshift(order);
    return mockResponse(order);
  },
  update: async (id: string, changes: Partial<LabOrder>) => {
    const order = labOrders.find((o) => o.id === id);
    if (order) Object.assign(order, changes);
    return mockResponse(order);
  },
};

const apiLaboratorio: typeof mockLaboratorio = {
  list: () => http.get<LabOrder[]>("/lab-orders"),
  forPatient: (patientId) => listOrEmpty(http.get<LabOrder[]>(`/patients/${enc(patientId)}/lab-orders`)),
  /** OP-LAB-01: requiere consultationId (examen.id_consulta). */
  create: (data) => http.post<LabOrder>("/lab-orders", data),
  update: (id, changes) => http.patch<LabOrder>(`/lab-orders/${enc(id)}`, { parameters: changes.parameters, status: changes.status }),
};

export const laboratorioService = USE_MOCKS ? mockLaboratorio : apiLaboratorio;
