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

// Shared by every search screen; catalogue objects are replaced on re-sync.
// Weak keys let cached titles disappear when their catalogue is released.
const normalisedNames = new WeakMap<object, string>();
type NamedItem = { name?: string | null };

export function normalisedName(item: NamedItem): string {
  const cached = normalisedNames.get(item);
  if (cached !== undefined) return cached;
  const name = normaliseSearch(item.name ?? "");
  normalisedNames.set(item, name);
  return name;
}

// Walk lists directly rather than spreading a huge catalogue into an array:
// spreading large lists can exceed Hermes' argument limit on TV devices.
export function warmSearchIndex(lists: NamedItem[][]): void {
  if (!lists.some(list => list.length)) return;
  let listIndex = 0;
  let itemIndex = 0;
  const CHUNK = 2000;
  const step = () => {
    let processed = 0;
    while (listIndex < lists.length && processed < CHUNK) {
      const list = lists[listIndex];
      if (itemIndex >= list.length) {
        listIndex++;
        itemIndex = 0;
        continue;
      }
      normalisedName(list[itemIndex++]);
      processed++;
    }
    if (listIndex < lists.length) setTimeout(step, 0);
  };
  setTimeout(step, 0);
}
