/** Shapes shared between server read models and client components. */

export interface CreatorRef {
  wallet: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PlaybackSource {
  type: "hls" | "file";
  src: string;
  mime?: string;
}

export interface ClipCardData {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  viewCount: number;
  likeCount: number;
  publishedAt: string | null;
  durationSeconds: number | null;
  category: { slug: string; name: string } | null;
  playback: PlaybackSource | null;
  creator: CreatorRef;
  token: {
    mint: string;
    symbol: string;
    name: string;
    imageUrl: string;
    status: string;
    confirmedAt: string | null;
  } | null;
  market: {
    marketCapUsd: number | null;
    marketCapSol: number | null;
    volume24hUsd: number | null;
    lifecycle: string | null;
    capturedAt: string;
  } | null;
  trendingScore?: number;
}

export interface MarketData {
  mint: string;
  lifecycle: "bonding_curve" | "migrated" | "unknown";
  priceSol: number | null;
  priceUsd: number | null;
  marketCapSol: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  curveProgress: number | null;
  solUsd: number | null;
  pool: string | null;
  sources: string[];
  capturedAt: string;
  stale: boolean;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketTrade {
  signature: string;
  side: "buy" | "sell";
  wallet: string | null;
  tokenAmount: number | null;
  solAmount: number | null;
  usdValue: number | null;
  timestamp: string;
  source: "geckoterminal" | "fragfun";
}
