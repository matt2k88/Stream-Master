// Smart-search normaliser. Used by every content search (global, live,
// movies, series). Strips EVERYTHING that isn't a letter or digit —
// including spaces — so the query and the title collapse down to the
// same alphanumeric run before comparing. This makes search robust to
// apostrophes, hyphens, accents, dots, brackets, AND missing/extra
// whitespace.
//
// Examples (query → title both normalise to the same compact string):
//   "Ru Pauls Drag Race"   → "rupaulsdragrace"  matches  "RuPaul's Drag Race"
//   "spiderman"            → "spiderman"        matches  "Spider-Man"
//   "its always sunny"     → "itsalwayssunny"   matches  "It's Always Sunny"
//   "cafe"                 → "cafe"             matches  "Café"
//
// Both the haystack and the needle must be normalised the same way for
// includes() to work, so always call normaliseSearch() on both.
export function normaliseSearch(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
