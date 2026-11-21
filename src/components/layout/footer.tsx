import Link from "next/link";
import Image from "next/image";

const COLS = [
  {
    title: "Product",
    links: [
      ["Explore", "/explore"],
      ["Launch a clip", "/create"],
      ["Leaderboard", "/leaderboard"],
      ["Clip Wars", "/wars"],
      ["Activity", "/activity"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
      ["Copyright takedown", "/terms#takedown"],
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="relative mt-32 overflow-hidden pb-28 lg:pb-10">
      <div className="hairline mx-auto max-w-[1240px]" />
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 pt-14 md:grid-cols-[1.4fr_1fr_1fr] lg:px-6">
        <div className="space-y-5">
          <Image src="/brand/fragfun-mark.png" alt="Fragfun" width={66} height={32} className="h-8 w-auto" style={{ width: "auto" }} />
          <p className="max-w-xs text-[15px] leading-relaxed text-white/60">
            Turn the moments everyone rewinds into markets anyone can trade. Built on Solana, launched through Pump.fun.
          </p>
          <p className="max-w-sm text-xs leading-relaxed text-white/35">
            Independent project — not affiliated with Rockstar Games, Take-Two Interactive or Pump.fun. Meme tokens are volatile and can go
            to zero. Nothing here is financial advice.
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title} className="space-y-3">
            <p className="eyebrow">{c.title}</p>
            <ul className="space-y-2.5 text-[15px]">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-white/70 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div aria-hidden className="pointer-events-none mx-auto mt-16 max-w-[1400px] select-none px-2">
        <p className="display wordmark-outline text-center text-[22vw] leading-[0.8] lg:text-[17rem]">fragfun</p>
      </div>
      <div className="mx-auto mt-6 flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 text-xs text-white/35 lg:px-6">
        <span>© 2026 Fragfun</span>
        <span className="font-mono uppercase tracking-[0.16em]">Clip it · Tokenize it · Trade it</span>
      </div>
    </footer>
  );
}
