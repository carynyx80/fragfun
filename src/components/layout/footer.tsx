import Link from "next/link";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-ff-border pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 md:grid-cols-[1.5fr_1fr_1fr] lg:px-6">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-sm text-ff-muted">Clip it. Tokenize it. Trade it.</p>
          <p className="max-w-md text-xs leading-relaxed text-ff-muted">
            Fragfun is an independent platform. It is not affiliated with, endorsed by, or sponsored by Rockstar Games, Take-Two
            Interactive, or Pump.fun. Meme tokens are highly volatile and can lose all value. Nothing here is financial advice.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Platform</span>
          <Link className="text-ff-muted hover:text-white" href="/explore">Explore</Link>
          <Link className="text-ff-muted hover:text-white" href="/create">Launch a clip</Link>
          <Link className="text-ff-muted hover:text-white" href="/leaderboard">Leaderboard</Link>
          <Link className="text-ff-muted hover:text-white" href="/wars">Clip Wars</Link>
          <Link className="text-ff-muted hover:text-white" href="/activity">Activity</Link>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Legal</span>
          <Link className="text-ff-muted hover:text-white" href="/terms">Terms of service</Link>
          <Link className="text-ff-muted hover:text-white" href="/privacy">Privacy policy</Link>
          <Link className="text-ff-muted hover:text-white" href="/terms#takedown">Copyright takedown</Link>
        </div>
      </div>
    </footer>
  );
}
