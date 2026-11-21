/**
 * TEST-ONLY wallet for Playwright: registers a Wallet Standard wallet ("Fragfun Test Wallet") in the
 * page. Signing happens in the Node test process with a devnet test keypair (.data/test-wallet.json
 * or a throwaway key). It is never shipped in the app bundle.
 */
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";

export function testKeypair(throwaway = false): Keypair {
  const file = path.resolve(".data/test-wallet.json");
  if (!throwaway && fs.existsSync(file)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
  return Keypair.generate();
}

export async function installTestWallet(page: Page, kp: Keypair, opts: { rejectTransactions?: boolean } = {}) {
  await page.exposeFunction("__ffTestSignMessage", (b64: string) => {
    const sig = nacl.sign.detached(Buffer.from(b64, "base64"), kp.secretKey);
    return Buffer.from(sig).toString("base64");
  });
  await page.exposeFunction("__ffTestSignTransaction", (b64: string) => {
    if (opts.rejectTransactions) throw new Error("User rejected the request.");
    const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
    tx.sign([kp]);
    return Buffer.from(tx.serialize()).toString("base64");
  });
  await page.addInitScript(
    ({ address, pk }) => {
      const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
      const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const chains = ["solana:devnet", "solana:mainnet"] as const;
      const w = window as unknown as {
        __ffTestSignMessage: (s: string) => Promise<string>;
        __ffTestSignTransaction: (s: string) => Promise<string>;
      };
      const account = {
        address,
        publicKey: new Uint8Array(pk),
        chains,
        features: ["solana:signMessage", "solana:signTransaction"],
      };
      let connected = false;
      const listeners: Record<string, Array<(e: unknown) => void>> = {};
      const wallet = {
        version: "1.0.0",
        name: "Fragfun Test Wallet",
        icon: "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#8bff16"/></svg>'),
        chains,
        get accounts() {
          return connected ? [account] : [];
        },
        features: {
          "standard:connect": {
            version: "1.0.0",
            connect: async () => {
              connected = true;
              (listeners.change ?? []).forEach((l) => l({ accounts: [account] }));
              return { accounts: [account] };
            },
          },
          "standard:disconnect": {
            version: "1.0.0",
            disconnect: async () => {
              connected = false;
              (listeners.change ?? []).forEach((l) => l({ accounts: [] }));
            },
          },
          "standard:events": {
            version: "1.0.0",
            on: (event: string, l: (e: unknown) => void) => {
              (listeners[event] ??= []).push(l);
              return () => (listeners[event] = (listeners[event] ?? []).filter((x) => x !== l));
            },
          },
          "solana:signMessage": {
            version: "1.0.0",
            signMessage: async (...inputs: Array<{ message: Uint8Array }>) =>
              Promise.all(inputs.map(async (i) => ({ signedMessage: i.message, signature: unb64(await w.__ffTestSignMessage(b64(i.message))) }))),
          },
          "solana:signTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: ["legacy", 0],
            signTransaction: async (...inputs: Array<{ transaction: Uint8Array }>) =>
              Promise.all(inputs.map(async (i) => ({ signedTransaction: unb64(await w.__ffTestSignTransaction(b64(i.transaction))) }))),
          },
        },
      };
      const register = (api: { register: (w: unknown) => void }) => api.register(wallet);
      window.addEventListener("wallet-standard:app-ready", (e) => register((e as CustomEvent).detail));
      window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
    },
    { address: kp.publicKey.toBase58(), pk: Array.from(kp.publicKey.toBytes()) },
  );
}

/** Connect via the wallet modal and complete Sign-In With Solana. */
export async function connectAndSignIn(page: Page) {
  await page.getByTestId("connect-wallet").first().click();
  await page.getByRole("button", { name: /Fragfun Test Wallet/ }).click();
  // Sign-in is requested automatically right after a user-initiated connect.
  await page.getByTestId("profile-menu").waitFor();
  // Regression: opening the account and notification menus used to crash the page.
  await page.getByTestId("profile-menu").click();
  await page.getByRole("menuitem", { name: /My profile/ }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Notifications" }).click();
  await page.getByText("Notifications", { exact: true }).last().waitFor();
  await page.keyboard.press("Escape");
}

/** Generates an original test clip (animated canvas → WebM) inside the browser. */
export async function generateClipInPage(page: Page, seconds = 2): Promise<Buffer> {
  const b64 = await page.evaluate(async (secs) => {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 640;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const seed = Math.random();
    let frame = 0;
    const draw = () => {
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, 360, 640);
      ctx.fillStyle = "#8bff16";
      ctx.beginPath();
      ctx.arc(60 + ((frame * 6) % 240), 320 + Math.sin(frame / 8 + seed * 10) * 120, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(`FRAGFUN TEST ${seed.toFixed(4)}`, 20, 60);
      frame++;
    };
    const iv = setInterval(draw, 33);
    rec.start(200);
    await new Promise((r) => setTimeout(r, secs * 1000));
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    clearInterval(iv);
    const buf = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return btoa(bin);
  }, seconds);
  return Buffer.from(b64, "base64");
}
