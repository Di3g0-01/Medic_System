import { examCatalog, medicines, users, vaccineCatalog } from "../mocks/data";
import type { CatalogItem, Role, User } from "../types";
import { mockResponse } from "./api";

export const adminService = {
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
  addCatalogItem: async (
    catalog: "medicines" | "vaccines" | "exams",
    item: Omit<CatalogItem, "id">,
  ) => {
    const list =
      catalog === "medicines" ? medicines : catalog === "vaccines" ? vaccineCatalog : examCatalog;
    const created = { ...item, id: `${catalog}-${list.length + 1}` };
    list.push(created);
    return mockResponse(created);
  },
};
