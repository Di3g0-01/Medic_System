import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router";
import { Logo } from "../components/Logo";
import { useAuth } from "../hooks/useAuth";
import { API_ERROR_EVENT } from "../services/httpClient";

export function AppLayout() {
  const { session, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const [apiError, setApiError] = useState<string | null>(null);

  // Manejo central de errores de la API: aviso discreto, solo cuando una operación falla.
  useEffect(() => {
    const onError = (event: Event) => setApiError((event as CustomEvent<string>).detail);
    window.addEventListener(API_ERROR_EVENT, onError);
    return () => window.removeEventListener(API_ERROR_EVENT, onError);
  }, []);
  useEffect(() => {
    if (!apiError) return;
    const timer = setTimeout(() => setApiError(null), 6000);
    return () => clearTimeout(timer);
  }, [apiError]);

  if (loading) return <div className="min-h-screen bg-slate-50" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const items = [
    { to: "/", label: "Resumen", icon: LayoutDashboard, show: true },
    { to: "/pacientes", label: "Pacientes", icon: Users, show: true },
    { to: "/agenda", label: "Agenda", icon: CalendarDays, show: session.user.role !== "admin" },
    {
      to: "/consulta/nueva",
      label: "Atender consulta",
      icon: ClipboardList,
      show: session.user.role === "medico",
    },
    {
      to: "/laboratorio",
      label: "Laboratorio",
      icon: FlaskConical,
      show: session.institution.type === "laboratorio",
    },
    {
      to: "/administracion",
      label: "Administración",
      icon: Settings,
      show: session.user.role === "admin",
    },
  ].filter((item) => item.show);

  const nav = (
    <>
      <div className="flex h-20 items-center justify-between px-5">
        <Logo />
        <button
          className="rounded-lg p-2 text-slate-500 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X size={20} />
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
          Navegación
        </p>
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-[#e8f4f5] text-[#115f76]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`
            }
          >
            <Icon size={19} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-800">{session.institution.name}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {session.institution.engine
              ? `Conectado a: ${session.institution.name} (${session.institution.engine})`
              : "Sesión institucional activa"}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f6f8fa]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200/80 bg-white lg:flex">
        {nav}
      </aside>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="flex h-full w-72 flex-col bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            {nav}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur md:px-8">
          <button
            className="rounded-xl border border-slate-200 p-2.5 text-slate-600 lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="hidden lg:block">
            <div className="text-xs font-medium text-slate-400">Red Clínica</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-800">
              {session.institution.name}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold text-slate-800">{session.user.name}</div>
              <div className="text-xs capitalize text-slate-500">
                {session.user.role}
                {session.user.specialty ? ` · ${session.user.specialty}` : ""}
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dceff1] text-sm font-bold text-[#176b87]">
              {session.user.name
                .split(" ")
                .filter((v) => !v.endsWith("."))
                .slice(0, 2)
                .map((v) => v[0])
                .join("")}
            </div>
            <ChevronDown size={15} className="hidden text-slate-400 sm:block" />
            <button
              onClick={logout}
              className="ml-1 rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              title="Cerrar sesión"
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] p-4 md:p-8">
          <Outlet />
        </main>
        {apiError && (
          <div
            role="alert"
            className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-red-100 bg-white px-4 py-3 text-sm text-red-700 shadow-lg"
          >
            <span className="flex-1">{apiError}</span>
            <button onClick={() => setApiError(null)} className="text-red-400 hover:text-red-600" title="Cerrar">
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
