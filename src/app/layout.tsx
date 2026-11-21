import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers/providers";
import { Navbar, MobileNav } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Suspense } from "react";
import { Logo } from "@/components/layout/logo";
import { ProfileNudge } from "@/components/layout/profile-nudge";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], axes: ["wdth"] });

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Fragfun — Clip it. Tokenize it. Trade it.", template: "%s · Fragfun" },
  description: "Turn viral gaming moments into tradable tokens on Solana.",
  applicationName: "Fragfun",
  openGraph: {
    type: "website",
    siteName: "Fragfun",
    title: "Fragfun — Clip it. Tokenize it. Trade it.",
    description: "Turn viral gaming moments into tradable tokens on Solana.",
  },
  twitter: { card: "summary_large_image", title: "Fragfun", description: "Clip it. Tokenize it. Trade it." },
};

export const viewport: Viewport = { themeColor: "#050505", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} dark`}>
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <Suspense fallback={<StaticHeader />}>
            <Navbar />
          </Suspense>
          <main className="flex-1">{children}</main>
          <Footer />
          <Suspense fallback={null}>
            <MobileNav />
            <ProfileNudge />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}

/** Prerendered header shown until the interactive navigation streams in. */
function StaticHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ff-border bg-ff-bg/85 backdrop-blur-md">
      <div className="mx-auto mt-3 flex h-14 max-w-[1240px] items-center px-7 lg:px-9">
        <Logo />
      </div>
    </header>
  );
}
