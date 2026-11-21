import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface relative flex flex-col items-center justify-center overflow-hidden rounded-[28px] px-6 py-16 text-center", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(139,255,22,0.07),transparent_70%)]" />
      <div className="relative">
        {icon && <div className="mb-4 flex justify-center text-white/40">{icon}</div>}
        <p className="h-section text-2xl sm:text-3xl">{title}</p>
        {body && <p className="mx-auto mt-2 max-w-md text-[15px] text-white/55">{body}</p>}
        {action && (
          <Link href={action.href} className="btn-glow mt-7 inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold">
            {action.label} <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[24px] border border-ff-red/25 bg-ff-red/[0.04] px-6 py-10 text-center">
      <p className="text-sm text-ff-red">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-ghost mt-4 rounded-full px-4 py-1.5 text-sm">
          Try again
        </button>
      )}
    </div>
  );
}

export function SectionHeader({ title, href, subtitle }: { title: string; href?: string; subtitle?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="h-section text-2xl md:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-white/50">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-sm text-white/55 hover:text-white">
          View all
        </Link>
      )}
    </div>
  );
}

/** Big Framer-style page header used across inner pages. */
export function PageHeader({
  eyebrow,
  title,
  muted,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  muted?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("relative flex flex-wrap items-end justify-between gap-6 pb-8 pt-10 sm:pt-14", className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display mt-3 text-[clamp(2.6rem,6vw,4.6rem)]">
          {title}
          {muted && <span className="text-white/40"> {muted}</span>}
        </h1>
        {description && <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-white/55">{description}</p>}
      </div>
      {children}
    </header>
  );
}
