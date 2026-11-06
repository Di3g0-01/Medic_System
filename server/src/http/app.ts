import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import type { AppDeps } from "../application/context.ts";
import { DomainError } from "../domain/errors.ts";
import { buildRouter, type HttpOptions } from "./routes.ts";

/** Errores → respuesta JSON homogénea { error, code }. */
function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof DomainError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return res.status(422).json({ error: `${issue.path.join(".") || "datos"}: ${issue.message}`, code: "VALIDATION" });
  }
  if (err instanceof SyntaxError) return res.status(400).json({ error: "JSON inválido", code: "BAD_REQUEST" });
  console.error("[api] error no controlado", err);
  return res.status(500).json({ error: "Error interno del servidor", code: "INTERNAL" });
}

export function createApp(deps: AppDeps, options: HttpOptions & { corsOrigin: string }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: options.corsOrigin === "*" ? true : options.corsOrigin.split(",") }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", buildRouter(deps, options));
  app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada", code: "NOT_FOUND" }));
  app.use(errorHandler);
  return app;
}
