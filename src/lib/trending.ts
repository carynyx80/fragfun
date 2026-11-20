/**
 * Transparent ranking formulas. Pure functions — unit tested and documented in ARCHITECTURE.md.
 */

export interface ClipSignals {
  views24h: number;
  likes24h: number;
  shares24h: number;
  warVotes24h: number;
  volume24hUsd: number | null; // verified market data only; null when unavailable
  ageHours: number;
}

/**
 * Clip trending score =
 *   (views24h + 4·likes24h + 3·shares24h + 2·warVotes24h + 10·ln(1 + volume24hUsd))
 *   / (ageHours + 2)^1.3
 * Views/likes are deduplicated per visitor before they reach this function.
 */
export function clipTrendingScore(s: ClipSignals): number {
  const engagement = s.views24h + 4 * s.likes24h + 3 * s.shares24h + 2 * s.warVotes24h;
  const market = s.volume24hUsd && s.volume24hUsd > 0 ? 10 * Math.log1p(s.volume24hUsd) : 0;
  return (engagement + market) / Math.pow(Math.max(0, s.ageHours) + 2, 1.3);
}

export interface TokenSignals {
  volume24hUsd: number | null;
  fragfunTraders24h: number;
  ageHours: number;
}

/** Token score = ln(1 + volume24hUsd) · (1 + 0.1·uniqueFragfunTraders24h) / (ageHours/24 + 1)^0.5 */
export function tokenTrendingScore(s: TokenSignals): number {
  if (!s.volume24hUsd || s.volume24hUsd <= 0) return 0;
  return (Math.log1p(s.volume24hUsd) * (1 + 0.1 * s.fragfunTraders24h)) / Math.sqrt(Math.max(0, s.ageHours) / 24 + 1);
}

export interface CreatorSignals {
  publishedClips: number;
  confirmedLaunches: number;
  totalViews: number;
  totalLikes: number;
}

/** Creator score = 5·confirmedLaunches + 2·publishedClips + ln(1+views)·3 + ln(1+likes)·5 */
export function creatorScore(s: CreatorSignals): number {
  return 5 * s.confirmedLaunches + 2 * s.publishedClips + 3 * Math.log1p(s.totalViews) + 5 * Math.log1p(s.totalLikes);
}
