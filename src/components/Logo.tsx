import { Cross } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#176b87] text-white shadow-sm">
        <Cross size={22} strokeWidth={2.5} />
      </div>
      {!compact && (
        <div>
          <div className="text-[17px] font-bold tracking-[-.02em] text-slate-900">Red Clínica</div>
          <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">
            Salud conectada
          </div>
        </div>
      )}
    </div>
  );
}
