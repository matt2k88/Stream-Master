import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

let bundled: string;
let moduleNumber = 0;
const realFetch = global.fetch;

before(async () => {
  const result = await build({
    entryPoints: ["client/lib/lifetime-session.ts"], bundle: true, write: false,
    platform: "node", format: "esm",
    plugins: [{
      name: "synthetic-session-storage",
      setup(builder) {
        builder.onResolve({ filter: /^(react-native|expo-secure-store|@react-native-async-storage\/async-storage|\.\/api-url)$/ },
          args => ({ path: args.path, namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => {
          if (args.path === "react-native") return { contents: "export const Platform = { OS: globalThis.__sessionFixture.platform };" };
          if (args.path === "./api-url") return { contents: 'export function getApiUrl() { return "https://api.fixture.invalid"; }' };
          const store = `const storage = globalThis.__sessionFixture.storage;
            const getItem = async key => storage.get(key) ?? null;
            const setItem = async (key, value) => { storage.set(key, value); };
            const removeItem = async key => { storage.delete(key); };`;
          return { contents: store + (args.path === "expo-secure-store"
            ? "export {getItem as getItemAsync, setItem as setItemAsync, removeItem as deleteItemAsync};"
            : "export default {getItem, setItem, removeItem};") };
        });
      },
    }],
  });
  bundled = Buffer.from(result.outputFiles[0].text).toString("base64");
});

after(() => {
  global.fetch = realFetch;
  delete (globalThis as any).__sessionFixture;
});

async function fixture(platform = "web") {
  const state = {
    platform, storage: new Map<string, string>(), loginCount: 0, refreshCount: 0,
    username: "", expireSoon: false, rejectRefresh: false, rejectApi: false,
    protectedCalls: [] as Array<{ authorization: string | null; url: string }>,
    apiGate: null as Promise<void> | null,
  };
  (globalThis as any).__sessionFixture = state;
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
  const session = () => ({
    ticket: `uc1.${state.username}-${state.refreshCount}-${"x".repeat(5000)}`,
    username: state.username,
    expiresAt: Date.now() + (state.expireSoon ? 10000 : 3600000),
    sessionExpiresAt: Date.now() + 86400000,
  });
  global.fetch = (async (input: any, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/lifetime-auth/login") {
      state.loginCount++;
      state.username = JSON.parse(String(init.body)).username;
      return response(session());
    }
    if (url.pathname === "/api/lifetime-auth/refresh") {
      state.refreshCount++;
      if (state.rejectRefresh) return response({ error: "Sign in again" }, 401);
      await new Promise(resolve => setImmediate(resolve));
      state.expireSoon = false;
      return response(session());
    }
    if (url.pathname === "/api/lifetime-auth/logout") return response({ ok: true });
    state.protectedCalls.push({ authorization: new Headers(init.headers).get("Authorization"), url: url.toString() });
    if (state.apiGate) await state.apiGate;
    return response({ items: [] }, state.rejectApi ? 401 : 200);
  }) as typeof fetch;
  const load = () => import(`data:text/javascript;base64,${bundled}#fixture-${++moduleNumber}`);
  return { state, load, api: await load() };
}

test("native tickets are securely chunked and restored without another password login", async () => {
  const { state, api, load } = await fixture("android");
  await api.loginLifetime("native-customer", "dummy-only");
  assert.ok(state.storage.size > 2);
  assert.ok([...state.storage.values()].every(value => value.length <= 1800));
  const restored = await load();
  await restored.restoreLifetime("native-customer", "dummy-only");
  await restored.lifetimeApiFetch("/api/watchlist");
  assert.equal(state.loginCount, 1);
  assert.ok(state.protectedCalls[0].authorization?.startsWith("Bearer uc1."));
  await restored.logoutLifetime();
  assert.equal(state.storage.size, 0);
});

test("parallel requests share one proactive refresh", async () => {
  const { state, api } = await fixture();
  state.expireSoon = true;
  await api.loginLifetime("refresh-customer", "dummy-only");
  await Promise.all([api.lifetimeApiFetch("/api/watchlist"), api.lifetimeApiFetch("/api/vpn/status")]);
  assert.equal(state.refreshCount, 1);
  assert.equal(state.protectedCalls.length, 2);
  assert.equal(state.protectedCalls[0].authorization, state.protectedCalls[1].authorization);
});

test("logout/account switch cancels an old account request instead of retrying as the new one", async () => {
  const { state, api } = await fixture();
  await api.loginLifetime("old-customer", "dummy-only");
  let release: () => void = () => {};
  state.apiGate = new Promise<void>(resolve => { release = resolve; });
  const pending = api.lifetimeApiFetch("/api/watchlist", { method: "POST", body: JSON.stringify({ content_id: "example" }) });
  const rejected = assert.rejects(pending, /account changed/);
  while (state.protectedCalls.length === 0) await new Promise(resolve => setImmediate(resolve));
  await api.logoutLifetime();
  await api.loginLifetime("new-customer", "dummy-only");
  release();
  await rejected;
  assert.equal(state.protectedCalls.length, 1);
});

test("a revoked session clears storage and notifies the app to show sign-in", async () => {
  const { state, api } = await fixture();
  await api.loginLifetime("revoked-customer", "dummy-only");
  let notified = false;
  api.onLifetimeSessionInvalidated(() => { notified = true; });
  state.rejectApi = true;
  state.rejectRefresh = true;
  await assert.rejects(api.lifetimeApiFetch("/api/watchlist"), /Sign in again/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notified, true);
  assert.equal(state.storage.size, 0);
});

test("tickets are never sent to another host or unprotected routes", async () => {
  const { state, api } = await fixture();
  await api.loginLifetime("isolated-customer", "dummy-only");
  await api.lifetimeApiFetch("https://outside.fixture.invalid/api/watchlist");
  await api.lifetimeApiFetch("https://api.fixture.invalid/api/servers");
  assert.ok(state.protectedCalls.every(call => call.authorization === null));
});