import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../components/ui";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-sm font-bold text-[#278aa5]">ERROR 404</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Página no encontrada</h1>
      <p className="mt-2 text-slate-500">La ruta que buscas no está disponible.</p>
      <Link to="/" className="mt-6">
        <Button>
          <ArrowLeft size={17} />
          Volver al resumen
        </Button>
      </Link>
    </div>
  );
}
