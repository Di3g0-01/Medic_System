import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Input, Modal, PageHeader, Select } from "../components/ui";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../hooks/useAuth";
import { consultasService } from "../services/consultasService";
import { pacientesService } from "../services/pacientesService";
import type { Appointment, Patient } from "../types";

export function AgendaPage() {
  const { session } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [date, setDate] = useState("2026-03-24");
  const [doctor, setDoctor] = useState("todos");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [draft, setDraft] = useState({ patientId: "", time: "09:00", reason: "" });

  const refresh = () =>
    session &&
    Promise.all([
      consultasService.listAppointments(session.institution.id),
      pacientesService.list(),
    ]).then(([a, p]) => {
      setAppointments(a);
      setPatients(p);
    });
  useEffect(() => {
    refresh();
  }, [session]);
  const patientName = (id: string) => {
    const p = patients.find((item) => item.id === id);
    return p ? `${p.firstName} ${p.lastName}` : "Paciente";
  };
  const visible = appointments.filter(
    (a) => a.date === date && (doctor === "todos" || a.doctorId === doctor),
  );

  const openNew = () => {
    setEditing(null);
    setDraft({ patientId: patients[0]?.id ?? "", time: "09:00", reason: "" });
    setModal(true);
  };
  const openEdit = (item: Appointment) => {
    setEditing(item);
    setDraft({ patientId: item.patientId, time: item.time, reason: item.reason });
    setModal(true);
  };
  const save = async () => {
    if (!session) return;
    if (editing) await consultasService.updateAppointment(editing.id, { ...draft, date });
    else
      await consultasService.createAppointment({
        ...draft,
        date,
        doctorId: session.user.id,
        institutionId: session.institution.id,
        status: "programada",
      });
    setModal(false);
    refresh();
  };
  const cancel = async (id: string) => {
    await consultasService.setAppointmentStatus(id, "cancelada");
    refresh();
  };

  return (
    <>
      <PageHeader
        title="Agenda de consultas"
        description="Programa y administra las citas de la institución."
        action={
          <Button onClick={openNew}>
            <Plus size={17} />
            Programar cita
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="px-3" onClick={() => setDate("2026-03-23")}>
              <ChevronLeft size={17} />
            </Button>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Button variant="secondary" className="px-3" onClick={() => setDate("2026-03-25")}>
              <ChevronRight size={17} />
            </Button>
          </div>
          <Select
            label="Vista por médico"
            value={doctor}
            onChange={(e) => setDoctor(e.target.value)}
            className="min-w-56"
          >
            <option value="todos">Todos los médicos</option>
            {session && <option value={session.user.id}>{session.user.name}</option>}
          </Select>
        </div>
        <div className="grid min-h-[430px] md:grid-cols-[90px_1fr]">
          <div className="hidden border-r border-slate-100 py-5 md:block">
            {["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"].map(
              (time) => (
                <div key={time} className="h-16 px-4 text-right text-xs font-medium text-slate-400">
                  {time}
                </div>
              ),
            )}
          </div>
          <div className="space-y-3 p-5">
            {visible
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((item) => (
                <div
                  key={item.id}
                  className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${item.status === "cancelada" ? "border-slate-200 bg-slate-50 opacity-65" : "border-[#bcdde0] bg-[#f4fbfa]"}`}
                >
                  <div className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-white text-[#176b87] shadow-sm">
                    <Clock size={14} />
                    <span className="text-xs font-bold">{item.time}</span>
                  </div>
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {patientName(item.patientId)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.reason}</p>
                  </div>
                  <StatusBadge status={item.status} />
                  {item.status === "programada" && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="px-3 py-2"
                        onClick={() => openEdit(item)}
                      >
                        Reprogramar
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-3 py-2 text-red-600"
                        onClick={() => cancel(item.id)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            {!visible.length && (
              <div className="flex h-80 flex-col items-center justify-center text-center">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-400">
                  <CalendarDays size={23} />
                </div>
                <p className="mt-4 font-semibold text-slate-700">Agenda disponible</p>
                <p className="mt-1 text-sm text-slate-400">
                  No hay citas para esta fecha y médico.
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? "Reprogramar cita" : "Programar nueva cita"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!draft.patientId || !draft.reason}>
              Guardar cita
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Paciente"
            value={draft.patientId}
            onChange={(e) => setDraft({ ...draft, patientId: e.target.value })}
          >
            <option value="">Selecciona un paciente</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName} · {p.cui}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Fecha"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Input
              label="Hora"
              type="time"
              value={draft.time}
              onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            />
          </div>
          <Input
            label="Motivo de consulta"
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          />
        </div>
      </Modal>
    </>
  );
}
