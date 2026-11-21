import type { Metadata } from "next";
import { Suspense } from "react";
import { ExploreView } from "./explore-view";
import { ClipGrid } from "@/components/clip/clip-card";

export const metadata: Metadata = { title: "Explore clips", description: "Browse gaming clips and their tokens." };

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 lg:px-6">
      <Suspense fallback={<ClipGrid loading count={10} className="mt-16" />}>
        <ExploreView />
      </Suspense>
    </div>
  );
}
