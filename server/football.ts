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

// The set of league ids that are actually selected in user profiles
// (football_prefs). We only track/store these leagues so we never spend quota
// on games nobody is watching. A single `live=all` request already returns all
// live games in ONE call, so we filter that response down to this set rather
// than making a separate request per league.
async function selectedLeagueIds(): Promise<Set<number>> {
  const ids = new Set<number>();
  const { data, error } = await supabase
    .from("football_prefs")
    .select("league_id, enabled");
  if (error) {
    console.error("[football] prefs read error:", error.message);
    return ids;
  }
  for (const r of data ?? []) {
    if ((r as any).enabled !== false && (r as any).league_id != null) {
      ids.add(Number((r as any).league_id));
    }
  }
  return ids;
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

// One poll cycle. Returns the number of live fixtures found (used to decide the
// next interval). Returns 0 on error/no-key so the poller backs off.
async function pollOnce(): Promise<number> {
  // Only the leagues users actually track. If nobody has a league selected we
  // don't spend any API quota at all this cycle.
  const leagueIds = await selectedLeagueIds();
  if (leagueIds.size === 0) {
    return 0; // no tracked leagues — skip the api-football call entirely
  }

  const live = await fetchLive();
  if (live === null) return 0; // error/disabled — skip this cycle, back off

  const nowIso = new Date().toISOString();
  const rows = live
    .map((f) => mapFixture(f, nowIso))
    .filter(
      (r) =>
        r.fixture_id != null &&
        r.league_id != null &&
        leagueIds.has(r.league_id),
    );
  const liveIds = new Set(rows.map((r) => r.fixture_id));

  if (rows.length) {
    const { error } = await supabase
      .from("football_scores")
      .upsert(rows, { onConflict: "fixture_id" });
    if (error) console.error("[football] upsert error:", error.message);
  }

  // Games that were live but are no longer in the feed: mark them finished so
  // clients can show FT for a short while, then purge older finished rows.
  const { data: existing, error: exErr } = await supabase
    .from("football_scores")
    .select("fixture_id, finished_at");
  if (exErr) {
    console.error("[football] select existing error:", exErr.message);
    return rows.length;
  }
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
