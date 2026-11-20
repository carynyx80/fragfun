import { EmptyState } from "@/components/common/empty-state";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <EmptyState title="Page not found" body="That page doesn't exist or was removed." action={{ href: "/explore", label: "Explore clips" }} />
    </div>
  );
}
