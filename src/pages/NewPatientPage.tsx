import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Button, Card, Input, PageHeader, Select } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { pacientesService } from "../services/pacientesService";
import type { Allergy, EmergencyContact, Patient } from "../types";

const blankAllergy: Allergy = { substance: "", reaction: "", severity: "leve" };
const blankContact: EmergencyContact = {
  name: "",
  relationship: "",
  phone: "",
  alternativePhone: "",
};

export function NewPatientPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ cui?: string; email?: string }>({});
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([{ ...blankContact }]);
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    secondLastName: "",
    birthDate: "",
    sex: "F" as "F" | "M",
    cui: "",
    phone: "",
    email: "",
    address: "",
    municipality: "",
    department: "",
    bloodType: "O+",
  });
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    const unique = await pacientesService.validateUnique(form.cui, form.email);
    if (!unique.cui || !unique.email) {
      setErrors({
        cui: !unique.cui ? "Ya existe un paciente con este DPI/CUI." : undefined,
        email: !unique.email ? "Este correo ya está registrado." : undefined,
      });
      setBusy(false);
      return;
    }
    const patient: Omit<Patient, "id" | "lastVisit"> = {
      ...form,
      status: "activo",
      institutionId: session.institution.id,
      allergies: allergies.filter((a) => a.substance),
      emergencyContacts: contacts.filter((c) => c.name),
    };
    const created = await pacientesService.create(patient);
    navigate(`/pacientes/${created.id}`);
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
      <PageHeader
        title="Registrar nuevo paciente"
        description="Completa los datos para crear un historial clínico en la red."
      />
      <form onSubmit={submit} className="space-y-5">
        <FormSection
          number="01"
          title="Datos personales"
          description="Información de identificación y contacto."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Input
              label="Primer nombre *"
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              required
            />
            <Input
              label="Segundo nombre"
              value={form.middleName}
              onChange={(e) => set("middleName", e.target.value)}
            />
            <Input
              label="Primer apellido *"
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              required
            />
            <Input
              label="Segundo apellido"
              value={form.secondLastName}
              onChange={(e) => set("secondLastName", e.target.value)}
            />
            <Input
              label="Fecha de nacimiento *"
              type="date"
              value={form.birthDate}
              onChange={(e) => set("birthDate", e.target.value)}
              required
            />
            <Select label="Sexo *" value={form.sex} onChange={(e) => set("sex", e.target.value)}>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </Select>
            <Input
              label="DPI / CUI *"
              placeholder="0000 00000 0000"
              value={form.cui}
              onChange={(e) => {
                set("cui", e.target.value);
                setErrors((v) => ({ ...v, cui: undefined }));
              }}
              error={errors.cui}
              required
            />
            <Select
              label="Tipo de sangre"
              value={form.bloodType}
              onChange={(e) => set("bloodType", e.target.value)}
            >
              {["O+", "O−", "A+", "A−", "B+", "B−", "AB+", "AB−"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
            <Input
              label="Teléfono *"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              required
            />
            <Input
              label="Correo electrónico *"
              type="email"
              value={form.email}
              onChange={(e) => {
                set("email", e.target.value);
                setErrors((v) => ({ ...v, email: undefined }));
              }}
              error={errors.email}
              required
            />
            <Input
              label="Municipio *"
              value={form.municipality}
              onChange={(e) => set("municipality", e.target.value)}
              required
            />
            <Input
              label="Departamento *"
              value={form.department}
              onChange={(e) => set("department", e.target.value)}
              required
            />
            <Input
              label="Dirección de residencia *"
              className="xl:col-span-2"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              required
            />
          </div>
        </FormSection>
        <FormSection
          number="02"
          title="Alergias"
          description="Agrega únicamente alergias conocidas."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAllergies([...allergies, { ...blankAllergy }])}
            >
              <Plus size={16} />
              Agregar alergia
            </Button>
          }
        >
          {allergies.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
              No se han registrado alergias.
            </p>
          ) : (
            <div className="space-y-3">
              {allergies.map((allergy, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_1fr_180px_auto]"
                >
                  <Input
                    label="Sustancia"
                    value={allergy.substance}
                    onChange={(e) =>
                      setAllergies(
                        allergies.map((a, i) =>
                          i === index ? { ...a, substance: e.target.value } : a,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Reacción"
                    value={allergy.reaction}
                    onChange={(e) =>
                      setAllergies(
                        allergies.map((a, i) =>
                          i === index ? { ...a, reaction: e.target.value } : a,
                        ),
                      )
                    }
                  />
                  <Select
                    label="Severidad"
                    value={allergy.severity}
                    onChange={(e) =>
                      setAllergies(
                        allergies.map((a, i) =>
                          i === index
                            ? { ...a, severity: e.target.value as Allergy["severity"] }
                            : a,
                        ),
                      )
                    }
                  >
                    <option value="leve">Leve</option>
                    <option value="moderada">Moderada</option>
                    <option value="grave">Grave</option>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    className="self-end text-red-500"
                    onClick={() => setAllergies(allergies.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={17} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </FormSection>
        <FormSection
          number="03"
          title="Contactos de emergencia"
          description="Personas a contactar en caso de emergencia."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => setContacts([...contacts, { ...blankContact }])}
            >
              <Plus size={16} />
              Agregar contacto
            </Button>
          }
        >
          <div className="space-y-3">
            {contacts.map((contact, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-[1.2fr_.8fr_.8fr_.8fr_auto]"
              >
                <Input
                  label="Nombre completo"
                  value={contact.name}
                  onChange={(e) =>
                    setContacts(
                      contacts.map((c, i) => (i === index ? { ...c, name: e.target.value } : c)),
                    )
                  }
                />
                <Input
                  label="Parentesco"
                  value={contact.relationship}
                  onChange={(e) =>
                    setContacts(
                      contacts.map((c, i) =>
                        i === index ? { ...c, relationship: e.target.value } : c,
                      ),
                    )
                  }
                />
                <Input
                  label="Teléfono"
                  value={contact.phone}
                  onChange={(e) =>
                    setContacts(
                      contacts.map((c, i) => (i === index ? { ...c, phone: e.target.value } : c)),
                    )
                  }
                />
                <Input
                  label="Teléfono alternativo"
                  value={contact.alternativePhone}
                  onChange={(e) =>
                    setContacts(
                      contacts.map((c, i) =>
                        i === index ? { ...c, alternativePhone: e.target.value } : c,
                      ),
                    )
                  }
                />
                {contacts.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="self-end text-red-500"
                    onClick={() => setContacts(contacts.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={17} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </FormSection>
        <div className="flex justify-end gap-3 pb-8">
          <Link to="/pacientes">
            <Button type="button" variant="secondary">
              Cancelar
            </Button>
          </Link>
          <Button disabled={busy}>
            <Save size={17} />
            {busy ? "Validando…" : "Guardar paciente"}
          </Button>
        </div>
      </form>
    </>
  );
}

function FormSection({
  number,
  title,
  description,
  action,
  children,
}: {
  number: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-[#278aa5]">{number}</span>
          <div>
            <h2 className="font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </Card>
  );
}
