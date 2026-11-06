import { appointments, consultations, labOrders } from "../mocks/data";
import type { Appointment, AppointmentStatus, Consultation, LabOrder } from "../types";
import { mockResponse } from "./api";

export const consultasService = {
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
  setAppointmentStatus: (id: string, status: AppointmentStatus) =>
    consultasService.updateAppointment(id, { status }),
};

export const laboratorioService = {
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
