import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../domain/errors.ts";
import type { Actor } from "../domain/User.ts";

/** Claims del JWT: userId, role, institutionId (+ doctorId y nombre para la sesión). */
interface Claims {
  userId: number;
  role: Actor["role"];
  institutionId: number;
  doctorId: string | null;
  name: string;
}

export function signToken(actor: Actor, secret: string, expiresIn: string): string {
  const claims: Claims = { userId: actor.userId, role: actor.role, institutionId: actor.institutionId, doctorId: actor.doctorId, name: actor.name };
  return jwt.sign(claims, secret, { expiresIn: expiresIn as jwt.SignOptions["expiresIn"], subject: String(actor.userId) });
}

export function verifyToken(token: string, secret: string): Actor {
  try {
    const c = jwt.verify(token, secret) as Claims;
    return { userId: c.userId, role: c.role, institutionId: c.institutionId, doctorId: c.doctorId, name: c.name };
  } catch {
    throw new UnauthorizedError("Sesión expirada o inválida");
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

/** Middleware: exige "Authorization: Bearer <jwt>" y adjunta el actor a la petición. */
export const authenticate = (secret: string) => (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new UnauthorizedError("Se requiere iniciar sesión"));
  req.actor = verifyToken(token, secret);
  next();
};
