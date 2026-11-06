import { Badge } from "./ui";

const labels: Record<string, string> = {
  activo: "Activo",
  archivado: "Archivado",
  fallecido: "Fallecido",
  programada: "Programada",
  atendida: "Atendida",
  cancelada: "Cancelada",
  solicitado: "Solicitado",
  en_proceso: "En proceso",
  completado: "Completado",
  aplicada: "Aplicada",
  pendiente: "Pendiente",
  definitivo: "Definitivo",
  diferencial: "Diferencial",
  presuntivo: "Presuntivo",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = ["activo", "atendida", "completado", "aplicada", "definitivo"].includes(status)
    ? "green"
    : ["programada", "solicitado"].includes(status)
      ? "blue"
      : ["pendiente", "en_proceso", "presuntivo"].includes(status)
        ? "amber"
        : ["fallecido", "cancelada"].includes(status)
          ? "red"
          : "slate";
  return <Badge tone={tone}>{labels[status] ?? status}</Badge>;
}
