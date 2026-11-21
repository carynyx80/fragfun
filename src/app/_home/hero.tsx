"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { ArrowUpRight, Play } from "lucide-react";
import { api } from "@/lib/client";
import type { ClipCardData } from "@/lib/types";
import { WordsReveal } from "@/components/motion/reveal";
import { creatorName } from "@/lib/format";
import { publicEnv } from "@/lib/public-env";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Three tilted phone frames showing the newest real clips; abstract frames when there are none yet. */
function ClipStack() {
  const reduce = useReducedMotion();
  const { data } = useQuery({
    queryKey: ["clips", "new", "hero"],
    queryFn: () => api<{ items: ClipCardData[] }>("/api/clips?sort=new&limit=3"),
  });
  const clips = data?.items ?? [];
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), { stiffness: 120, damping: 18 });

  const frames = [
    { rot: -9, left: "24%", y: 34, z: 1, delay: 0.35 },
    { rot: 0, left: "50%", y: 0, z: 3, delay: 0.2 },
    { rot: 9, left: "76%", y: 34, z: 2, delay: 0.5 },
  ];
  const labels = ["Crazy Stunts", "GTA 6", "Speedruns"];

  return (
    <div
      className="relative mx-auto h-[420px] w-full max-w-[560px] [perspective:1200px] sm:h-[480px]"
      onMouseMove={(e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        {frames.map((f, i) => {
          const clip = clips[i];
          return (
            <motion.div
              key={i}
              className="absolute top-4 w-[44%] max-w-[230px] -translate-x-1/2"
              style={{ zIndex: f.z, left: f.left }}
              initial={reduce ? false : { opacity: 0, y: 60, rotate: 0 }}
              animate={{ opacity: 1, y: f.y, rotate: f.rot }}
              transition={{ duration: 1, delay: f.delay, ease: EASE }}
            >
              <Link
                href={clip ? `/clip/${clip.id}` : "/create"}
                className="group relative block aspect-[9/16] overflow-hidden rounded-[28px] border border-white/10 bg-[#0c0c0c] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] transition-transform duration-500 hover:-translate-y-2"
              >
                {clip?.thumbnailUrl ? (
                  <img src={clip.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#1b1b1b,#070707)]">
                    <div className="absolute inset-x-6 top-1/3 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                    <div className="absolute inset-x-6 top-1/2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                )}
                <div className="absolute inset-x-0 top-0 flex justify-between p-3">
                  <span className="rounded-full bg-black/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/80 backdrop-blur">
                    {clip?.category?.name ?? labels[i]}
                  </span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex size-11 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                    <Play className="size-4 fill-white" />
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-3 pt-12">
                  {clip ? (
                    <>
                      <p className="line-clamp-2 text-[13px] font-medium leading-snug">{clip.title}</p>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-white/60">
                        <span className="truncate">{creatorName(clip.creator)}</span>
                        {clip.token && <span className="font-mono text-ff-green">${clip.token.symbol}</span>}
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px] font-medium text-white/70">{i === 1 ? "Your clip here" : " "}</p>
                  )}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

export function HomeHero() {
  return (
    <section className="relative pt-14 sm:pt-20">
      <div aria-hidden className="hero-backdrop pointer-events-none absolute inset-x-0 -top-24 h-[720px]" />
      <div className="relative grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="glass inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[12.5px] text-white/75"
          >
            <span className="rounded-full bg-ff-green px-2 py-0.5 text-[11px] font-semibold text-black">{publicEnv.network === "devnet" ? "DEVNET" : "LIVE"}</span>
            {publicEnv.network === "devnet" ? "Solana devnet" : "Solana mainnet"} · launches through Pump.fun
          </motion.div>
          <h1 className="display mt-7 text-[clamp(3rem,8.4vw,6.4rem)] lg:text-[clamp(3rem,6.2vw,6.4rem)]">
            <WordsReveal text="Your Clips." className="block" />
            <WordsReveal text="Your Tokens." className="block text-white/45" delay={0.15} />
            <span className="block whitespace-nowrap">
              <WordsReveal text="Your Market" className="text-ff-green" delay={0.3} />
              <motion.span
                className="ml-[0.06em] inline-flex gap-[0.08em] align-baseline"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.75, type: "spring", stiffness: 300, damping: 14 }}
                aria-hidden
              >
                <span className="inline-block size-[0.16em] rounded-full bg-ff-green" />
                <span className="inline-block size-[0.16em] rounded-full bg-ff-green" />
              </motion.span>
            </span>
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55, ease: EASE }}
            className="mt-7 max-w-[30rem]"
          >
            <span className="block text-[19px] font-medium leading-snug text-white sm:text-xl">Turn viral gaming moments into tradable tokens on Solana.</span>
            <span className="mt-2 block text-[15.5px] leading-relaxed text-white/50">
              That play everyone keeps rewinding? Upload it, give it a ticker, launch it in one wallet signature — then let the internet trade it.
            </span>
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7, ease: EASE }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link href="/create" className="btn-glow inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold" data-testid="cta-launch">
              Launch a Clip <ArrowUpRight className="size-4" />
            </Link>
            <Link href="/explore" className="btn-ghost inline-flex h-12 items-center rounded-full px-6 text-[15px]">
              Explore Clips
            </Link>
          </motion.div>
          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.95 }}
            className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-white/[0.07] pt-6"
          >
            {[
              ["0%", "Fragfun fee"],
              ["1", "signature to launch"],
              ["100%", "self-custody"],
            ].map(([v, k]) => (
              <div key={k}>
                <dt className="h-section text-2xl sm:text-3xl">{v}</dt>
                <dd className="mt-1 text-xs text-white/45">{k}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
        <ClipStack />
      </div>
    </section>
  );
}
