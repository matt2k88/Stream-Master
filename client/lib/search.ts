// Smart-search normaliser. Used by every content search (global, live,
// movies, series) so a query like "Ru Pauls Drag Race" matches a title
// like "RuPaul's Drag Race" — punctuation, apostrophes, accents, and
// extra whitespace are all stripped before comparing.
//
// Rules:
//  - lowercase
//  - strip diacritics (NFD then drop combining marks)
//  - replace any non-letter/non-digit run with a single space
//  - collapse whitespace and trim
//
// Both the haystack and the needle must be normalised the same way for
// includes() to work, so always call normaliseSearch() on both.
export function normaliseSearch(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
