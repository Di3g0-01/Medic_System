import { ChevronRight, Search, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Loading } from "../components/Loading";
import { StatusBadge } from "../components/StatusBadge";
import { Button, Card, EmptyState, PageHeader, Select } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { pacientesService } from "../services/pacientesService";
import type { Patient, PatientStatus } from "../types";

export function PatientsPage() {
  const { session } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"todos" | PatientStatus>("todos");

  useEffect(() => {
    pacientesService
      .list()
      .then(setPatients)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      patients.filter((patient) => {
        const term = search.toLowerCase();
        const matchesSearch =
          `${patient.firstName} ${patient.middleName} ${patient.lastName} ${patient.secondLastName} ${patient.cui}`
            .toLowerCase()
            .includes(term);
        return matchesSearch && (status === "todos" || patient.status === status);
      }),
    [patients, search, status],
  );

  if (loading) return <Loading />;
  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Consulta y administra los historiales clínicos de la red."
        action={
          session?.user.role !== "admin" ? (
            <Link to="/pacientes/nuevo">
              <Button>
                <UserPlus size={17} />
                Nuevo paciente
              </Button>
            </Link>
          ) : undefined
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#278aa5] focus:ring-3 focus:ring-[#278aa5]/10"
              placeholder="Buscar por nombre o DPI/CUI…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="sm:w-44"
          >
            <option value="todos">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="archivado">Archivado</option>
            <option value="fallecido">Fallecido</option>
          </Select>
        </div>
        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-3.5">Paciente</th>
                  <th className="px-4 py-3.5">DPI / CUI</th>
                  <th className="px-4 py-3.5">Contacto</th>
                  <th className="px-4 py-3.5">Última visita</th>
                  <th className="px-4 py-3.5">Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((patient) => (
                  <tr key={patient.id} className="group hover:bg-slate-50/70">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e5f2f3] text-xs font-bold text-[#176b87]">
                          {patient.firstName[0]}
                          {patient.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {patient.firstName} {patient.middleName} {patient.lastName}{" "}
                            {patient.secondLastName}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {patient.bloodType} · {patient.sex === "F" ? "Femenino" : "Masculino"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">{patient.cui}</td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-slate-600">{patient.phone}</p>
                      <p className="text-xs text-slate-400">{patient.email}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500">{patient.lastVisit}</td>
                    <td className="px-4 py-4">
                      <StatusBadge status={patient.status} />
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/pacientes/${patient.id}`}
                        className="flex justify-end text-slate-300 group-hover:text-[#176b87]"
                      >
                        <ChevronRight size={19} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Users size={22} />}
            title="No encontramos pacientes"
            description="Intenta con otro nombre, DPI/CUI o estado."
          />
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
          <span>
            {filtered.length} de {patients.length} pacientes
          </span>
          <span>Información actualizada</span>
        </div>
      </Card>
    </>
  );
}
