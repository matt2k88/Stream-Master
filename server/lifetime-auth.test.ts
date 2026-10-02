import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { registerLifetimeAuth, getLifetimeContext, sealLifetimeSession } from "./lifetime-auth";
import { isLifetimeRoute } from "../shared/lifetime-api";

// All identities, keys and sessions in this file are synthetic fixtures.
process.env.LIFETIME_SUPABASE_URL = "https://lifetime-test.invalid";
process.env.LIFETIME_SUPABASE_ANON_KEY = "synthetic-anon-fixture";
process.env.SESSION_SECRET = "synthetic-ticket-encryption-fixture-for-tests";

const realFetch = global.fetch;
let server: Server;
let base: string;
let refreshCount = 0;
const dbRequests: Array<{ token: string; path: string }> = [];
const identities = new Map<string, { id: string; username: string; role: string }>();

function token(username: string, role = "user") {
  const id = `${username}-fixture-id`;
  const payload = Buffer.from(JSON.stringify({
    sub: id, exp: Math.floor(Date.now() / 1000) + 3600,
    app_metadata: { username, role },
  })).toString("base64url");
  const result = `synthetic.${payload}.fixture`;
  identities.set(result, { id, username, role });
  return result;
}

function ticket(username: string, role = "user", expiresAt = Date.now() + 3600_000) {
  return sealLifetimeSession({
    accessToken: token(username, role), refreshToken: `refresh-${username}`,
    expiresAt, sessionExpiresAt: Date.now() + 86400_000,
  });
}

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

before(async () => {
  global.fetch = (async (input: any, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? input.toString());
    if (url.hostname !== "lifetime-test.invalid") return realFetch(input, init);
    const headers = new Headers(init?.headers ?? input.headers);
    if (url.pathname === "/functions/v1/companion-auth") {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.action, "login");
      assert.equal(headers.get("apikey"), "synthetic-anon-fixture");
      if (body.password !== "synthetic-valid-password") return reply({ error: "Invalid credentials" }, 401);
      return reply({ session: { access_token: token(body.username), refresh_token: `refresh-${body.username}` } });
    }
    if (url.pathname === "/auth/v1/user") {
      const identity = identities.get((headers.get("authorization") ?? "").replace("Bearer ", ""));
      return identity
        ? reply({ id: identity.id, app_metadata: { username: identity.username, role: identity.role } })
        : reply({ msg: "Invalid token" }, 401);
    }
    if (url.pathname === "/auth/v1/token") {
      assert.equal(url.searchParams.get("grant_type"), "refresh_token");
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(body), ["refresh_token"]);
      refreshCount++;
      const username = body.refresh_token.replace(/^refresh-/, "");
      return reply({
        access_token: token(username), refresh_token: `refresh-next-${username}`,
        token_type: "bearer", expires_in: 3600,
        user: { id: `${username}-fixture-id`, app_metadata: { username, role: "user" } },
      });
    }
    if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    if (url.pathname.startsWith("/rest/v1/")) {
      const bearer = (headers.get("authorization") ?? "").replace("Bearer ", "");
      const identity = identities.get(bearer);
      assert.ok(identity, "Database access must carry the customer's access token");
      assert.equal(headers.get("apikey"), "synthetic-anon-fixture");
      dbRequests.push({ token: bearer, path: url.pathname });
      return reply([{ id: `${identity.username}-own-row` }]);
    }
    throw new Error(`Unexpected mocked path ${url.pathname}`);
  }) as typeof fetch;
  const app = express();
  app.use(express.json());
  registerLifetimeAuth(app);
  app.get("/api/watchlist", async (_req, res) => {
    const context = getLifetimeContext(res);
    const { data, error } = await context.db.from("watchlist").select("id").eq("user_username", context.username);
    assert.equal(error, null);
    res.json({ username: context.username, rows: data });
  });
  app.post("/api/football/favourite-team/import", (_req, res) => res.json({ isAdmin: getLifetimeContext(res).isAdmin }));
  app.use((_req, res) => res.json({ public: true }));
  server = await new Promise<Server>(resolve => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  global.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("every Lifetime route rejects username-only anonymous access", async () => {
  const routes = [
    ["GET", "/api/lifetime-check"], ["GET", "/api/vpn/status"], ["POST", "/api/vpn/toggle"],
    ["GET", "/api/content-requests"], ["GET", "/api/watchlist"], ["POST", "/api/watchlist"],
    ["PATCH", "/api/watchlist/example"], ["DELETE", "/api/watchlist/example"],
    ["POST", "/api/profiles/example/reset"], ["POST", "/api/football/favourite-team/import"],
    ["GET", "/api/ultra-four/competitions"], ["GET", "/api/ultra-four/predictions"],
    ["POST", "/api/ultra-four/predictions"], ["GET", "/api/referrals"],
    ["POST", "/api/referrals/generate"], ["GET", "/api/referrals/history"], ["GET", "/api/top-picks"],
  ];
  for (const [method, path] of routes) {
    assert.ok(isLifetimeRoute(path));
    const response = await realFetch(`${base}${path}?username=customer-a`, { method });
    assert.equal(response.status, 401, `${method} ${path}`);
  }
  assert.equal((await realFetch(`${base}/api/server`)).status, 200);
});

test("login verifies with companion-auth and returns only an encrypted ticket", async () => {
  const response = await realFetch(`${base}/api/lifetime-auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "customer-a", password: "synthetic-valid-password" }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.username, "customer-a");
  assert.ok(data.ticket.startsWith("uc1."));
  assert.equal(data.access_token, undefined);
  assert.equal(data.refresh_token, undefined);
  assert.ok(!data.ticket.includes("refresh-customer-a"));
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("wrong credentials fail instead of falling back to anonymous access", async () => {
  const response = await realFetch(`${base}/api/lifetime-auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "customer-a", password: "incorrect-synthetic-password" }),
  });
  assert.equal(response.status, 401);
});

