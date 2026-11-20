"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Film, Coins, Rocket, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Film, label: "Your clip", sub: "MP4 · 0:24" },
  { icon: Coins, label: "Your token", sub: "$JUMP6" },
  { icon: Rocket, label: "Your market", sub: "Live on Solana" },
];

export function HomeHero() {
  return (
    <section className="grid items-center gap-10 py-12 md:py-20 lg:grid-cols-[1.15fr_1fr]">
      <div>
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-ff-border px-3 py-1 text-xs text-ff-muted">
          <span className="size-1.5 rounded-full bg-ff-green" /> Gaming-native launchpad on Solana
        </p>
        <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
          Your Clips.
          <br />
          Your Tokens.
          <br />
          <span className="text-ff-green">Your Market.</span>
        </h1>
        <p className="mt-5 max-w-md text-base text-ff-muted md:text-lg">Turn viral gaming moments into tradable tokens on Solana.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/create" className={cn(buttonVariants(), "h-11 rounded-full px-6 text-[15px] font-semibold")} data-testid="cta-launch">
            Launch a Clip
          </Link>
          <Link href="/explore" className={cn(buttonVariants({ variant: "outline" }), "h-11 rounded-full border-ff-border bg-transparent px-6 text-[15px]")}>
            Explore Clips
          </Link>
        </div>
      </div>

      {/* Clip → token → market, as a quiet animated strip */}
      <div className="relative rounded-3xl border border-ff-border bg-ff-bg2 p-5 md:p-6" aria-hidden>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex flex-1 items-center gap-3 sm:flex-col sm:items-start">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.2, duration: 0.4 }}
                className="flex w-full items-center gap-3 rounded-2xl border border-ff-border bg-ff-card p-4 sm:flex-col sm:items-start"
              >
                <span className={cn("flex size-10 items-center justify-center rounded-xl", i === 2 ? "bg-ff-green text-black" : "bg-[#1f1f1f]")}>
                  <s.icon className="size-5" />
                </span>
                <div>
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-ff-muted">{s.sub}</div>
                </div>
              </motion.div>
              {i < STEPS.length - 1 && <ArrowRight className="hidden size-4 shrink-0 self-center text-ff-muted sm:hidden" />}
            </div>
          ))}
        </div>
        <motion.div
          className="mt-4 h-1 rounded-full bg-ff-green/80"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 1.4, delay: 0.3, ease: "easeInOut" }}
        />
        <p className="mt-3 text-xs text-ff-muted">Every launched clip gets its own on-chain token and market page.</p>
      </div>
    </section>
  );
}
