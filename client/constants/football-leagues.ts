// Curated api-football league / competition ids the user can track.
// Grouped for the settings picker. League names returned by the API are used
// for display in the tracker; these names are only for the picker UI.

export interface FootballLeague {
  id: number;
  name: string;
}

export interface FootballLeagueGroup {
  group: string;
  leagues: FootballLeague[];
}

export const FOOTBALL_LEAGUE_GROUPS: FootballLeagueGroup[] = [
  {
    group: "English Football",
    leagues: [
      { id: 39, name: "Premier League" },
      { id: 40, name: "Championship" },
      { id: 41, name: "League One" },
      { id: 42, name: "League Two" },
      { id: 43, name: "National League" },
    ],
  },
  {
    group: "English Cups",
    leagues: [
      { id: 45, name: "FA Cup" },
      { id: 48, name: "EFL Cup (Carabao)" },
      { id: 528, name: "Community Shield" },
    ],
  },
  {
    group: "European Competitions",
    leagues: [
      { id: 2, name: "Champions League" },
      { id: 3, name: "Europa League" },
      { id: 848, name: "Europa Conference League" },
      { id: 531, name: "UEFA Super Cup" },
    ],
  },
  {
    group: "Top European Leagues",
    leagues: [
      { id: 140, name: "La Liga (Spain)" },
      { id: 135, name: "Serie A (Italy)" },
      { id: 78, name: "Bundesliga (Germany)" },
      { id: 61, name: "Ligue 1 (France)" },
      { id: 88, name: "Eredivisie (Netherlands)" },
      { id: 94, name: "Primeira Liga (Portugal)" },
      { id: 179, name: "Scottish Premiership" },
    ],
  },
  {
    group: "Other Domestic Cups",
    leagues: [
      { id: 143, name: "Copa del Rey (Spain)" },
      { id: 137, name: "Coppa Italia (Italy)" },
      { id: 81, name: "DFB Pokal (Germany)" },
      { id: 66, name: "Coupe de France" },
    ],
  },
  {
    group: "International",
    leagues: [
      { id: 1, name: "World Cup" },
      { id: 4, name: "Euro Championship" },
      { id: 5, name: "UEFA Nations League" },
      { id: 15, name: "FIFA Club World Cup" },
      { id: 253, name: "MLS (USA)" },
      { id: 71, name: "Brazil Série A" },
    ],
  },
];

const ID_TO_NAME: Record<number, string> = {};
for (const g of FOOTBALL_LEAGUE_GROUPS) {
  for (const l of g.leagues) ID_TO_NAME[l.id] = l.name;
}

export function leagueName(id: number | null | undefined): string | null {
  if (id == null) return null;
  return ID_TO_NAME[id] ?? null;
}

// Flat, English-first ordered list of the curated league ids. Used by the
// Football Centre to order league groups (English football & cups first, then
// European, top leagues, domestic cups, international).
export const CURATED_LEAGUE_IDS: number[] = FOOTBALL_LEAGUE_GROUPS.flatMap((g) =>
  g.leagues.map((l) => l.id),
);

const RANK: Record<number, number> = {};
CURATED_LEAGUE_IDS.forEach((id, i) => {
  RANK[id] = i;
});

// Lower rank = higher in the list. Non-curated leagues sort to the bottom.
export function leagueRank(id: number | null | undefined): number {
  if (id == null) return Number.MAX_SAFE_INTEGER;
  return RANK[id] ?? Number.MAX_SAFE_INTEGER - 1;
}
