import { createBrowserRouter } from "react-router";
import { AppLayout } from "../layouts/AppLayout";
import { AdminPage } from "../pages/AdminPage";
import { AgendaPage } from "../pages/AgendaPage";
import { ConsultationPage } from "../pages/ConsultationPage";
import { DashboardPage } from "../pages/DashboardPage";
import { LabPage } from "../pages/LabPage";
import { LoginPage } from "../pages/LoginPage";
import { NewPatientPage } from "../pages/NewPatientPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PatientProfilePage } from "../pages/PatientProfilePage";
import { PatientsPage } from "../pages/PatientsPage";

export const router = createBrowserRouter([
  { path: "/login", Component: LoginPage },
  {
    path: "/",
    Component: AppLayout,
    children: [
      { index: true, Component: DashboardPage },
      { path: "pacientes", Component: PatientsPage },
      { path: "pacientes/nuevo", Component: NewPatientPage },
      { path: "pacientes/:id", Component: PatientProfilePage },
      { path: "agenda", Component: AgendaPage },
      { path: "consulta/nueva", Component: ConsultationPage },
      { path: "laboratorio", Component: LabPage },
      { path: "administracion", Component: AdminPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);
