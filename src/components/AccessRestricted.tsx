import { LockKeyhole } from "lucide-react";

export function AccessRestricted({
  message = "Tu rol no tiene permiso para consultar información clínica sensible.",
}: {
  message?: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
      <div className="rounded-2xl bg-white p-3 text-slate-400 shadow-sm">
        <LockKeyhole size={22} />
      </div>
      <h3 className="mt-4 font-semibold text-slate-800">Acceso restringido</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{message}</p>
    </div>
  );
}
