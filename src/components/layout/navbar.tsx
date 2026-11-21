"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Compass, Flame, Home, Plus, Search, Swords, Trophy, Activity } from "lucide-react";
import { Logo } from "./logo";
import { WalletButton } from "./wallet-button";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { publicEnv } from "@/lib/public-env";

const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/create", label: "Create" },
  { href: "/explore?sort=trending", label: "Trending" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/wars", label: "Clip Wars", wide: true },
];

function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const t = q.trim();
        if (t.length >= 2) router.push(`/explore?q=${encodeURIComponent(t)}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ff-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={64}
        placeholder="Search clips, tokens, creators"
        aria-label="Search"
        className="h-9 w-full rounded-full border border-white/[0.07] bg-white/[0.04] pl-9 pr-3 text-[13px] outline-none transition-colors placeholder:text-white/40 focus:border-white/20 focus:bg-white/[0.06]"
      />
    </form>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api<{ items: Array<{ id: string; title: string; body: string | null; href: string | null; read_at: string | null; created_at: string }>; unread: number }>(
        "/api/notifications",
      ),
    refetchInterval: 30_000,
  });
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && data?.unread) void api("/api/notifications", { method: "POST", json: { markAllRead: true } }).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
      }}
    >
      <DropdownMenuTrigger aria-label="Notifications" className="relative flex size-9 items-center justify-center rounded-full hover:bg-white/[0.03]">
        <Bell className="size-[18px]" />
        {!!data?.unread && <span className="absolute right-2 top-2 size-2 rounded-full bg-ff-green" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        {!data?.items.length && <p className="px-2 py-6 text-center text-sm text-ff-muted">Nothing yet.</p>}
        {data?.items.map((n) => (
          <DropdownMenuItem key={n.id} onClick={() => n.href && router.push(n.href)} className="flex flex-col items-start gap-0.5 py-2">
            <span className="text-sm font-medium">{n.title}</span>
            {n.body && <span className="line-clamp-2 text-xs text-ff-muted">{n.body}</span>}
            <span className="text-[11px] text-ff-muted">{timeAgo(n.created_at)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isActive = (href: string) => !href.includes("?") && (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <>
      {publicEnv.network === "devnet" && (
        <div className="py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ff-muted">
          Devnet — test tokens, no real value
        </div>
      )}
      {/* Floating glass bar */}
      <header className="sticky top-0 z-40 px-3 pt-3 lg:px-6">
        <div className="glass mx-auto flex h-14 max-w-[1240px] items-center gap-3 rounded-full pl-4 pr-2 sm:pl-5">
          <Logo />
          <nav className="ml-3 hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.label}
                href={n.href}
                className={cn(
                  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13.5px] text-white/60 transition-colors hover:text-white",
                  isActive(n.href) && "bg-white/[0.07] text-white",
                  n.wide && "hidden xl:inline-flex",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <SearchBox className="ml-auto hidden w-full max-w-[240px] md:block" />
          <div className="ml-auto flex items-center gap-1 md:ml-1">
            <Link href="/explore" aria-label="Search" className="flex size-9 items-center justify-center rounded-full text-white/70 hover:bg-white/5 md:hidden">
              <Search className="size-[18px]" />
            </Link>
            {user && <Notifications />}
            <WalletButton compact />
          </div>
        </div>
      </header>
    </>
  );
}

/** Bottom tab bar on phones. */
export function MobileNav() {
  const pathname = usePathname();
  const tabs = [
    { href: "/", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/create", label: "Launch", icon: Plus, primary: true },
    { href: "/leaderboard", label: "Ranks", icon: Trophy },
    { href: "/activity", label: "Activity", icon: Activity },
  ];
  return (
    <nav aria-label="Mobile" className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="glass grid grid-cols-5 rounded-full px-1">
        {tabs.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[10px]">
              {t.primary ? (
                <span className="btn-glow flex size-10 items-center justify-center rounded-full">
                  <Icon className="size-5" />
                </span>
              ) : (
                <>
                  <Icon className={cn("size-5", active ? "text-white" : "text-ff-muted")} />
                  <span className={active ? "text-white" : "text-ff-muted"}>{t.label}</span>
                </>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export { Flame, Swords };
