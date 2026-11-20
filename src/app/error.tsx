"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/common/empty-state";

export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <ErrorState message="Something went wrong loading this page." onRetry={reset} />
    </div>
  );
}
