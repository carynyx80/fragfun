"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check, Fingerprint, UploadCloud } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";

/** Illustrations only — no real or fake market data is shown here. */

function UploadArt() {
  const reduce = useReducedMotion();
  return (
    <div className="surface relative mt-6 rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-white/[0.06]">
          <UploadCloud className="size-5 text-white/70" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between text-[13px]">
            <span className="truncate">highway-jump.mp4</span>
            <span className="font-mono text-white/40">0:24</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-ff-green"
              initial={{ width: "8%" }}
              animate={reduce ? { width: "100%" } : { width: ["8%", "100%", "100%"] }}
              transition={{ duration: 3.2, repeat: reduce ? 0 : Infinity, times: [0, 0.75, 1], ease: "easeInOut" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TokenArt() {
  return (
    <div className="surface mt-6 flex items-center gap-3 rounded-2xl p-4">
      <div className="size-12 rounded-xl bg-[conic-gradient(from_200deg,#8bff16,#1a1a1a_40%,#8bff16)] p-[2px]">
        <div className="size-full rounded-[10px] bg-[#0d0d0d]" />
      </div>
      <div>
        <div className="flex items-baseline gap-2">
          <span className="h-section text-xl">Highway Jump</span>
        </div>
        <span className="font-mono text-sm text-ff-green">$JUMP</span>
      </div>
      <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/40">example</span>
    </div>
  );
}

function SignArt() {
  const reduce = useReducedMotion();
  return (
    <div className="surface mt-6 rounded-2xl p-4">
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-white/60">Approve in your wallet</span>
        <motion.span
          className="flex size-9 items-center justify-center rounded-full bg-ff-green/10 text-ff-green"
          animate={reduce ? undefined : { boxShadow: ["0 0 0 0 rgba(139,255,22,0.35)", "0 0 0 12px rgba(139,255,22,0)"] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          <Fingerprint className="size-4" />
        </motion.span>
      </div>
      <div className="mt-3 space-y-1.5 font-mono text-[11px] text-white/45">
        {["Pump.fun · create_v2", "Your wallet = creator", "No Fragfun fee"].map((l) => (
          <div key={l} className="flex items-center gap-2">
            <Check className="size-3 text-ff-green" /> {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartArt() {
  const reduce = useReducedMotion();
  const d = "M0 92 C 40 88, 60 70, 95 74 S 150 40, 190 48 S 250 18, 300 26 S 360 8, 420 4";
  return (
    <div className="surface relative mt-6 overflow-hidden rounded-2xl p-4">
      <svg viewBox="0 0 420 100" className="h-28 w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="ff-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8bff16" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#8bff16" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" x2="420" y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />
        ))}
        <motion.path d={`${d} L420 100 L0 100 Z`} fill="url(#ff-area)" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.8, duration: 1 }} />
        <motion.path
          d={d}
          fill="none"
          stroke="#8bff16"
          strokeWidth="2"
          initial={reduce ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="mt-2 flex gap-2 text-[11px]">
        <span className="rounded-full bg-ff-green px-2.5 py-1 font-semibold text-black">Buy</span>
        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-white/60">Sell</span>
        <span className="ml-auto self-center font-mono text-white/35">illustration</span>
      </div>
    </div>
  );
}

const CARDS = [
  { n: "01", t: "Drop the clip", d: "MP4, MOV or WebM. Processed for instant playback, thumbnail pulled from the best frame.", art: <UploadArt />, span: "lg:col-span-7" },
  { n: "02", t: "Name the moment", d: "Pick a name, a ticker and an image — or let the assistant pitch a few. You always have the final say.", art: <TokenArt />, span: "lg:col-span-5" },
  { n: "03", t: "One signature", d: "Your wallet signs the Pump.fun launch. Keys never leave it. We show the exact cost before you approve.", art: <SignArt />, span: "lg:col-span-5" },
  { n: "04", t: "It's a market now", d: "Every clip gets its own page with a live chart, real on-chain data and a trade panel next to the video.", art: <ChartArt />, span: "lg:col-span-7" },
];

export function HowBento() {
  return (
    <section id="how">
      <Reveal>
        <p className="eyebrow">How it works</p>
        <h2 className="h-section mt-3 max-w-2xl text-4xl sm:text-5xl">
          Four moves. <span className="text-white/40">One signature.</span>
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-4 lg:grid-cols-12">
        {CARDS.map((c, i) => (
          <Reveal key={c.n} delay={i * 0.08} className={c.span}>
            <article className="surface group h-full rounded-[28px] p-6 transition-colors duration-300 hover:border-white/15 sm:p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-white/35">{c.n}</span>
              </div>
              <h3 className="h-section mt-4 text-2xl sm:text-[28px]">{c.t}</h3>
              <p className="mt-2 max-w-md text-[15px] leading-relaxed text-white/55">{c.d}</p>
              {c.art}
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
