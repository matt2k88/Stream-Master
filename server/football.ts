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

// Upcoming fixtures: how many days ahead to fetch and how often to refresh.
// One /fixtures?date= request per day = ~7 requests every 24h, filtered to the
// curated leagues below.
const FIXTURES_DAYS_AHEAD = 7;
const FIXTURES_REFRESH_MS = 24 * 60 * 60 * 1000;

// Curated api-football league/competition ids the Football Centre is scoped to.
// Mirrors client/constants/football-leagues.ts (English football & cups first).
export const CURATED_LEAGUE_IDS = [
  39, 40, 41, 42, 43, // English football
  45, 48, 528, // English cups
  2, 3, 848, 531, // European competitions
  140, 135, 78, 61, 88, 94, 179, // top European leagues
  143, 137, 81, 66, // other domestic cups
  1, 4, 5, 15, 253, 71, // international
  245, // Ykkönen (Finland)
];
const CURATED_SET = new Set(CURATED_LEAGUE_IDS);

interface FixtureRow {
  fixture_id: number;
  league_id: number;
  league_name: string | null;
  league_country: string | null;
  home_team: string | null;
  away_team: string | null;
  home_logo: string | null;
  away_logo: string | null;
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
    home_logo: f?.teams?.home?.logo ?? null,
    away_logo: f?.teams?.away?.logo ?? null,
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

// ── On-demand single-fixture detail (stats / lineups / events) ──────────────
// Fetched only when a user opens a live game in the Football Centre, so it's
// cheap on quota. Three api-football calls per open, cached briefly so quick
// re-opens / the 30s screen poll don't re-hit the API.
export interface FixtureDetail {
  statistics: {
    team_name: string | null;
    team_logo: string | null;
    items: { type: string; value: string | number | null }[];
  }[];
  lineups: {
    team_name: string | null;
    team_logo: string | null;
    formation: string | null;
    coach: string | null;
    startXI: { name: string; number: number | null; pos: string | null }[];
    substitutes: { name: string; number: number | null; pos: string | null }[];
  }[];
  events: {
    minute: string;
    team_name: string | null;
    player: string | null;
    assist: string | null;
    type: string | null;
    detail: string | null;
  }[];
}

const DETAIL_TTL_MS = 20 * 1000;
const detailCache = new Map<number, { at: number; data: FixtureDetail }>();

async function apiGet(path: string): Promise<any[] | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      headers: { "x-apisports-key": key },
    });
    if (!r.ok) {
      console.error(`[football] ${path} failed: ${r.status}`);
      return null;
    }
    const json = await r.json();
    return Array.isArray(json?.response) ? json.response : [];
  } catch (e: any) {
    console.error(`[football] ${path} exception:`, e?.message);
    return null;
  }
}

function mapPlayers(arr: any[]): { name: string; number: number | null; pos: string | null }[] {
  return (Array.isArray(arr) ? arr : []).map((p: any) => ({
    name: p?.player?.name ?? "—",
    number: p?.player?.number ?? null,
    pos: p?.player?.pos ?? null,
  }));
}

// Returns combined detail for one fixture, or null when disabled / no key.
export async function fetchFixtureDetail(
  fixtureId: number,
): Promise<FixtureDetail | null> {
  if (!(await isGloballyEnabled())) return null;
  if (!process.env.API_FOOTBALL_KEY) return null;

  const cached = detailCache.get(fixtureId);
  if (cached && Date.now() - cached.at < DETAIL_TTL_MS) return cached.data;

  const [statsRaw, lineupsRaw, eventsRaw] = await Promise.all([
    apiGet(`/fixtures/statistics?fixture=${fixtureId}`),
    apiGet(`/fixtures/lineups?fixture=${fixtureId}`),
    apiGet(`/fixtures/events?fixture=${fixtureId}`),
  ]);

  const statistics = (statsRaw ?? []).map((s: any) => ({
    team_name: s?.team?.name ?? null,
    team_logo: s?.team?.logo ?? null,
    items: (Array.isArray(s?.statistics) ? s.statistics : []).map((it: any) => ({
      type: String(it?.type ?? ""),
      value: it?.value ?? null,
    })),
  }));

  const lineups = (lineupsRaw ?? []).map((l: any) => ({
    team_name: l?.team?.name ?? null,
    team_logo: l?.team?.logo ?? null,
    formation: l?.formation ?? null,
    coach: l?.coach?.name ?? null,
    startXI: mapPlayers(l?.startXI),
    substitutes: mapPlayers(l?.substitutes),
  }));

  const events = (eventsRaw ?? []).map((e: any) => {
    const elapsed = e?.time?.elapsed;
    const extra = e?.time?.extra;
    const minute =
      elapsed != null ? `${elapsed}${extra ? `+${extra}` : ""}'` : "";
    return {
      minute,
      team_name: e?.team?.name ?? null,
      player: e?.player?.name ?? null,
      assist: e?.assist?.name ?? null,
      type: e?.type ?? null,
      detail: e?.detail ?? null,
    };
  });

  const data: FixtureDetail = { statistics, lineups, events };
  const now = Date.now();
  // Drop expired entries so the cache can't grow unbounded over a long run.
  for (const [id, v] of detailCache) {
    if (now - v.at >= DETAIL_TTL_MS) detailCache.delete(id);
  }
  detailCache.set(fixtureId, { at: now, data });
  return data;
}

