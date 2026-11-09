import { Check, FlaskConical, Plus, Save, Stethoscope, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { Button, Card, Input, PageHeader, Select } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { consultasService, laboratorioService } from "../services/consultasService";
import { pacientesService } from "../services/pacientesService";
import type { Diagnosis, Patient, Prescription } from "../types";

export function ConsultationPage() {
  const { session } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [exam, setExam] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    pacientesService.list().then((list) => {
      setPatients(list);
      setPatientId(list[0]?.id ?? "");
    });
  }, []);
  if (session?.user.role !== "medico") return <Navigate to="/" replace />;

  const addDiagnosis = () =>
    setDiagnoses([
      ...diagnoses,
      {
        id: crypto.randomUUID(),
        patientId,
        date: new Date().toISOString().slice(0, 10),
        cie10: "",
        description: "",
        type: "presuntivo",
        doctor: session.user.name,
      },
    ]);
  const addPrescription = () =>
    setPrescriptions([
      ...prescriptions,
      { medicine: "Paracetamol 500 mg", dose: "", frequency: "", duration: "", instructions: "" },
    ]);
  const save = async (attended: boolean) => {
    try {
      const savedConsultation = await consultasService.saveConsultation({
        id: crypto.randomUUID(),
        patientId,
        date: new Date().toISOString().slice(0, 10),
        reason,
        notes,
        doctor: session.user.name,
        status: attended ? "atendida" : "abierta",
        diagnoses,
        prescriptions,
      });

      if (exam && savedConsultation?.id) {
        const parameterMap: Record<string, { name: string; value: string; range: string }[]> = {
          "Hematología completa": [
            { name: "Hemoglobina", value: "", range: "12–16 g/dL" },
            { name: "Leucocitos", value: "", range: "4.5–11 x10³/µL" },
          ],
          "Perfil lipídico": [
            { name: "Colesterol total", value: "", range: "< 200 mg/dL" },
            { name: "Triglicéridos", value: "", range: "< 150 mg/dL" },
          ],
          "Glucosa en ayunas": [{ name: "Glucosa", value: "", range: "70–100 mg/dL" }],
        };
        await laboratorioService.create({
          patientId,
          consultationId: savedConsultation.id,
          type: exam,
          requestedAt: new Date().toISOString().slice(0, 10),
          status: "solicitado",
          requestedBy: session.user.name,
          parameters: parameterMap[exam] ?? [],
        });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setReason("");
      setNotes("");
      setDiagnoses([]);
      setPrescriptions([]);
      setExam("");
    } catch (err) {
      console.error("Error al guardar la consulta:", err);
    }
  };
  return (
    <>
      <PageHeader
        title="Atender consulta"
        description="Registra la evaluación clínica, el diagnóstico y las indicaciones."
        action={
          saved ? (
            <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
              <Check size={17} />
              Consulta guardada
            </span>
          ) : undefined
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card className="p-6">
            <h2 className="font-bold text-slate-900">Información de la consulta</h2>
            <div className="mt-5 space-y-4">
              <Select
                label="Paciente"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
              >
                {patients.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.firstName} {p.lastName} · {p.cui}
                  </option>
                ))}
              </Select>
              <Input
                label="Motivo de consulta"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe el motivo principal"
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Notas clínicas
                </span>
                <textarea
                  className="min-h-32 w-full rounded-xl border border-slate-200 p-3.5 text-sm outline-none focus:border-[#278aa5] focus:ring-3 focus:ring-[#278aa5]/10"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Hallazgos, signos vitales, evaluación y evolución…"
                />
              </label>
            </div>
          </Card>
          <Card>
            <SectionHeader
              icon={<Stethoscope size={18} />}
              title="Diagnósticos"
              action={
                <Button type="button" variant="secondary" onClick={addDiagnosis}>
                  <Plus size={16} />
                  Agregar diagnóstico
                </Button>
              }
            />
            <div className="space-y-3 p-6">
              {diagnoses.length === 0 && (
                <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                  No se han agregado diagnósticos.
                </p>
              )}
              {diagnoses.map((d, i) => (
                <div
                  key={d.id}
                  className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[150px_1fr_180px_auto]"
                >
                  <Input
                    label="Código CIE-10"
                    value={d.cie10}
                    onChange={(e) =>
                      setDiagnoses(
                        diagnoses.map((v, x) => (x === i ? { ...v, cie10: e.target.value } : v)),
                      )
                    }
                  />
                  <Input
                    label="Descripción"
                    value={d.description}
                    onChange={(e) =>
                      setDiagnoses(
                        diagnoses.map((v, x) =>
                          x === i ? { ...v, description: e.target.value } : v,
                        ),
                      )
                    }
                  />
                  <Select
                    label="Tipo"
                    value={d.type}
                    onChange={(e) =>
                      setDiagnoses(
                        diagnoses.map((v, x) =>
                          x === i ? { ...v, type: e.target.value as Diagnosis["type"] } : v,
                        ),
                      )
                    }
                  >
                    <option value="presuntivo">Presuntivo</option>
                    <option value="diferencial">Diferencial</option>
                    <option value="definitivo">Definitivo</option>
                  </Select>
                  <Button
                    variant="ghost"
                    className="self-end text-red-500"
                    onClick={() => setDiagnoses(diagnoses.filter((_, x) => x !== i))}
                  >
                    <Trash2 size={17} />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionHeader
              icon={<Plus size={18} />}
              title="Tratamientos y recetas"
              action={
                <Button type="button" variant="secondary" onClick={addPrescription}>
                  <Plus size={16} />
                  Agregar receta
                </Button>
              }
            />
            <div className="space-y-3 p-6">
              {prescriptions.length === 0 && (
                <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                  No se han agregado recetas.
                </p>
              )}
              {prescriptions.map((p, i) => (
                <div
                  key={i}
                  className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-5"
                >
                  <Select
                    label="Medicamento"
                    value={p.medicine}
                    onChange={(e) =>
                      setPrescriptions(
                        prescriptions.map((v, x) =>
                          x === i ? { ...v, medicine: e.target.value } : v,
                        ),
                      )
                    }
                  >
                    <option>Paracetamol 500 mg</option>
                    <option>Amoxicilina 500 mg</option>
                    <option>Atorvastatina 20 mg</option>
                  </Select>
                  <Input
                    label="Dosis"
                    value={p.dose}
                    onChange={(e) =>
                      setPrescriptions(
                        prescriptions.map((v, x) => (x === i ? { ...v, dose: e.target.value } : v)),
                      )
                    }
                  />
                  <Input
                    label="Frecuencia"
                    value={p.frequency}
                    onChange={(e) =>
                      setPrescriptions(
                        prescriptions.map((v, x) =>
                          x === i ? { ...v, frequency: e.target.value } : v,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Duración"
                    value={p.duration}
                    onChange={(e) =>
                      setPrescriptions(
                        prescriptions.map((v, x) =>
                          x === i ? { ...v, duration: e.target.value } : v,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Indicaciones"
                    value={p.instructions}
                    onChange={(e) =>
                      setPrescriptions(
                        prescriptions.map((v, x) =>
                          x === i ? { ...v, instructions: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionHeader icon={<FlaskConical size={18} />} title="Orden de laboratorio" />
            <div className="p-6">
              <Select label="Tipo de examen" value={exam} onChange={(e) => setExam(e.target.value)}>
                <option value="">Sin orden de laboratorio</option>
                <option>Hematología completa</option>
                <option>Perfil lipídico</option>
                <option>Glucosa en ayunas</option>
              </Select>
            </div>
          </Card>
        </div>
        <div>
          <Card className="sticky top-28 p-5">
            <h2 className="font-bold text-slate-900">Finalizar registro</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Revisa los datos antes de marcar la consulta como atendida.
            </p>
            <div className="my-5 space-y-3 border-y border-slate-100 py-5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Diagnósticos</span>
                <strong>{diagnoses.length}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recetas</span>
                <strong>{prescriptions.length}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Examen</span>
                <strong>{exam ? "Sí" : "No"}</strong>
              </div>
            </div>
            <div className="space-y-2">
              <Button className="w-full" onClick={() => save(true)} disabled={!reason || !notes}>
                <Check size={17} />
                Marcar como atendida
              </Button>
              <Button className="w-full" variant="secondary" onClick={() => save(false)}>
                <Save size={17} />
                Guardar borrador
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
      <h2 className="flex items-center gap-2 font-bold text-slate-900">
        <span className="text-[#278aa5]">{icon}</span>
        {title}
      </h2>
      {action}
    </div>
  );
}
