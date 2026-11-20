import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
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
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-ff-border px-6 py-14 text-center", className)}>
      {icon && <div className="mb-3 text-ff-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm text-ff-muted">{body}</p>}
      {action && (
        <Link href={action.href} className={cn(buttonVariants(), "mt-5 h-9 rounded-full px-4 font-semibold")}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-ff-red/30 bg-ff-red/5 px-6 py-10 text-center">
      <p className="text-sm text-ff-red">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 text-sm text-white underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  );
}

export function SectionHeader({ title, href, subtitle }: { title: string; href?: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight md:text-xl">{title}</h2>
        {subtitle && <p className="text-sm text-ff-muted">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-sm text-ff-muted hover:text-white">
          View all
        </Link>
      )}
    </div>
  );
}