test("concurrent customers use isolated request-scoped database sessions", async () => {
  const results = await Promise.all(["customer-a", "customer-b"].map(async username => {
    const response = await realFetch(`${base}/api/watchlist`, { headers: { Authorization: `Bearer ${ticket(username)}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    return response.json();
  }));
  assert.deepEqual(results.map(result => result.rows[0].id), ["customer-a-own-row", "customer-b-own-row"]);
  assert.equal(dbRequests.length, 2);
  assert.notEqual(dbRequests[0].token, dbRequests[1].token);
});

test("spoofed usernames and modified encrypted tickets are rejected", async () => {
  const ownTicket = ticket("customer-a");
  const spoof = await realFetch(`${base}/api/watchlist?username=customer-b`, { headers: { Authorization: `Bearer ${ownTicket}` } });
  assert.equal(spoof.status, 403);
  const packed = Buffer.from(ownTicket.slice(4), "base64url");
  packed[30] ^= 1;
  const tampered = `uc1.${packed.toString("base64url")}`;
  assert.equal((await realFetch(`${base}/api/watchlist`, { headers: { Authorization: `Bearer ${tampered}` } })).status, 401);
});

test("expired access can refresh without another Xtream password", async () => {
  const expired = ticket("customer-refresh", "user", Date.now() - 1000);
  assert.equal((await realFetch(`${base}/api/watchlist`, { headers: { Authorization: `Bearer ${expired}` } })).status, 401);
  const renew = () => realFetch(`${base}/api/lifetime-auth/refresh`, { method: "POST", headers: { Authorization: `Bearer ${expired}` } });
  const responses = await Promise.all([renew(), renew()]);
  for (const response of responses) {
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.username, "customer-refresh");
    assert.ok(data.expiresAt > Date.now());
  }
  assert.equal(refreshCount, 1);
});

test("bulk favourite-team import requires a verified admin session", async () => {
  const run = (role: string) => realFetch(`${base}/api/football/favourite-team/import`, {
    method: "POST", headers: { Authorization: `Bearer ${ticket(`customer-${role}`, role)}`, "x-import-secret": "not-authority" },
  });
  assert.equal((await run("user")).status, 403);
  assert.equal((await run("admin")).status, 200);
});

test("logout invokes Supabase session revocation", async () => {
  assert.equal((await realFetch(`${base}/api/lifetime-auth/logout`, {
    method: "POST", headers: { Authorization: `Bearer ${ticket("customer-logout")}` },
  })).status, 200);
});

test("no shared anonymous Lifetime client remains in the app", () => {
  assert.ok(!readFileSync("server/supabase.ts", "utf8").includes("export const lifetimeDb"));
  const routes = readFileSync("server/routes.ts", "utf8");
  assert.ok(!/import\s*\{[^}]*lifetimeDb/.test(routes));
  assert.ok(routes.includes('eq("user_username", username)'));
  assert.ok(routes.includes('eq("account_username", username)'));
});