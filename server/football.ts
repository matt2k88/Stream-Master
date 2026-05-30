import { supabase } from "./supabase";

// api-football (direct, not RapidAPI). Authenticated with x-apisports-key.
const API_BASE = "https://v3.football.api-sports.io";

// How long a finished game lingers in the cache (still shown to clients) before
// it is purged.
const FT_LINGER_MS = 15 * 60 * 1000;

// Poll cadence. When at least one game is live we poll frequently; when nothing
// is live (or on error) we back off to save API quota.
const ACTIVE_INTERVAL_MS = 60 * 1000;
const IDLE_INTERVAL_MS = 5 * 60 * 1000;

interface FixtureRow {
  fixture_id: number;
  league_id: number;
  league_name: string | null;
  league_country: string | null;
  home_team: string | null;
  away_team: string | null;
  home_goals: number;
  away_goals: number;
  status_short: string | null;
  elapsed: number | null;
  finished_at: string | null;
  updated_at: string;
}

// Reads the admin global kill-switch. Defaults to enabled (true) when the table
// is missing (migration 013 not yet run) so the feature stays on. When disabled
// the poller skips the api-football request entirely to save quota.
async function isGloballyEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("football_global")
      .select("enabled")
      .eq("id", 1)
      .maybeSingle();
    if (error) return true;
    return data?.enabled !== false;
  } catch {
    return true;
  }
}

// Returns the list of live fixtures, or null if the request failed (so callers
// can skip the "mark vanished as finished" step and avoid false positives).
async function fetchLive(): Promise<any[] | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`${API_BASE}/fixtures?live=all`, {
      headers: { "x-apisports-key": key },
    });
    if (!r.ok) {
      console.error(`[football] live fetch failed: ${r.status}`);
      return null;
    }
    const json = await r.json();
    if (Array.isArray(json?.errors) && json.errors.length) {
      console.error("[football] api errors:", JSON.stringify(json.errors));
    }
    return Array.isArray(json?.response) ? json.response : [];
  } catch (e: any) {
    console.error("[football] live fetch exception:", e?.message);
    return null;
  }
}

function mapFixture(f: any, nowIso: string): FixtureRow {
  return {
    fixture_id: f?.fixture?.id,
    league_id: f?.league?.id,
    league_name: f?.league?.name ?? null,
    league_country: f?.league?.country ?? null,
    home_team: f?.teams?.home?.name ?? null,
    away_team: f?.teams?.away?.name ?? null,
    home_goals: f?.goals?.home ?? 0,
    away_goals: f?.goals?.away ?? 0,
    status_short: f?.fixture?.status?.short ?? null,
    elapsed: f?.fixture?.status?.elapsed ?? null,
    finished_at: null,
    updated_at: nowIso,
  };
}

interface GoalScorer {
  player: string | null;
  team: string | null;
  minute: number | null;
}

// Fetch the most-recent goal's scorer for a single fixture. Only called when a
// fixture's score went up this cycle — at most one request per scoring fixture
// per poll (not per poll for all games) — so it stays cheap on API quota.
async function fetchGoalScorer(fixtureId: number): Promise<GoalScorer | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`${API_BASE}/fixtures/events?fixture=${fixtureId}`, {
      headers: { "x-apisports-key": key },
    });
    if (!r.ok) {
      console.error(`[football] events fetch failed: ${r.status}`);
      return null;
    }
    const json = await r.json();
    const events = Array.isArray(json?.response) ? json.response : [];
    const goals = events.filter(
      (e: any) => String(e?.type || "").toLowerCase() === "goal",
    );
    if (!goals.length) return null;
    const last = goals[goals.length - 1];
    return {
      player: last?.player?.name ?? null,
      team: last?.team?.name ?? null,
      minute: last?.time?.elapsed ?? null,
    };
  } catch (e: any) {
    console.error("[football] events exception:", e?.message);
    return null;
  }
}

