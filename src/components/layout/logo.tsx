import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** The supplied FF mark (white italic FF + two neon-green dots), on a transparent background. */
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <Link href="/" aria-label="Fragfun home" className={cn("group flex items-center gap-2.5", className)}>
      <Image src="/brand/fragfun-mark.png" alt="Fragfun" width={44} height={21} priority className="h-[19px] w-auto transition-transform duration-300 group-hover:-rotate-3" style={{ width: "auto" }} />
      {withWordmark && <span className="h-section hidden text-[19px] sm:inline">fragfun</span>}
    </Link>
  );
}