// ── Upcoming fixtures ───────────────────────────────────────────────────────
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

interface UpcomingRow {
  fixture_id: number;
  league_id: number;
  league_name: string | null;
  league_country: string | null;
  home_team: string | null;
  away_team: string | null;
  home_logo: string | null;
  away_logo: string | null;
  kickoff: string | null;
  date_key: string;
  status_short: string | null;
  updated_at: string;
}

// Fetch fixtures for a single date (one api-football request), filtered to the
// curated leagues. Returns [] on error so a bad day doesn't abort the rest.
async function fetchFixturesForDate(date: string): Promise<any[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return [];
  try {
    const r = await fetch(`${API_BASE}/fixtures?date=${date}`, {
      headers: { "x-apisports-key": key },
    });
    if (!r.ok) {
      console.error(`[football] fixtures fetch failed (${date}): ${r.status}`);
      return [];
    }
    const json = await r.json();
    if (Array.isArray(json?.errors) && json.errors.length) {
      console.error("[football] fixtures api errors:", JSON.stringify(json.errors));
    }
    return Array.isArray(json?.response) ? json.response : [];
  } catch (e: any) {
    console.error(`[football] fixtures exception (${date}):`, e?.message);
    return [];
  }
}

// Once-per-day: pull the next FIXTURES_DAYS_AHEAD days of fixtures for the
// curated leagues into the football_fixtures cache, then purge past days.
// Guarded by the global kill-switch and a 24h timestamp. Degrades gracefully
// when the table is missing (migration 015 not yet run).
async function refreshUpcomingFixtures(): Promise<void> {
  if (!(await isGloballyEnabled())) return;

  const nowIso = new Date().toISOString();
  const rows: UpcomingRow[] = [];
  for (let i = 0; i < FIXTURES_DAYS_AHEAD; i++) {
    const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const dk = dateKey(d);
    const fixtures = await fetchFixturesForDate(dk);
    for (const f of fixtures) {
      const leagueId = f?.league?.id;
      if (leagueId == null || !CURATED_SET.has(leagueId)) continue;
      const fixtureId = f?.fixture?.id;
      if (fixtureId == null) continue;
      const ts = f?.fixture?.timestamp;
      rows.push({
        fixture_id: fixtureId,
        league_id: leagueId,
        league_name: f?.league?.name ?? null,
        league_country: f?.league?.country ?? null,
        home_team: f?.teams?.home?.name ?? null,
        away_team: f?.teams?.away?.name ?? null,
        home_logo: f?.teams?.home?.logo ?? null,
        away_logo: f?.teams?.away?.logo ?? null,
        kickoff: ts ? new Date(ts * 1000).toISOString() : null,
        date_key: dk,
        status_short: f?.fixture?.status?.short ?? null,
        updated_at: nowIso,
      });
    }
  }

  if (rows.length) {
    const { error } = await supabase
      .from("football_fixtures")
      .upsert(rows, { onConflict: "fixture_id" });
    if (error) {
      console.error(
        "[football] fixtures upsert error (has migration 015 been run?):",
        error.message,
      );
      return; // table likely missing — skip the purge too
    }
  }

  // Purge fixtures whose day has already passed.
  const today = dateKey(new Date());
  const { error: purgeErr } = await supabase
    .from("football_fixtures")
    .delete()
    .lt("date_key", today);
  if (purgeErr) console.error("[football] fixtures purge error:", purgeErr.message);

  console.log(`[football] upcoming fixtures refreshed: ${rows.length} curated fixtures`);
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
    if (error) {
      // The logo columns may not exist yet (migration 017 not run). Retry the
      // upsert without them so the core score cache still updates.
      console.warn(
        "[football] score upsert with logos failed, retrying without (has migration 017 been run?):",
        error.message,
      );
      const stripped = rows.map(({ home_logo, away_logo, ...rest }) => rest);
      const retry = await supabase
        .from("football_scores")
        .upsert(stripped, { onConflict: "fixture_id" });
      if (retry.error)
        console.error("[football] upsert error:", retry.error.message);
    }
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
let lastFixturesFetch = 0;

// Refresh upcoming fixtures at most once per FIXTURES_REFRESH_MS. Called on each
// poll cycle but cheaply short-circuits until a day has elapsed.
async function maybeRefreshFixtures() {
  if (Date.now() - lastFixturesFetch < FIXTURES_REFRESH_MS) return;
  lastFixturesFetch = Date.now();
  try {
    await refreshUpcomingFixtures();
  } catch (e: any) {
    console.error("[football] fixtures refresh error:", e?.message);
    // Allow a retry sooner if it failed outright.
    lastFixturesFetch = 0;
  }
}

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
    // Once-per-day upcoming fixtures refresh (own internal 24h guard).
    await maybeRefreshFixtures();
    const next = liveCount > 0 ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
    setTimeout(loop, next);
  };
  loop();
  console.log("[football] live scores poller started");
}
