import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateFlow } from "./create-flow";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/empty-state";

export const metadata: Metadata = { title: "Launch a clip", description: "Upload a gaming clip and launch its token on Solana." };

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10">
      <PageHeader eyebrow="Create" title="Launch" muted="a clip." description="Upload a moment, give it a ticker, and launch it on Solana through Pump.fun — signed in your own wallet." className="pb-2" />
      <Suspense fallback={<Skeleton className="mt-8 h-96 rounded-2xl bg-white/[0.03]" />}>
        <CreateFlow />
      </Suspense>
    </div>
  );
}
