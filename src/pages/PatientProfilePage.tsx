import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Calendar,
  Droplets,
  Edit3,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { AccessRestricted } from "../components/AccessRestricted";
import { Loading } from "../components/Loading";
import { StatusBadge } from "../components/StatusBadge";
import { Badge, Button, Card, Input, Modal, Select } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { clinicalService } from "../services/clinicalService";
import { consultasService, laboratorioService } from "../services/consultasService";
import { pacientesService } from "../services/pacientesService";
import type {
  Admission,
  Consultation,
  GrowthRecord,
  LabOrder,
  Patient,
  VaccineRecord,
} from "../types";

type Tab =
  | "general"
  | "contactos"
  | "consultas"
  | "diagnosticos"
  | "tratamientos"
  | "laboratorio"
  | "crecimiento"
  | "internamientos";

export function PatientProfilePage() {
  const { id = "" } = useParams();
  const { session } = useAuth();
  const [patient, setPatient] = useState<Patient>();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [growth, setGrowth] = useState<GrowthRecord[]>([]);
  const [vaccines, setVaccines] = useState<VaccineRecord[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [tab, setTab] = useState<Tab>("general");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("traslado");
  const [editDraft, setEditDraft] = useState({
    phone: "",
    address: "",
    municipality: "",
    department: "",
    status: "activo" as Patient["status"],
  });

  useEffect(() => {
    Promise.all([
      pacientesService.get(id),
      consultasService.getPatientConsultations(id),
      laboratorioService.forPatient(id),
      clinicalService.getGrowthRecords(id),
      clinicalService.getVaccines(id),
      clinicalService.getAdmissions(id),
    ]).then(([p, c, o, g, v, a]) => {
      setPatient(p);
      setConsultations(c);
      setOrders(o);
      setGrowth(g);
      setVaccines(v);
      setAdmissions(a);
    });
  }, [id]);

  if (!patient || !session) return <Loading />;
  const clinicalAllowed = session.user.role === "medico";
  const type = session.institution.type;
  const allTabs: { id: Tab; label: string; show: boolean; sensitive?: boolean }[] = [
    { id: "general", label: "Datos generales", show: true },
    { id: "contactos", label: "Alergias y contactos", show: true },
    { id: "consultas", label: "Consultas", show: true, sensitive: true },
    { id: "diagnosticos", label: "Diagnósticos", show: true, sensitive: true },
    { id: "tratamientos", label: "Tratamientos y recetas", show: true, sensitive: true },
    {
      id: "laboratorio",
      label: "Laboratorio",
      show: type === "laboratorio" || type === "hospital",
      sensitive: true,
    },
    {
      id: "crecimiento",
      label: "Crecimiento y vacunación",
      show: type === "pediatrica",
      sensitive: true,
    },
    { id: "internamientos", label: "Internamientos", show: type === "hospital", sensitive: true },
  ];
  const tabs = allTabs.filter((t) => t.show);
  const activeTab = tabs.find((t) => t.id === tab);

  const archive = async () => {
    const updated = await pacientesService.updateStatus(
      patient.id,
      archiveReason === "fallecimiento" ? "fallecido" : "archivado",
    );
    if (updated) setPatient(updated);
    setArchiveOpen(false);
  };
  const openEdit = () => {
    setEditDraft({
      phone: patient.phone,
      address: patient.address,
      municipality: patient.municipality,
      department: patient.department,
      status: patient.status,
    });
    setEditOpen(true);
  };
  const saveEdit = async () => {
    const updated = await pacientesService.update(patient.id, editDraft);
    if (updated) setPatient(updated);
    setEditOpen(false);
  };

  return (
    <>
      <Link
        to="/pacientes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-[#176b87]"
      >
        <ArrowLeft size={16} />
        Volver a pacientes
      </Link>
      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-[#dff3f2] via-[#edf7f6] to-[#e7f1f7]" />
        <div className="-mt-8 flex flex-wrap items-end justify-between gap-4 px-6 pb-6">
          <div className="flex items-end gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-[#176b87] text-xl font-bold text-white shadow">
              {patient.firstName[0]}
              {patient.lastName[0]}
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {patient.firstName} {patient.middleName} {patient.lastName}{" "}
                  {patient.secondLastName}
                </h1>
                <StatusBadge status={patient.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                DPI/CUI {patient.cui} · Expediente {patient.id.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {session.user.role !== "admin" && (
              <Button variant="secondary" onClick={openEdit}>
                <Edit3 size={16} />
                Editar datos
              </Button>
            )}
            <Button variant="danger" onClick={() => setArchiveOpen(true)}>
              <Archive size={16} />
              Archivar historial
            </Button>
          </div>
        </div>
        <div className="flex overflow-x-auto border-t border-slate-100 px-4">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`whitespace-nowrap border-b-2 px-4 py-3.5 text-sm font-semibold transition ${tab === item.id ? "border-[#278aa5] text-[#176b87]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {item.label}
              {item.sensitive && !clinicalAllowed && (
                <span className="ml-1.5 text-slate-300">•</span>
              )}
            </button>
          ))}
        </div>
      </Card>
      <div className="mt-5">
        {activeTab?.sensitive && !clinicalAllowed ? (
          <AccessRestricted
            message={
              session.user.role === "secretaria"
                ? "El personal de secretaría no puede consultar diagnósticos, notas clínicas, tratamientos, recetas ni resultados."
                : "La administración gestiona usuarios y catálogos, pero no accede a historiales clínicos."
            }
          />
        ) : tab === "general" ? (
          <GeneralTab patient={patient} />
        ) : tab === "contactos" ? (
          <ContactsTab patient={patient} />
        ) : tab === "consultas" ? (
          <ConsultationsTab consultations={consultations} />
        ) : tab === "diagnosticos" ? (
          <DiagnosesTab consultations={consultations} />
        ) : tab === "tratamientos" ? (
          <TreatmentsTab consultations={consultations} />
        ) : tab === "laboratorio" ? (
          <LabTab orders={orders} />
        ) : tab === "crecimiento" ? (
          <GrowthTab growth={growth} vaccines={vaccines} />
        ) : (
          <AdmissionsTab admissions={admissions} />
        )}
      </div>
      <Modal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title="Archivar historial"
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={archive}>
              Confirmar archivo
            </Button>
          </>
        }
      >
        <div className="flex gap-3 rounded-xl bg-amber-50 p-4 text-amber-800">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <p className="text-sm leading-6">
            El historial dejará de aparecer entre los pacientes activos. La información clínica se
            conservará.
          </p>
        </div>
        <div className="mt-5">
          <Select
            label="Motivo del archivo"
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
          >
            <option value="traslado">Traslado</option>
            <option value="fallecimiento">Fallecimiento</option>
            <option value="administrativa">Causa administrativa</option>
          </Select>
        </div>
      </Modal>
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar datos generales"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveEdit}>Guardar cambios</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Teléfono"
            value={editDraft.phone}
            onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })}
          />
          <Input
            label="Dirección de residencia"
            value={editDraft.address}
            onChange={(e) => setEditDraft({ ...editDraft, address: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Municipio"
              value={editDraft.municipality}
              onChange={(e) => setEditDraft({ ...editDraft, municipality: e.target.value })}
            />
            <Input
              label="Departamento"
              value={editDraft.department}
              onChange={(e) => setEditDraft({ ...editDraft, department: e.target.value })}
            />
          </div>
          <Select
            label="Estado"
            value={editDraft.status}
            onChange={(e) =>
              setEditDraft({ ...editDraft, status: e.target.value as Patient["status"] })
            }
          >
            <option value="activo">Activo</option>
            <option value="archivado">Archivado</option>
            <option value="fallecido">Fallecido</option>
          </Select>
        </div>
      </Modal>
    </>
  );
}

function GeneralTab({ patient }: { patient: Patient }) {
  const items = [
    { icon: UserRound, label: "Fecha de nacimiento", value: patient.birthDate },
    { icon: Droplets, label: "Tipo de sangre", value: patient.bloodType },
    { icon: Phone, label: "Teléfono", value: patient.phone },
    { icon: Mail, label: "Correo", value: patient.email },
    {
      icon: MapPin,
      label: "Residencia",
      value: `${patient.address}, ${patient.municipality}, ${patient.department}`,
    },
    { icon: Calendar, label: "Última visita", value: patient.lastVisit },
  ];
  return (
    <Card className="p-6">
      <h2 className="font-bold text-slate-900">Información general</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-500">
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-400">{label}</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ContactsTab({ patient }: { patient: Patient }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="font-bold text-slate-900">Alergias conocidas</h2>
        <div className="mt-4 space-y-3">
          {patient.allergies.length ? (
            patient.allergies.map((a) => (
              <div
                key={a.substance}
                className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/50 p-4"
              >
                <ShieldAlert size={19} className="text-red-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{a.substance}</p>
                  <p className="text-xs text-slate-500">{a.reaction}</p>
                </div>
                <Badge tone="red">{a.severity}</Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">Sin alergias conocidas.</p>
          )}
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="font-bold text-slate-900">Contactos de emergencia</h2>
        <div className="mt-4 space-y-3">
          {patient.emergencyContacts.map((c) => (
            <div key={c.phone} className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-800">{c.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {c.relationship} · {c.phone}
                {c.alternativePhone ? ` · ${c.alternativePhone}` : ""}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ConsultationsTab({ consultations }: { consultations: Consultation[] }) {
  return (
    <Card className="p-6">
      <h2 className="font-bold text-slate-900">Historial de consultas</h2>
      <div className="mt-6 space-y-0">
        {consultations.map((c) => (
          <div key={c.id} className="relative border-l-2 border-slate-200 pb-8 pl-6 last:pb-0">
            <span className="absolute -left-[7px] top-0 h-3 w-3 rounded-full bg-[#48a99c] ring-4 ring-white" />
            <p className="text-xs font-semibold text-[#176b87]">{c.date}</p>
            <h3 className="mt-1 font-semibold text-slate-800">{c.reason}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">{c.notes}</p>
            <p className="mt-2 text-xs text-slate-400">{c.doctor}</p>
          </div>
        ))}
        {!consultations.length && (
          <p className="text-sm text-slate-500">No hay consultas registradas.</p>
        )}
      </div>
    </Card>
  );
}

function DiagnosesTab({ consultations }: { consultations: Consultation[] }) {
  const diagnoses = consultations.flatMap((c) => c.diagnoses);
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-6">
        <h2 className="font-bold text-slate-900">Diagnósticos</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {diagnoses.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-4 p-5">
            <span className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm font-bold text-slate-700">
              {d.cie10}
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">{d.description}</p>
              <p className="text-xs text-slate-400">
                {d.date} · {d.doctor}
              </p>
            </div>
            <StatusBadge status={d.type} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function TreatmentsTab({ consultations }: { consultations: Consultation[] }) {
  const prescriptions = consultations.flatMap((c) =>
    c.prescriptions.map((p) => ({ ...p, date: c.date })),
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {prescriptions.map((p, i) => (
        <Card key={`${p.medicine}-${i}`} className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-[#278aa5]">RECETA · {p.date}</p>
              <h3 className="mt-2 font-bold text-slate-900">{p.medicine}</h3>
            </div>
            <Droplets size={19} className="text-[#48a99c]" />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-slate-400">Dosis</dt>
              <dd className="mt-1 font-medium text-slate-700">{p.dose}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Frecuencia</dt>
              <dd className="mt-1 font-medium text-slate-700">{p.frequency}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Duración</dt>
              <dd className="mt-1 font-medium text-slate-700">{p.duration}</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            {p.instructions}
          </p>
        </Card>
      ))}
    </div>
  );
}

function LabTab({ orders }: { orders: LabOrder[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-6">
        <h2 className="font-bold text-slate-900">Exámenes de laboratorio</h2>
      </div>
      {orders.map((o) => (
        <div key={o.id} className="border-b border-slate-100 p-5 last:border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">{o.type}</p>
              <p className="mt-1 text-xs text-slate-400">
                {o.id} · {o.requestedAt}
              </p>
            </div>
            <StatusBadge status={o.status} />
          </div>
        </div>
      ))}
      {!orders.length && <p className="p-8 text-sm text-slate-500">No hay exámenes registrados.</p>}
    </Card>
  );
}

function GrowthTab({ growth, vaccines }: { growth: GrowthRecord[]; vaccines: VaccineRecord[] }) {
  const maxWeight = Math.max(...growth.map((g) => g.weight));
  return (
    <div className="space-y-5">
      <Card className="p-6">
        <h2 className="font-bold text-slate-900">Evolución de crecimiento</h2>
        <div className="mt-6 flex h-44 items-end gap-8 rounded-xl bg-slate-50 px-8 pt-6">
          {growth.map((g) => (
            <div
              key={g.date}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <span className="text-xs font-semibold text-[#176b87]">{g.weight} kg</span>
              <div
                className="w-full max-w-20 rounded-t-lg bg-gradient-to-t from-[#176b87] to-[#66b8ae]"
                style={{ height: `${(g.weight / maxWeight) * 75}%` }}
              />
              <span className="text-[10px] text-slate-400">{g.date.slice(0, 4)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="py-2">Fecha</th>
                <th>Peso</th>
                <th>Talla</th>
                <th>Perímetro cefálico</th>
              </tr>
            </thead>
            <tbody>
              {growth.map((g) => (
                <tr key={g.date} className="border-t border-slate-100">
                  <td className="py-3">{g.date}</td>
                  <td>{g.weight} kg</td>
                  <td>{g.height} cm</td>
                  <td>{g.headCircumference} cm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-6">
          <h2 className="font-bold text-slate-900">Esquema de vacunación</h2>
        </div>
        {vaccines.map((v) => (
          <div
            key={`${v.name}-${v.dose}`}
            className="flex items-center gap-4 border-b border-slate-100 p-5 last:border-0"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">
                {v.name} · {v.dose}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {v.date ? `${v.date} · Lote ${v.lot}` : "Fecha por programar"}
              </p>
            </div>
            <StatusBadge status={v.status} />
          </div>
        ))}
      </Card>
    </div>
  );
}

function AdmissionsTab({ admissions }: { admissions: Admission[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-6">
        <h2 className="font-bold text-slate-900">Internamientos</h2>
      </div>
      {admissions.map((a) => (
        <div key={a.id} className="grid gap-4 p-6 sm:grid-cols-4">
          <div>
            <p className="text-xs text-slate-400">Ingreso</p>
            <p className="mt-1 text-sm font-semibold">{a.admissionDate}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Cama</p>
            <p className="mt-1 text-sm font-semibold">{a.bed}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Motivo</p>
            <p className="mt-1 text-sm font-semibold">{a.reason}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Egreso</p>
            <p className="mt-1 text-sm font-semibold">{a.dischargeDate ?? "Activo"}</p>
          </div>
        </div>
      ))}
    </Card>
  );
}
