import {
  ArrowRight,
  CalendarCheck,
  Clock3,
  FilePlus2,
  FlaskConical,
  HeartPulse,
  Plus,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Loading } from "../components/Loading";
import { StatusBadge } from "../components/StatusBadge";
import { Button, Card, PageHeader } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { consultasService } from "../services/consultasService";
import { pacientesService } from "../services/pacientesService";
import type { Appointment, Patient } from "../types";

export function DashboardPage() {
  const { session } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    Promise.all([
      consultasService.listAppointments(session.institution.id),
      pacientesService.list(session.institution.id),
    ])
      .then(([a, p]) => {
        setAppointments(a);
        setPatients(p);
      })
      .finally(() => setLoading(false));
  }, [session]);

  if (loading || !session) return <Loading />;
  const todaysAppointments = appointments.filter((item) => item.date === "2026-03-24");
  const stats =
    session.user.role === "admin"
      ? [
          {
            label: "Usuarios activos",
            value: "4",
            note: "En esta institución",
            icon: Users,
            color: "text-sky-700 bg-sky-50",
          },
          {
            label: "Catálogos",
            value: "3",
            note: "Listos para gestionar",
            icon: FilePlus2,
            color: "text-violet-700 bg-violet-50",
          },
          {
            label: "Accesos hoy",
            value: "28",
            note: "Actividad normal",
            icon: HeartPulse,
            color: "text-emerald-700 bg-emerald-50",
          },
        ]
      : [
          {
            label: "Citas de hoy",
            value: String(todaysAppointments.length),
            note: `${todaysAppointments.filter((a) => a.status === "programada").length} pendientes`,
            icon: CalendarCheck,
            color: "text-sky-700 bg-sky-50",
          },
          {
            label: "Pacientes activos",
            value: String(patients.filter((p) => p.status === "activo").length),
            note: "En esta institución",
            icon: Users,
            color: "text-emerald-700 bg-emerald-50",
          },
          {
            label: "Próxima cita",
            value: todaysAppointments.find((a) => a.status === "programada")?.time ?? "—",
            note: "Horario local",
            icon: Clock3,
            color: "text-amber-700 bg-amber-50",
          },
        ];

  const patientName = (id: string) => {
    const patient = patients.find((item) => item.id === id);
    return patient ? `${patient.firstName} ${patient.lastName}` : "Paciente de la red";
  };

  return (
    <>
      <PageHeader
        title={`Buenos días, ${session.user.name.split(" ").find((part) => !part.endsWith("."))}`}
        description={`Este es el estado de ${session.institution.name} para hoy, 24 de marzo.`}
        action={
          session.user.role === "secretaria" ? (
            <Link to="/pacientes/nuevo">
              <Button>
                <Plus size={17} />
                Nuevo paciente
              </Button>
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map(({ label, value, note, icon: Icon, color }) => (
          <Card key={label} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
                <p className="mt-1 text-xs text-slate-400">{note}</p>
              </div>
              <div className={`rounded-xl p-3 ${color}`}>
                <Icon size={21} />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_.75fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <h2 className="font-bold text-slate-900">
                {session.user.role === "admin" ? "Actividad reciente" : "Agenda de hoy"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">Resumen de actividad institucional</p>
            </div>
            {session.user.role !== "admin" && (
              <Link
                to="/agenda"
                className="flex items-center gap-1 text-sm font-semibold text-[#176b87]"
              >
                Ver agenda <ArrowRight size={15} />
              </Link>
            )}
          </div>
          {session.user.role === "admin" ? (
            <div className="space-y-5 p-6">
              {[
                "Se actualizó el catálogo de medicamentos",
                "Nuevo usuario habilitado para Laboratorio",
                "Revisión mensual de accesos completada",
              ].map((text, i) => (
                <div key={text} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#48a99c]" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">{text}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Hace {i + 1} hora{i ? "s" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left">
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-6 py-3">Hora</th>
                    <th className="px-4 py-3">Paciente</th>
                    <th className="px-4 py-3">Motivo</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todaysAppointments.map((item) => (
                    <tr key={item.id} className="text-sm">
                      <td className="px-6 py-4 font-semibold text-slate-800">{item.time}</td>
                      <td className="px-4 py-4 font-medium text-slate-700">
                        {patientName(item.patientId)}
                      </td>
                      <td className="px-4 py-4 text-slate-500">{item.reason}</td>
                      <td className="px-4 py-4">
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {todaysAppointments.length === 0 && (
                <p className="p-10 text-center text-sm text-slate-500">
                  No hay citas programadas para hoy.
                </p>
              )}
            </div>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="font-bold text-slate-900">Accesos rápidos</h2>
          <p className="mt-1 text-xs text-slate-500">Tareas frecuentes para tu rol</p>
          <div className="mt-5 space-y-3">
            {(session.user.role === "admin"
              ? [
                  {
                    to: "/administracion",
                    label: "Gestionar usuarios",
                    icon: Users,
                    detail: "Roles y permisos",
                  },
                  {
                    to: "/administracion",
                    label: "Editar catálogos",
                    icon: FlaskConical,
                    detail: "Medicamentos y exámenes",
                  },
                ]
              : [
                  {
                    to: "/pacientes/nuevo",
                    label: "Registrar paciente",
                    icon: UserRoundPlus,
                    detail: "Crear un historial",
                  },
                  {
                    to: "/agenda",
                    label: "Programar cita",
                    icon: CalendarCheck,
                    detail: "Agregar a la agenda",
                  },
                  ...(session.user.role === "medico"
                    ? [
                        {
                          to: "/consulta/nueva",
                          label: "Atender consulta",
                          icon: HeartPulse,
                          detail: "Registro clínico",
                        },
                      ]
                    : []),
                ]
            ).map(({ to, label, icon: Icon, detail }) => (
              <Link
                key={label}
                to={to}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3.5 hover:border-[#7abcc6] hover:bg-[#f3faf9]"
              >
                <div className="rounded-lg bg-slate-100 p-2 text-slate-600 group-hover:bg-white group-hover:text-[#176b87]">
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  <p className="text-xs text-slate-400">{detail}</p>
                </div>
                <ArrowRight size={16} className="text-slate-300 group-hover:text-[#176b87]" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
