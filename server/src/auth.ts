import bcrypt from "bcryptjs";
import jwt, { JwtPayload } from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";
import { db } from "./db";

export type AgentRole = "agent" | "escalation_manager";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: AgentRole;
  region: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const jwtSecret = process.env.JWT_SECRET ?? "opsdesk-development-secret";
const tokenLifetime = "12h";

export function publicUser(row: Pick<AuthUser, "id" | "name" | "email" | "role" | "region">): AuthUser {
  return { id: row.id, name: row.name, email: row.email, role: row.role, region: row.region };
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function issueToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: tokenLifetime });
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;
    const id = Number(payload.sub);
    const row = db.prepare("SELECT id, name, email, role, region, active FROM agents WHERE id = ?").get(id) as (AuthUser & { active: number }) | undefined;
    if (!row) {
      res.status(401).json({ error: "Invalid authentication token" });
      return;
    }
    if (!row.active) {
      res.status(401).json({ error: "Account is deactivated" });
      return;
    }
    req.user = publicUser(row);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired authentication token" });
  }
}

export function findUserByEmail(email: string): { id: number; name: string; email: string; role: AgentRole; region: string; password_hash: string; active: number } | undefined {
  return db.prepare("SELECT id, name, email, role, region, password_hash, active FROM agents WHERE lower(email) = lower(?)").get(email.trim()) as {
    id: number; name: string; email: string; role: AgentRole; region: string; password_hash: string; active: number;
  } | undefined;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  return bcrypt.compareSync(password, passwordHash);
}
