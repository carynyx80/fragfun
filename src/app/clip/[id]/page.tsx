import { connection } from "next/server";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getPublicClipMeta } from "@/lib/server-data";
import { ClipView } from "./clip-view";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata({ params }: PageProps<"/clip/[id]">): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const clip = await getPublicClipMeta(id);
  if (!clip) return { title: "Clip" };
  const title = clip.token ? `${clip.title} · $${clip.token.symbol}` : clip.title;
  const description = clip.token
    ? `${clip.token.name} ($${clip.token.symbol}) — a clip token on Fragfun.`
    : clip.description || "A gaming moment on Fragfun.";
  const image = clip.token?.imageUrl ?? clip.thumbnailUrl ?? undefined;
  return {
    title,
    description,
    openGraph: { title, description, type: "video.other", images: image ? [{ url: image }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

async function Loader({ params }: { params: PageProps<"/clip/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  return <ClipView id={id} />;
}

export default function ClipPage({ params }: PageProps<"/clip/[id]">) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6">
      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
            <Skeleton className="aspect-video rounded-2xl bg-ff-card" />
            <Skeleton className="h-[600px] rounded-2xl bg-ff-card" />
          </div>
        }
      >
        <Loader params={params} />
      </Suspense>
    </div>
  );
}