// One poll cycle. Returns the number of live fixtures found (used to decide the
// next interval). Returns 0 on error/no-key so the poller backs off.
async function pollOnce(): Promise<number> {
  // Admin global kill-switch off → skip the API call entirely (saves quota).
  if (!(await isGloballyEnabled())) return 0;

  const live = await fetchLive();
  if (live === null) return 0; // error/disabled — skip this cycle, back off

  const nowIso = new Date().toISOString();
  const rows = live
    .map((f) => mapFixture(f, nowIso))
    .filter((r) => r.fixture_id != null && r.league_id != null);
  const liveIds = new Set(rows.map((r) => r.fixture_id));

  // Snapshot the existing rows first — used both to detect goals (total score
  // increased) and to mark vanished games as finished.
  const { data: existing, error: exErr } = await supabase
    .from("football_scores")
    .select("fixture_id, home_goals, away_goals, finished_at");
  if (exErr) console.error("[football] select existing error:", exErr.message);

  const prevTotals = new Map<number, number>();
  for (const e of existing ?? []) {
    prevTotals.set(e.fixture_id, (e.home_goals ?? 0) + (e.away_goals ?? 0));
  }
  // A fixture whose total score went up since we last saw it = a fresh goal.
  const goalFixtures = rows.filter((r) => {
    const prev = prevTotals.get(r.fixture_id);
    return prev != null && r.home_goals + r.away_goals > prev;
  });

  if (rows.length) {
    const { error } = await supabase
      .from("football_scores")
      .upsert(rows, { onConflict: "fixture_id" });
    if (error) console.error("[football] upsert error:", error.message);
  }

  // For each fresh goal, look up the scorer once and store it. Kept as a
  // separate best-effort update so a not-yet-run migration (012) never blocks
  // the core score cache.
  for (const g of goalFixtures) {
    let scorer: GoalScorer | null = null;
    try {
      scorer = await fetchGoalScorer(g.fixture_id);
    } catch (e: any) {
      console.error("[football] scorer fetch error:", e?.message);
    }
    const { error } = await supabase
      .from("football_scores")
      .update({
        last_goal_player: scorer?.player ?? null,
        last_goal_team: scorer?.team ?? null,
        last_goal_minute: scorer?.minute ?? null,
        last_goal_at: nowIso,
      })
      .eq("fixture_id", g.fixture_id);
    if (error)
      console.error(
        "[football] goal update error (has migration 012 been run?):",
        error.message,
      );
  }

  // Games that were live but are no longer in the feed: mark them finished so
  // clients can show FT for a short while, then purge older finished rows.
  const vanished = (existing ?? []).filter(
    (e: any) => e.finished_at == null && !liveIds.has(e.fixture_id),
  );
  for (const v of vanished) {
    const { error } = await supabase
      .from("football_scores")
      .update({ status_short: "FT", elapsed: null, finished_at: nowIso, updated_at: nowIso })
      .eq("fixture_id", v.fixture_id);
    if (error) console.error("[football] finish update error:", error.message);
  }

  const cutoff = new Date(Date.now() - FT_LINGER_MS).toISOString();
  const { error: purgeErr } = await supabase
    .from("football_scores")
    .delete()
    .lt("finished_at", cutoff);
  if (purgeErr) console.error("[football] purge error:", purgeErr.message);

  return rows.length;
}

let started = false;

export function startFootballPoller() {
  if (started) return;
  started = true;
  if (!process.env.API_FOOTBALL_KEY) {
    console.log("[football] API_FOOTBALL_KEY not set — live scores poller disabled");
    return;
  }
  const loop = async () => {
    let liveCount = 0;
    try {
      liveCount = await pollOnce();
    } catch (e: any) {
      console.error("[football] poll cycle error:", e?.message);
    }
    const next = liveCount > 0 ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
    setTimeout(loop, next);
  };
  loop();
  console.log("[football] live scores poller started");
}
