import { FlaskConical, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { StatusBadge } from "../components/StatusBadge";
import { Button, Card, Input, Modal, PageHeader } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { laboratorioService } from "../services/consultasService";
import { pacientesService } from "../services/pacientesService";
import type { LabOrder, Patient } from "../types";

export function LabPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<LabOrder | null>(null);
  const [search, setSearch] = useState("");
  const refresh = () =>
    Promise.all([laboratorioService.list(), pacientesService.list()]).then(([o, p]) => {
      setOrders(o);
      setPatients(p);
    });
  useEffect(() => {
    refresh();
  }, []);
  if (session?.institution.type !== "laboratorio") return <Navigate to="/" replace />;
  const name = (id: string) => {
    const p = patients.find((v) => v.id === id);
    return p ? `${p.firstName} ${p.lastName}` : "Paciente";
  };
  const save = async () => {
    if (!selected) return;
    await laboratorioService.update(selected.id, {
      parameters: selected.parameters,
      status: selected.parameters.every((p) => p.value) ? "completado" : "en_proceso",
    });
    setSelected(null);
    refresh();
  };
  return (
    <>
      <PageHeader
        title="Laboratorio clínico"
        description="Gestiona órdenes y captura resultados por parámetro."
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5">
          <div className="relative flex-1">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              size={17}
            />
            <input
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#278aa5]"
              placeholder="Buscar por orden, paciente o examen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-6 py-3.5">Orden</th>
                <th className="px-4">Paciente</th>
                <th className="px-4">Examen</th>
                <th className="px-4">Fecha</th>
                <th className="px-4">Estado</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders
                .filter((o) =>
                  `${o.id} ${o.type} ${name(o.patientId)}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-bold text-[#176b87]">{order.id}</td>
                    <td className="px-4 text-sm font-semibold text-slate-700">
                      {name(order.patientId)}
                    </td>
                    <td className="px-4 text-sm text-slate-600">{order.type}</td>
                    <td className="px-4 text-sm text-slate-500">{order.requestedAt}</td>
                    <td className="px-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-6 text-right">
                      <Button
                        variant="secondary"
                        className="py-2"
                        onClick={() => setSelected(structuredClone(order))}
                      >
                        {order.status === "completado" ? "Ver resultados" : "Capturar"}
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Resultados · ${selected?.type ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Cancelar
            </Button>
            <Button onClick={save}>Guardar resultados</Button>
          </>
        }
      >
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-sky-50 p-4 text-sky-800">
          <FlaskConical size={20} />
          <div>
            <p className="text-sm font-semibold">
              {selected?.id} · {selected && name(selected.patientId)}
            </p>
            <p className="text-xs text-sky-600">Captura cada valor según el reporte procesado.</p>
          </div>
        </div>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {selected?.parameters.map((parameter, index) => (
            <div key={parameter.name} className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">{parameter.name}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Valor obtenido"
                  value={parameter.value}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      parameters: selected.parameters.map((p, i) =>
                        i === index ? { ...p, value: e.target.value } : p,
                      ),
                    })
                  }
                />
                <Input
                  label="Rango de referencia"
                  value={parameter.range}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      parameters: selected.parameters.map((p, i) =>
                        i === index ? { ...p, range: e.target.value } : p,
                      ),
                    })
                  }
                />
              </div>
              <Input
                label="Observaciones"
                className="mt-3"
                value={parameter.observations ?? ""}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    parameters: selected.parameters.map((p, i) =>
                      i === index ? { ...p, observations: e.target.value } : p,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
