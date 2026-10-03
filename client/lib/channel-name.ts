// Splits quality markers out of a channel name so they can be shown as badges.
//
// Providers bake them into the name — "Sky Sports Golf FHD 5.1" — which makes
// every channel in a category look near-identical in a list. Pulling them out
// leaves a readable title and a couple of small badges.
//
// DELIBERATELY CONSERVATIVE: only tokens on this list are moved, and only from
// the END of the name, where providers put them. Anything unrecognised stays in
// the title untouched, so a channel with no markers simply shows no badges and
// nothing is ever mangled. Being wrong here would corrupt channel names across
// the whole app, so the rule is: if in doubt, leave it alone.
const TOKENS = [
  // resolution
  "SD", "HD", "FHD", "UHD", "4K", "8K", "HQ", "LQ",
  // audio
  "5.1", "7.1", "2.0", "DD", "DD+", "ATMOS", "AC3", "DTS",
  // codec / delivery
  "H264", "H265", "HEVC", "RAW", "BACKUP", "ALT",
];

const TOKEN_SET = new Set(TOKENS.map((t) => t.toUpperCase()));

export type ParsedChannelName = {
  /** The name with recognised trailing markers removed. Never empty. */
  title: string;
  /** Markers in the order they appeared, e.g. ["FHD", "5.1"]. */
  badges: string[];
};

export function parseChannelName(raw: string | null | undefined): ParsedChannelName {
  const name = (raw ?? "").trim();
  if (!name) return { title: "", badges: [] };

  const parts = name.split(/\s+/);
  const badges: string[] = [];

  // Walk backwards while the last word is a known marker.
  while (parts.length > 1) {
    const candidate = parts[parts.length - 1]
      .replace(/^[|(\[]+|[|)\]]+$/g, "")   // strip wrapping brackets/pipes
      .toUpperCase();
    if (!TOKEN_SET.has(candidate)) break;
    badges.unshift(candidate);
    parts.pop();
  }

  // Never strip everything: a channel literally called "HD" keeps its name.
  const title = parts.join(" ").trim();
  if (!title) return { title: name, badges: [] };

  return { title, badges };
}
