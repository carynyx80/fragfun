import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 px-4 py-10 text-sm leading-relaxed text-ff-muted [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white">
      <h1 className="text-3xl font-bold tracking-tight text-white">Privacy policy</h1>
      <p>Draft — must be reviewed by qualified counsel before public launch. Last updated 20 November 2026.</p>
      <h2>What we collect</h2>
      <p>
        Your public wallet address; profile details you choose to add; clips, images and token details you upload; likes, votes and reports; and
        transactions you make through Fragfun (which are public on Solana).
      </p>
      <h2>What we do not collect</h2>
      <p>We never ask for or store seed phrases, private keys or recovery phrases. We do not store raw IP addresses for view counting — we use a salted, daily-rotating hash.</p>
      <h2>Service providers</h2>
      <p>
        Database and storage (Supabase), video processing (Mux), IPFS pinning (Pinata), Solana RPC providers, market data (GeckoTerminal, CoinGecko) and, if you use it,
        the optional AI assistant (Anthropic). Each receives only what is needed to provide its function.
      </p>
      <h2>Cookies</h2>
      <p>One essential, HTTP-only session cookie after you sign in with your wallet. No advertising cookies.</p>
      <h2>Your choices</h2>
      <p>You can edit your profile, delete clips that have no token, and disconnect at any time. On-chain data cannot be erased by anyone.</p>
    </article>
  );
}
