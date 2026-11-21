import { describe, expect, it } from "vitest";
import { hostMatches, isAllowedOriginHost, originHost, parseHostPatterns } from "@/lib/origin";

const APP = "https://fragfun-liart.vercel.app";
const EXTRA = "fragfun-carynyx1.vercel.app, fragfun-git-main-carynyx1.vercel.app, fragfun-*-carynyx1.vercel.app, fragfun-backend-production.up.railway.app";

describe("origin allow-list", () => {
  it("allows the main site and the team's own Vercel addresses", () => {
    for (const h of [
      "fragfun-liart.vercel.app",
      "fragfun-carynyx1.vercel.app",
      "fragfun-git-main-carynyx1.vercel.app",
      "fragfun-4yxz2khsq-carynyx1.vercel.app",
      "fragfun-backend-production.up.railway.app",
    ])
      expect(isAllowedOriginHost(h, APP, EXTRA), h).toBe(true);
  });

  it("blocks other sites, other teams and look-alikes", () => {
    for (const h of [
      "evil.example",
      "fragfun-liart.vercel.app.evil.example",
      "fragfun-x-attacker.vercel.app",
      "fragfun-a.b-carynyx1.vercel.app",
      "xfragfun-liart.vercel.app",
      "attacker.vercel.app",
    ])
      expect(isAllowedOriginHost(h, APP, EXTRA), h).toBe(false);
  });

  it("refuses catch-all patterns", () => {
    expect(parseHostPatterns("*, *.vercel.app, ok.example")).toEqual(["ok.example"]);
    expect(isAllowedOriginHost("anything.vercel.app", APP, "*.vercel.app")).toBe(false);
  });

  it("matches wildcards within one label only", () => {
    expect(hostMatches("fragfun-abc123-carynyx1.vercel.app", "fragfun-*-carynyx1.vercel.app")).toBe(true);
    expect(hostMatches("fragfun-abc.evil-carynyx1.vercel.app", "fragfun-*-carynyx1.vercel.app")).toBe(false);
  });

  it("parses Origin headers strictly", () => {
    expect(originHost("https://fragfun-liart.vercel.app")).toBe("fragfun-liart.vercel.app");
    expect(originHost("null")).toBeNull();
    expect(originHost("chrome-extension://abc")).toBeNull();
    expect(originHost(null)).toBeNull();
  });
});
