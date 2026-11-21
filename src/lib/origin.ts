/**
 * Which browser origins may make cookie-authenticated requests and sign in. Pure — unit tested.
 *
 * Allowed: the APP_URL host, plus explicitly configured hosts (ALLOWED_ORIGIN_HOSTS). A pattern may
 * contain "*" to match one DNS label fragment of [a-z0-9-], e.g. "fragfun-*-carynyx1.vercel.app"
 * (Vercel deployment URLs for one team). Never a bare "*.vercel.app": anyone can host there.
 */
export function parseHostPatterns(list: string): string[] {
  return list
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((p) => p !== "*" && !/^\*\./.test(p)); // refuse catch-all patterns
}

export function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  if (!pattern.includes("*")) return h === pattern;
  const re = new RegExp("^" + pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[a-z0-9-]+") + "$");
  return re.test(h);
}

export function isAllowedOriginHost(host: string, appUrl: string, extraPatterns: string): boolean {
  const appHost = new URL(appUrl).host.toLowerCase();
  if (host.toLowerCase() === appHost) return true;
  return parseHostPatterns(extraPatterns).some((p) => hostMatches(host, p));
}

/** Host of a well-formed http(s) Origin header, or null. "null" and other schemes are rejected. */
export function originHost(origin: string | null): string | null {
  if (!origin || origin === "null") return null;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.host;
  } catch {
    return null;
  }
}
