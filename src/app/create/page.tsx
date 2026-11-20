import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateFlow } from "./create-flow";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Launch a clip", description: "Upload a gaming clip and launch its token on Solana." };

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Launch a clip</h1>
      <p className="mt-1 text-ff-muted">Upload a moment, create its token, launch it on Solana through Pump.fun.</p>
      <Suspense fallback={<Skeleton className="mt-8 h-96 rounded-2xl bg-ff-card" />}>
        <CreateFlow />
      </Suspense>
    </div>
  );
}
