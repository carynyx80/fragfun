/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/** Avatar with a deterministic generated fallback derived from the wallet address. */
export function Avatar({ wallet, url, size = 32, className }: { wallet: string; url?: string | null; size?: number; className?: string }) {
  if (url) {
    return <img src={url} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  let h = 0;
  for (let i = 0; i < wallet.length; i++) h = (h * 31 + wallet.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black/70", className)}
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 60) % 360} 70% 45%))` }}
    >
      {wallet.slice(0, 2)}
    </span>
  );
}
