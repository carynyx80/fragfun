import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** The supplied FF mark (white italic FF + two neon-green dots), on a transparent background. */
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <Link href="/" aria-label="Fragfun home" className={cn("flex items-center gap-2.5", className)}>
      <Image src="/brand/fragfun-mark.png" alt="Fragfun" width={44} height={21} priority className="h-[21px] w-auto" />
      {withWordmark && <span className="text-[17px] font-semibold tracking-tight">Fragfun</span>}
    </Link>
  );
}
