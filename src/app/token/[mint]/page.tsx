import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getPublicTokenMeta } from "@/lib/server-data";
import { TokenMarket } from "@/components/market/token-market";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata({ params }: PageProps<"/token/[mint]">): Promise<Metadata> {
  await connection();
  const { mint } = await params;
  const t = await getPublicTokenMeta(mint);
  if (!t) return { title: "Token" };
  return {
    title: `${t.name} ($${t.symbol})`,
    description: `${t.name} ($${t.symbol}) — a clip token launched on Fragfun.`,
    openGraph: { images: [{ url: t.imageUrl }] },
  };
}

async function TokenBody({ params }: { params: PageProps<"/token/[mint]">["params"] }) {
  await connection();
  const { mint } = await params;
  const t = await getPublicTokenMeta(mint);
  if (!t)
    return <EmptyState title="Token not found on Fragfun" body="Only tokens launched through Fragfun and verified on-chain have pages here." action={{ href: "/explore", label: "Explore clips" }} />;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/clip/${t.clipId}`} className="block rounded-2xl border border-ff-border bg-ff-card px-4 py-3 text-sm hover:bg-[#1a1a1a]">
        <span className="text-ff-muted">Source clip: </span>
        <span className="font-medium">{t.clipTitle}</span>
      </Link>
      <TokenMarket mint={mint} />
    </div>
  );
}

export default function TokenPage({ params }: PageProps<"/token/[mint]">) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6">
      <Suspense fallback={<Skeleton className="mx-auto h-[640px] max-w-2xl rounded-2xl bg-ff-card" />}>
        <TokenBody params={params} />
      </Suspense>
    </div>
  );
}
