import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("intro gate starts closed, notifies once on completion, and closes on replay", async () => {
  const state = { notifications: 0, unsubscribe: () => {} };
  (globalThis as any).__introGateFixture = state;
  try {
    const bundle = await build({
      entryPoints: ["client/lib/intro-gate.ts"], bundle: true, write: false,
      platform: "node", format: "esm",
      plugins: [{
        name: "external-store-hook-fixture",
        setup(builder) {
          builder.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `export function useSyncExternalStore(subscribe, snapshot, serverSnapshot) {
              const fixture = globalThis.__introGateFixture;
              fixture.unsubscribe();
              fixture.unsubscribe = subscribe(() => { fixture.notifications++; });
              if (snapshot() !== serverSnapshot()) throw new Error("Mismatched snapshots");
              return snapshot();
            }`,
          }));
        },
      }],
    });
    const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
    assert.equal(api.useIntroDone(), false);
    api.markIntroDone();
    assert.equal(state.notifications, 1);
    assert.equal(api.useIntroDone(), true);
    api.markIntroDone();
    assert.equal(state.notifications, 1, "completion is idempotent");
    api.resetIntroGate();
    assert.equal(api.useIntroDone(), false);
    assert.equal(state.notifications, 2);
    api.resetIntroGate();
    assert.equal(state.notifications, 2, "replay reset is idempotent");
    api.markIntroDone();
    assert.equal(api.useIntroDone(), true);
    assert.equal(state.notifications, 3);
    state.unsubscribe();
    api.resetIntroGate();
    assert.equal(state.notifications, 3, "unmounted consumers stop receiving events");
  } finally {
    state.unsubscribe();
    delete (globalThis as any).__introGateFixture;
  }
});