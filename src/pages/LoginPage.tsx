import { ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Logo } from "../components/Logo";
import { Button, Input } from "../components/ui";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { session, login } = useAuth();
  const [username, setUsername] = useState("medico");
  const [password, setPassword] = useState("demo123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (session) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
      navigate((location.state as { from?: string })?.from ?? "/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible iniciar sesión");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[.95fr_1.05fr]">
      <div className="flex min-h-screen flex-col px-6 py-7 sm:px-12 lg:px-16 xl:px-24">
        <Logo />
        <div className="my-auto w-full max-w-md self-center py-12">
          <div className="mb-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-[#278aa5]">
              Acceso seguro
            </p>
            <h1 className="text-3xl font-bold tracking-[-.035em] text-slate-900 sm:text-4xl">
              Bienvenido a Red Clínica
            </h1>
            <p className="mt-3 leading-6 text-slate-500">
              Ingresa tus credenciales. La institución y tus permisos se detectarán automáticamente.
            </p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <Input
              label="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
            <div className="relative">
              <Input
                label="Contraseña"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                error={error}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[35px] rounded-lg p-1 text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <Button className="w-full py-3" disabled={busy}>
              {busy ? "Verificando…" : "Ingresar al sistema"} <ArrowRight size={17} />
            </Button>
          </form>
          <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-500">
            <span className="font-semibold text-slate-700">Accesos de demostración:</span> medico,
            secretaria, admin, pediatra o laboratorio. Contraseña:{" "}
            <span className="font-mono font-semibold text-slate-700">demo123</span>.
          </div>
        </div>
        <p className="text-center text-xs text-slate-400">
          Información clínica protegida · Sesión auditada
        </p>
      </div>
      <div className="relative hidden overflow-hidden bg-[#0e5368] lg:flex lg:flex-col lg:justify-between lg:p-16 xl:p-20">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #67d0c2 0, transparent 30%), radial-gradient(circle at 80% 80%, #278aa5 0, transparent 32%)",
          }}
        />
        <div className="absolute -right-24 top-28 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -right-10 top-44 h-64 w-64 rounded-full border border-white/10" />
        <div className="relative z-10 ml-auto flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white/90 backdrop-blur">
          <ShieldCheck size={16} /> Plataforma clínica segura
        </div>
        <div className="relative z-10 max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-[#9de3da]">
            Una red, una historia clínica
          </p>
          <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-[-.03em] text-white xl:text-5xl">
            Atención coordinada para cada etapa de la vida.
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-8 text-white/70">
            Conecta información relevante entre instituciones y permite que cada profesional vea
            exactamente lo que necesita.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 text-sm text-white/85">
            {[
              "Hospital General",
              "Clínica Odontológica",
              "Laboratorio Clínico",
              "Centro Médico Pediátrico",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 size={17} className="text-[#8eddd3]" />
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-white/45">
          Red Clínica · Sistema de historiales clínicos electrónicos
        </p>
      </div>
    </div>
  );
}
