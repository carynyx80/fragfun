"use client";

import { useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Toaster } from "sonner";
import { publicEnv } from "@/lib/public-env";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  // Phantom and Solflare register through the Wallet Standard and are detected automatically.
  const wallets = useMemo(() => [], []);
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={publicEnv.rpcUrl} config={{ commitment: "confirmed" }}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <TooltipProvider>
              {children}
              <Toaster
                theme="dark"
                position="bottom-right"
                toastOptions={{ style: { background: "#101010", border: "1px solid #262626", color: "#fff" } }}
              />
            </TooltipProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
