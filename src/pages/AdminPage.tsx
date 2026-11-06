import { Ban, BookOpen, Plus, ShieldCheck, UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { StatusBadge } from "../components/StatusBadge";
import { Badge, Button, Card, Input, Modal, PageHeader, Select } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { adminService } from "../services/adminService";
import type { CatalogItem, Role, User } from "../types";

type AdminTab = "usuarios" | "medicamentos" | "vacunas" | "examenes";

export function AdminPage() {
  const { session } = useAuth();
  const [tab, setTab] = useState<AdminTab>("usuarios");
  const [users, setUsers] = useState<User[]>([]);
  const [catalogs, setCatalogs] = useState<{
    medicines: CatalogItem[];
    vaccines: CatalogItem[];
    exams: CatalogItem[];
  }>({ medicines: [], vaccines: [], exams: [] });
  const [modal, setModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newUser, setNewUser] = useState({
    name: "",
    username: "",
    role: "medico" as Role,
    institutionId: "i1",
  });

  const refresh = () =>
    Promise.all([adminService.listUsers(), adminService.getCatalogs()]).then(([u, c]) => {
      setUsers(u);
      setCatalogs(c);
    });
  useEffect(() => {
    refresh();
  }, []);
  if (session?.user.role !== "admin") return <Navigate to="/" replace />;
  const changeRole = async (id: string, role: Role) => {
    await adminService.changeRole(id, role);
    refresh();
  };
  const block = async (user: User) => {
    await adminService.updateUser(user.id, { blocked: !user.blocked });
    refresh();
  };
  const addItem = async () => {
    const catalog = tab === "medicamentos" ? "medicines" : tab === "vacunas" ? "vaccines" : "exams";
    await adminService.addCatalogItem(catalog, {
      name: newName,
      detail: newDetail,
      status: "activo",
    });
    setNewName("");
    setNewDetail("");
    setModal(false);
    refresh();
  };
  const addUser = async () => {
    await adminService.createUser(newUser);
    setNewUser({ name: "", username: "", role: "medico", institutionId: "i1" });
    setModal(false);
    refresh();
  };
  const list =
    tab === "medicamentos"
      ? catalogs.medicines
      : tab === "vacunas"
        ? catalogs.vaccines
        : catalogs.exams;
  return (
    <>
      <PageHeader
        title="Administración"
        description="Gestiona accesos, roles y catálogos institucionales."
      />
      <div className="mb-5 flex overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5">
        {[
          { id: "usuarios", label: "Usuarios y roles", icon: UserCog },
          { id: "medicamentos", label: "Medicamentos", icon: BookOpen },
          { id: "vacunas", label: "Vacunas", icon: ShieldCheck },
          { id: "examenes", label: "Tipos de examen", icon: BookOpen },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as AdminTab)}
            className={`flex min-w-fit flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${tab === id ? "bg-[#e8f4f5] text-[#176b87]" : "text-slate-500 hover:bg-slate-50"}`}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      {tab === "usuarios" ? (
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div>
              <h2 className="font-bold text-slate-900">Usuarios de la red</h2>
              <p className="text-xs text-slate-500">Crea, bloquea o actualiza permisos.</p>
            </div>
            <Button onClick={() => setModal(true)}>
              <Plus size={17} />
              Crear usuario
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-6 py-3.5">Usuario</th>
                  <th className="px-4">Institución</th>
                  <th className="px-4">Rol</th>
                  <th className="px-4">Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                      <p className="text-xs text-slate-400">@{user.username}</p>
                    </td>
                    <td className="px-4 text-sm text-slate-600">{user.institutionId}</td>
                    <td className="px-4">
                      <Select
                        value={user.role}
                        onChange={(e) => changeRole(user.id, e.target.value as Role)}
                      >
                        <option value="medico">Médico</option>
                        <option value="secretaria">Secretaría</option>
                        <option value="admin">Admin</option>
                      </Select>
                    </td>
                    <td className="px-4">
                      {user.blocked ? (
                        <Badge tone="red">Bloqueado</Badge>
                      ) : (
                        <StatusBadge status="activo" />
                      )}
                    </td>
                    <td className="px-6 text-right">
                      <Button
                        variant="ghost"
                        className={user.blocked ? "text-emerald-600" : "text-red-600"}
                        onClick={() => block(user)}
                      >
                        <Ban size={16} />
                        {user.blocked ? "Habilitar" : "Bloquear"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div>
              <h2 className="font-bold text-slate-900">Catálogo de {tab}</h2>
              <p className="text-xs text-slate-500">
                Elementos disponibles en los formularios clínicos.
              </p>
            </div>
            <Button onClick={() => setModal(true)}>
              <Plus size={17} />
              Agregar elemento
            </Button>
          </div>
          <div className="divide-y divide-slate-100">
            {list.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </Card>
      )}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={tab === "usuarios" ? "Crear usuario" : `Agregar a ${tab}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={tab === "usuarios" ? addUser : addItem}
              disabled={tab === "usuarios" ? !newUser.name || !newUser.username : !newName}
            >
              Guardar
            </Button>
          </>
        }
      >
        {tab === "usuarios" ? (
          <div className="space-y-4">
            <Input
              label="Nombre completo"
              placeholder="Nombre del colaborador"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            />
            <Input
              label="Usuario"
              placeholder="usuario"
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            />
            <Select
              label="Rol"
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}
            >
              <option value="medico">Médico</option>
              <option value="secretaria">Secretaría</option>
              <option value="admin">Admin</option>
            </Select>
            <Select
              label="Institución"
              value={newUser.institutionId}
              onChange={(e) => setNewUser({ ...newUser, institutionId: e.target.value })}
            >
              <option value="i1">Hospital General</option>
              <option value="i2">Clínica Odontológica</option>
              <option value="i3">Laboratorio Clínico</option>
              <option value="i4">Centro Médico Pediátrico</option>
            </Select>
          </div>
        ) : (
          <div className="space-y-4">
            <Input label="Nombre" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input
              label="Descripción / detalle"
              value={newDetail}
              onChange={(e) => setNewDetail(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
