import { examCatalog, medicines, users, vaccineCatalog } from "../mocks/data";
import type { CatalogItem, Role, User } from "../types";
import { mockResponse } from "./api";
import { enc, http, USE_MOCKS } from "./httpClient";

type Catalog = "medicines" | "vaccines" | "exams";

const mock = {
  listUsers: () => mockResponse(users),
  updateUser: async (id: string, changes: Partial<User>) => {
    const user = users.find((item) => item.id === id);
    if (user) Object.assign(user, changes);
    return mockResponse(user);
  },
  createUser: async (data: Omit<User, "id">) => {
    const user = { ...data, id: `u${users.length + 1}` };
    users.push(user);
    return mockResponse(user);
  },
  changeRole: (id: string, role: Role) => adminService.updateUser(id, { role }),
  getCatalogs: () => mockResponse({ medicines, vaccines: vaccineCatalog, exams: examCatalog }),
  addCatalogItem: async (catalog: Catalog, item: Omit<CatalogItem, "id">) => {
    const list =
      catalog === "medicines" ? medicines : catalog === "vaccines" ? vaccineCatalog : examCatalog;
    const created = { ...item, id: `${catalog}-${list.length + 1}` };
    list.push(created);
    return mockResponse(created);
  },
};

const api: typeof mock = {
  listUsers: () => http.get<User[]>("/admin/users"),
  updateUser: (id, changes) =>
    http.patch<User>(`/admin/users/${enc(id)}`, {
      name: changes.name,
      role: changes.role,
      blocked: changes.blocked,
      institutionId: changes.institutionId,
    }),
  // La contraseña inicial la asigna el backend (INITIAL_USER_PASSWORD).
  createUser: (data) => http.post<User>("/admin/users", data),
  changeRole: (id, role) => adminService.updateUser(id, { role }),
  getCatalogs: () => http.get<{ medicines: CatalogItem[]; vaccines: CatalogItem[]; exams: CatalogItem[] }>("/catalogs"),
  addCatalogItem: (catalog, item) => http.post<CatalogItem>(`/catalogs/${catalog}`, item),
};

export const adminService = USE_MOCKS ? mock : api;
