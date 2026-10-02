import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isLifetimeRoute } from "../shared/lifetime-api";

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  sessionExpiresAt: number;
}

export interface LifetimeContext {
  db: SupabaseClient;
  username: string;
  userId: string;
  isAdmin: boolean;
}

class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const SESSION_AGE_MS = 30 * 24 * 60 * 60_000;
const TICKET_AAD = Buffer.from("ultracast-lifetime-session-v1");
const attempts = new Map<string, { count: number; until: number }>();
const refreshes = new Map<string, { until: number; result: Promise<StoredSession> }>();

function config() {
  const url = process.env.LIFETIME_SUPABASE_URL;
  const anonKey = process.env.LIFETIME_SUPABASE_ANON_KEY;
  const secret = process.env.SESSION_SECRET;
  if (!url || !anonKey || !secret) {
    throw new AuthError(503, "Lifetime authentication is not configured");
  }
  return {
    url: url.replace(/\/$/, ""),
    anonKey,
    key: createHash("sha256").update(`ultracast-lifetime:${secret}`).digest(),
  };
}

// The device holds only an authenticated, encrypted ticket, not Supabase tokens.
// The server can restore its session on any autoscale instance or after restart.
export function sealLifetimeSession(session: StoredSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config().key, iv);
  cipher.setAAD(TICKET_AAD);
  const payload = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return `uc1.${Buffer.concat([iv, cipher.getAuthTag(), payload]).toString("base64url")}`;
}

function readSession(req: Request): StoredSession {
  const header = req.get("authorization") ?? "";
  if (!header.startsWith("Bearer uc1.") || header.length > 16000) {
    throw new AuthError(401, "Sign in to access Lifetime features");
  }
  const { key } = config();
  try {
    const packed = Buffer.from(header.slice("Bearer uc1.".length), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, packed.subarray(0, 12));
    decipher.setAAD(TICKET_AAD);
    decipher.setAuthTag(packed.subarray(12, 28));
    const session = JSON.parse(Buffer.concat([
      decipher.update(packed.subarray(28)), decipher.final(),
    ]).toString("utf8")) as StoredSession;
    if (typeof session.accessToken !== "string" || !session.accessToken ||
        typeof session.refreshToken !== "string" || !session.refreshToken ||
        !Number.isFinite(session.expiresAt) || !Number.isFinite(session.sessionExpiresAt) ||
        session.sessionExpiresAt <= Date.now()) throw new Error("expired");
    return session;
  } catch {
    throw new AuthError(401, "Your Lifetime session has expired. Please sign in again.");
  }
}

function userClient(accessToken?: string): SupabaseClient {
  const { url, anonKey } = config();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  });
}

async function verifySession(session: StoredSession): Promise<LifetimeContext> {
  if (session.expiresAt <= Date.now()) throw new AuthError(401, "Refresh your Lifetime session");
  const db = userClient(session.accessToken);
  const { data, error } = await db.auth.getUser(session.accessToken);
  if (error) {
    const status = error.status ?? 503;
    throw new AuthError(status >= 500 || status === 0 ? 503 : 401,
      status >= 500 || status === 0 ? "Lifetime authentication is temporarily unavailable" : "Please sign in again");
  }
  const user = data.user;
  // getUser verifies the token. Match its claims to the current account metadata
  // too, so SQL RLS and the API cannot disagree after an admin identity change.
  let claims: any;
  try { claims = JSON.parse(Buffer.from(session.accessToken.split(".")[1], "base64url").toString("utf8")); }
  catch { throw new AuthError(401, "Invalid Lifetime access token"); }
  const username = claims?.app_metadata?.username;
  const role = claims?.app_metadata?.role;
  if (!user || typeof username !== "string" || !username || !["user", "admin"].includes(role)) {
    throw new AuthError(403, "This session has no verified TV account identity");
  }
  if (claims.sub !== user.id || username !== user.app_metadata.username || role !== user.app_metadata.role) {
    throw new AuthError(401, "Refresh your account identity");
  }
  return { db, username, userId: user.id, isAdmin: role === "admin" };
}

function fromAuthSession(session: any, sessionExpiresAt: number): StoredSession {
  let tokenExpiry: number | undefined;
  try {
    const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8"));
    if (typeof claims.exp === "number") tokenExpiry = claims.exp * 1000;
  } catch { /* verifySession below rejects malformed/unverified access tokens. */ }
  const expiresAt = typeof session?.expires_at === "number"
    ? session.expires_at * 1000
    : tokenExpiry ?? Date.now() + Number(session?.expires_in ?? 3600) * 1000;
  if (typeof session?.access_token !== "string" || !session.access_token ||
      typeof session?.refresh_token !== "string" || !session.refresh_token ||
      !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new AuthError(502, "Companion authentication returned an invalid session");
  }
  return { accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt, sessionExpiresAt };
}

