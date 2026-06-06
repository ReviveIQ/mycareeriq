import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";
import type { User } from "../../drizzle/schema";
import * as crypto from "crypto";
import { notifyNewUser } from "./notification";

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
      res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } });
      // Owner notification (non-blocking)
      notifyNewUser(email, name).catch(() => {});
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

  // ── LinkedIn OAuth ────────────────────────────────────────────────────────
  // Step 1: Redirect to LinkedIn authorization page
  app.get("/api/auth/linkedin", (req: Request, res: Response) => {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) {
      res.status(500).json({ error: "LinkedIn OAuth not configured" });
      return;
    }

    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/linkedin/callback`;
    const scope = "openid profile email";
    const state = crypto.randomBytes(16).toString("hex");

    // Store state in cookie for CSRF protection
    res.cookie("linkedin_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000, // 10 minutes
      sameSite: "lax",
    });

    const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("state", state);

    res.redirect(authUrl.toString());
  });

  // Step 2: Handle LinkedIn callback
  app.get("/api/auth/linkedin/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;

    const frontendUrl = process.env.NODE_ENV === "production"
      ? "https://mycareeriq.reviveiqi.com"
      : "http://localhost:5173";

    if (error) {
      console.error("[LinkedIn OAuth] Error:", error);
      res.redirect(`${frontendUrl}/?auth_error=linkedin_denied`);
      return;
    }

    // Validate state
    const cookieHeader = req.headers.cookie || "";
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((c) => {
      const [k, ...v] = c.trim().split("=");
      if (k) cookies[k.trim()] = decodeURIComponent(v.join("="));
    });

    if (!state || cookies["linkedin_oauth_state"] !== state) {
      res.redirect(`${frontendUrl}/?auth_error=state_mismatch`);
      return;
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID!;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/linkedin/callback`;

    try {
      // Exchange code for access token
      const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error("[LinkedIn OAuth] Token exchange failed:", err);
        res.redirect(`${frontendUrl}/?auth_error=token_failed`);
        return;
      }

      const tokenData = await tokenRes.json() as any;
      const accessToken = tokenData.access_token;

      // Get user profile via OpenID Connect userinfo endpoint
      const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userRes.ok) {
        console.error("[LinkedIn OAuth] Profile fetch failed:", userRes.status);
        res.redirect(`${frontendUrl}/?auth_error=profile_failed`);
        return;
      }

      const profile = await userRes.json() as any;
      const email = profile.email;
      const name = profile.name || `${profile.given_name || ""} ${profile.family_name || ""}`.trim();

      if (!email) {
        res.redirect(`${frontendUrl}/?auth_error=no_email`);
        return;
      }

      // Find or create user
      let user = await db.getUserByEmail(email);
      if (!user) {
        user = await db.createUser({
          email,
          name: name || email.split("@")[0],
          passwordHash: crypto.randomBytes(32).toString("hex"), // random password — LinkedIn users login via OAuth
        });
        console.log(`[LinkedIn OAuth] Created new user: ${email}`);
      } else {
        console.log(`[LinkedIn OAuth] Existing user logged in: ${email}`);
      }

      // Create session token
      const token = await createSessionToken(user.id, user.email!, user.name!);
      const cookieOptions = getSessionCookieOptions(req);
      res.clearCookie("linkedin_oauth_state");
      res.cookie("reviveiq_session", token, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });

      // Store LinkedIn access token for profile API calls (expires in 60 days)
      // Save to users table via raw SQL
      try {
        const db2 = await import("../db");
        const dbConn = await db2.getDb();
        if (dbConn) {
          await (dbConn as any).execute(
            "UPDATE users SET linkedinAccessToken = ? WHERE id = ?",
            [accessToken, user.id]
          );
        }
      } catch (e) {
        // Non-critical — user can still log in without stored token
      }

      // Redirect to frontend with token in URL so client can store it
      res.redirect(`${frontendUrl}/?linkedin_token=${encodeURIComponent(token)}`);
    } catch (err) {
      console.error("[LinkedIn OAuth] Callback error:", err);
      res.redirect(`${frontendUrl}/?auth_error=server_error`);
    }
  });
}
