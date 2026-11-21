import { connection } from "next/server";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "./profile-view";
import { Skeleton } from "@/components/ui/skeleton";
import { shortAddr } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/profile/[wallet]">): Promise<Metadata> {
  await connection();
  const { wallet } = await params;
  return { title: `Creator ${shortAddr(wallet)}` };
}

async function Body({ params }: { params: PageProps<"/profile/[wallet]">["params"] }) {
  await connection();
  const { wallet } = await params;
  return <ProfileView wallet={wallet} />;
}

export default function ProfilePage({ params }: PageProps<"/profile/[wallet]">) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 lg:px-6">
      <Suspense fallback={<Skeleton className="h-40 rounded-2xl bg-white/[0.03]" />}>
        <Body params={params} />
      </Suspense>
    </div>
  );
}
