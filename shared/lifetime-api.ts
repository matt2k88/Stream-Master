/** Paths whose database access must use a verified Lifetime customer session. */
export function isLifetimeRoute(path: string): boolean {
  return /^\/api\/(?:lifetime-check|vpn\/(?:status|toggle)|content-requests|watchlist(?:\/[^/]+)?|profiles\/[^/]+\/reset|football\/favourite-team\/import|ultra-four\/(?:competitions|predictions)|referrals(?:\/(?:generate|history))?|top-picks)\/?$/.test(path);
}