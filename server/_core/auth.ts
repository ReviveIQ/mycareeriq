import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";
import type { User } from "../../drizzle/schema";
import * as crypto from "crypto";

function getJwtSecret(): Uint8Array {
  const secret = ENV.cookieSecret || "fallback-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "reviveiq-salt").digest("hex");
}

export async function createSessionToken(userId: number, email: string, name: string): Promise<string> {
  return new SignJWT({ userId, email, name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1y")
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<{ userId: number; email: string; name: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      userId: payload.userId as number,
      email: payload.email as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: Request): Promise<User | null> {
  try {
    // Try Authorization header first (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const payload = await verifySessionToken(token);
      if (payload) {
        const user = await db.getUserById(payload.userId);
        return user || null;
      }
    }

    // Fall back to cookie
    const cookieHeader = req.headers.cookie || "";
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((c) => {
      const [k, ...v] = c.trim().split("=");
      if (k) cookies[k.trim()] = decodeURIComponent(v.join("="));
    });

    const token = cookies[COOKIE_NAME];
    if (!token) return null;

    const payload = await verifySessionToken(token);
    if (!payload) return null;

    const user = await db.getUserById(payload.userId);
    return user || null;
  } catch {
    return null;
  }
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      res.status(400).json({ error: "Email, password and name are required" });
      return;
    }
    try {
      const existing = await db.getUserByEmail(email);
      if (existing) {
        res.status(400).json({ error: "An account with this email already exists" });
        return;
      }
      const passwordHash = hashPassword(password);
      const user = await db.createUser({ email, name, passwordHash });
      const token = await createSessionToken(user.id, user.email!, user.name!);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      // Also return token in response for localStorage fallback
      res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
      console.error("[Auth] Register failed", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }
    try {
      const user = await db.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      const passwordHash = hashPassword(password);
      if (user.passwordHash !== passwordHash) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      const token = await createSessionToken(user.id, user.email!, user.name!);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      // Also return token in response for localStorage fallback
      res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
      console.error("[Auth] Login failed", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const user = await authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json({ id: user.id, email: user.email, name: user.name });
  });
}
