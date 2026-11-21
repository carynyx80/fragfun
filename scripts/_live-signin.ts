import nacl from "tweetnacl"; import bs58 from "bs58"; import { Keypair } from "@solana/web3.js";
const B = process.argv[2] ?? "https://fragfun-liart.vercel.app"; const kp = Keypair.generate(); let cookie = "";
async function r(p: string, json?: unknown) {
  const res = await fetch(B + p, { method: json ? "POST" : "GET", headers: { Origin: B, "content-type": "application/json", Cookie: cookie }, body: json ? JSON.stringify(json) : undefined, redirect: "manual" });
  const sc = res.headers.get("set-cookie"); if (sc) { cookie = sc.split(";")[0]; console.log("  set-cookie:", sc.replace(/=[^;]+/, "=<redacted>")); }
  const t = await res.text(); return { s: res.status, t };
}
(async () => {
  const n = await r("/api/auth/nonce", { wallet: kp.publicKey.toBase58() });
  console.log("nonce:", n.s, n.t.slice(0, 160));
  if (n.s !== 200) return;
  const msg = JSON.parse(n.t).message;
  const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey));
  const v = await r("/api/auth/verify", { wallet: kp.publicKey.toBase58(), message: msg, signature: sig });
  console.log("verify:", v.s, v.t.slice(0, 200));
  const s = await r("/api/auth/session");
  console.log("session:", s.s, s.t.slice(0, 200));
})();
