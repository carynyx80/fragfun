"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { UserRound, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

/** After first sign-in, invite creators without a username to set up their profile. Dismissible. */
export function ProfileNudge() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("ff:profile-nudge") !== null;
    } catch {
      return false;
    }
  });
  const show = Boolean(user && !user.username && !dismissed && pathname !== "/settings");
  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem("ff:profile-nudge", "dismissed");
    } catch {
      /* ignore */
    }
  };
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-3 bottom-24 z-50 rounded-[22px] border border-white/10 bg-[#0d0d0d] p-4 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[360px] lg:bottom-6"
          role="dialog"
          aria-label="Set up your profile"
          data-testid="profile-nudge"
        >
          <button type="button" onClick={close} aria-label="Dismiss" className="absolute right-3 top-3 text-white/40 hover:text-white">
            <X className="size-4" />
          </button>
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ff-green/15 text-ff-green">
              <UserRound className="size-5" />
            </span>
            <div className="pr-4">
              <p className="font-medium">Set up your profile</p>
              <p className="mt-0.5 text-sm text-white/55">Add a picture and a username so people know whose clips they&apos;re watching.</p>
              <Link href="/settings" onClick={close} className="btn-glow mt-3 inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold">
                Set up profile
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