function respondSession(res: Response, session: StoredSession, identity: LifetimeContext) {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ticket: sealLifetimeSession(session),
    expiresAt: session.expiresAt,
    sessionExpiresAt: session.sessionExpiresAt,
    username: identity.username,
  });
}

function fail(res: Response, error: unknown) {
  const known = error instanceof AuthError;
  res.status(known ? error.status : 503).json({
    error: known ? error.message : "Lifetime authentication is temporarily unavailable",
  });
}

export function getLifetimeContext(res: Response): LifetimeContext {
  const context = res.locals.lifetime as LifetimeContext | undefined;
  if (!context) throw new AuthError(401, "Lifetime authentication required");
  return context;
}

export function registerLifetimeAuth(app: Express) {
  app.post("/api/lifetime-auth/login", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || !username || username.length > 200 ||
        typeof password !== "string" || !password || password.length > 500) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const bucket = attempts.get(ip) ?? { count: 0, until: now + 5 * 60_000 };
    if (++bucket.count > 30) {
      res.setHeader("Retry-After", Math.ceil((bucket.until - now) / 1000));
      return res.status(429).json({ error: "Too many login attempts. Please try again shortly." });
    }
    attempts.set(ip, bucket);
    try {
      const { url, anonKey } = config();
      // Fixed configured endpoint: never use an app-supplied provider URL here.
      const response = await fetch(`${url}/functions/v1/companion-auth`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username, password }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        throw new AuthError(response.status === 401 || response.status === 403 ? 401 : 503,
          response.status === 401 || response.status === 403
            ? "The companion service could not verify your IPTV login"
            : "Companion authentication is temporarily unavailable");
      }
      const payload = await response.json();
      const session = fromAuthSession(payload.session, Date.now() + SESSION_AGE_MS);
      const identity = await verifySession(session);
      if (identity.username !== username) throw new AuthError(403, "Authenticated account does not match this login");
      respondSession(res, session, identity);
    } catch (error) { fail(res, error); }
  });

  app.post("/api/lifetime-auth/refresh", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const old = readSession(req);
      // Single-flight refresh + short reuse window prevents concurrent requests
      // on this instance from rotating the same refresh token independently.
      const key = createHash("sha256").update(old.refreshToken).digest("hex");
      for (const [id, item] of refreshes) if (item.until <= Date.now()) refreshes.delete(id);
      let entry = refreshes.get(key);
      if (!entry) {
        const result = (async () => {
          const { data, error } = await userClient().auth.refreshSession({ refresh_token: old.refreshToken });
          if (error || !data.session) {
            throw new AuthError(error && (error.status ?? 503) >= 500 ? 503 : 401,
              "Your Lifetime session could not be refreshed. Please sign in again.");
          }
          return fromAuthSession(data.session, old.sessionExpiresAt);
        })();
        entry = { until: Date.now() + 10000, result };
        refreshes.set(key, entry);
        void result.catch(() => refreshes.delete(key));
      }
      const session = await entry.result;
      const identity = await verifySession(session);
      respondSession(res, session, identity);
    } catch (error) { fail(res, error); }
  });

  app.post("/api/lifetime-auth/logout", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const session = readSession(req);
      const { url, anonKey } = config();
      const response = await fetch(`${url}/auth/v1/logout?scope=local`, {
        method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${session.accessToken}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok && response.status !== 401) throw new AuthError(503, "Session logout is temporarily unavailable");
      refreshes.delete(createHash("sha256").update(session.refreshToken).digest("hex"));
      res.json({ ok: true });
    } catch (error) { fail(res, error); }
  });

  app.use(async (req, res, next) => {
    if (!isLifetimeRoute(req.path)) return next();
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Authorization");
    try {
      const identity = await verifySession(readSession(req));
      // Reject conflicting legacy fields, but never use them as identity.
      for (const value of [req.query.username, req.body?.username, req.body?.user_username]) {
        if (value !== undefined && value !== identity.username) {
          throw new AuthError(403, "This request does not belong to the signed-in account");
        }
      }
      if (req.path.replace(/\/$/, "") === "/api/football/favourite-team/import" && !identity.isAdmin) {
        throw new AuthError(403, "An authenticated administrator is required");
      }
      res.locals.lifetime = identity;
      next();
    } catch (error) { fail(res, error); }
  });
}