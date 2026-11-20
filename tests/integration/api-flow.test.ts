/**
 * HTTP-level integration tests against a running Fragfun server (default http://localhost:3000,
 * override with FRAGFUN_TEST_URL). Uses real ed25519 wallet signatures from throwaway keypairs.
 * The uploaded "video" is a synthetic byte payload with an MP4 container header — a test fixture
 * for the API pipeline (the browser E2E test uploads a real, generated WebM clip).
 * Skipped automatically when no server is reachable.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

const BASE = process.env.FRAGFUN_TEST_URL ?? "http://localhost:3000";
let reachable = false;

beforeAll(async () => {
  reachable = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(60_000) })
    .then((r) => r.status < 600)
    .catch(() => false);
});

class Client {
  cookie = "";
  constructor(public kp = Keypair.generate()) {}
  get wallet() {
    return this.kp.publicKey.toBase58();
  }
  async req(path: string, init: RequestInit & { json?: unknown } = {}) {
    const { json, ...rest } = init;
    const res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: {
        Origin: BASE,
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(rest.headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads arbitrary JSON
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  }
  async signIn() {
    const n = await this.req("/api/auth/nonce", { method: "POST", json: { wallet: this.wallet } });
    expect(n.status).toBe(200);
    const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(n.body.message), this.kp.secretKey));
    const v = await this.req("/api/auth/verify", { method: "POST", json: { wallet: this.wallet, message: n.body.message, signature: sig } });
    expect(v.status).toBe(200);
    return { message: n.body.message as string, sig };
  }
}

function fakeMp4(seed: string) {
  const header = Buffer.from([0, 0, 0, 0x18, ...Buffer.from("ftypisom"), 0, 0, 2, 0, ...Buffer.from("isomiso2")]);
  return Buffer.concat([header, Buffer.from(`fragfun-test-${seed}-`.repeat(200))]);
}

async function uploadClip(c: Client, seed = randomUUID()) {
  const bytes = fakeMp4(seed);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const up = await c.req("/api/uploads", {
    method: "POST",
    json: { filename: "test.mp4", size: bytes.length, mimeType: "video/mp4", durationSeconds: 12, contentHash: hash, rightsConfirmed: true },
  });
  expect(up.status).toBe(200);
  const put = await c.req(up.body.uploadUrl, { method: "PUT", body: bytes, headers: { "Content-Type": "video/mp4" } });
  expect(put.status).toBe(200);
  return { clipId: up.body.clipId as string, bytes, hash };
}

describe.runIf(process.env.FRAGFUN_SKIP_HTTP !== "1")("API integration", () => {
  it("authenticates a wallet with a signed nonce and rejects replay", async (ctx) => {
    if (!reachable) ctx.skip();
    const c = new Client();
    expect((await c.req("/api/auth/session")).body.user).toBeNull();
    const { message, sig } = await c.signIn();
    const s = await c.req("/api/auth/session");
    expect(s.body.user.wallet).toBe(c.wallet);

    // Replaying the same signed message must fail (nonce consumed).
    const replay = new Client(c.kp);
    const r = await replay.req("/api/auth/verify", { method: "POST", json: { wallet: c.wallet, message, signature: sig } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("nonce_invalid");
  });

  it("rejects forged signatures and cross-site requests", async (ctx) => {
    if (!reachable) ctx.skip();
    const victim = Keypair.generate();
    const attacker = new Client();
    const n = await attacker.req("/api/auth/nonce", { method: "POST", json: { wallet: victim.publicKey.toBase58() } });
    const forged = bs58.encode(nacl.sign.detached(new TextEncoder().encode(n.body.message), attacker.kp.secretKey));
    const v = await attacker.req("/api/auth/verify", { method: "POST", json: { wallet: victim.publicKey.toBase58(), message: n.body.message, signature: forged } });
    expect(v.status).toBe(400);
    expect(v.body.error.code).toBe("bad_signature");

    const csrf = await attacker.req("/api/auth/nonce", { method: "POST", json: { wallet: victim.publicKey.toBase58() }, headers: { Origin: "https://evil.example" } });
    expect(csrf.status).toBe(403);
  });

  it("requires authentication for protected actions", async (ctx) => {
    if (!reachable) ctx.skip();
    const anon = new Client();
    for (const [path, method] of [
      ["/api/uploads", "POST"],
      ["/api/launches", "POST"],
      ["/api/trade/quote", "POST"],
      ["/api/profile", "GET"],
      ["/api/admin/overview", "GET"],
    ] as const) {
      const r = await anon.req(path, { method, json: method === "POST" ? {} : undefined });
      expect(r.status, path).toBe(401);
    }
    const user = new Client();
    await user.signIn();
    expect((await user.req("/api/admin/overview")).status).toBe(403);
  });

  it("runs the upload workflow: upload → verify → ready → details → published feed", async (ctx) => {
    if (!reachable) ctx.skip();
    const c = new Client();
    await c.signIn();
    const { clipId, bytes } = await uploadClip(c);
    const st = await c.req(`/api/clips/${clipId}/status`);
    expect(st.body.status).toBe("ready");

    // Draft clips are private.
    expect((await new Client().req(`/api/clips/${clipId}`)).status).toBe(404);
    const patch = await c.req(`/api/clips/${clipId}`, { method: "PATCH", json: { title: "Integration test jump", description: "test", categorySlug: "crazy-stunts", publish: true } });
    expect(patch.status).toBe(200);
    const pub = await new Client().req(`/api/clips/${clipId}`);
    expect(pub.status).toBe(200);
    expect(pub.body.clip.title).toBe("Integration test jump");
    const feed = await new Client().req(`/api/clips?sort=new&category=crazy-stunts`);
    expect(feed.body.items.some((i: { id: string }) => i.id === clipId)).toBe(true);

    // Range streaming works for the local provider.
    const res = await fetch(`${BASE}/api/media/video/${clipId}`, { headers: { Range: "bytes=0-99" } });
    expect(res.status).toBe(206);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
    expect(bytes.length).toBeGreaterThan(100);
  });

  it("rejects duplicate uploads, wrong file types and mismatched content", async (ctx) => {
    if (!reachable) ctx.skip();
    const owner = new Client();
    await owner.signIn();
    const { bytes, hash } = await uploadClip(owner);
    const other = new Client();
    await other.signIn();
    const dup = await other.req("/api/uploads", {
      method: "POST",
      json: { filename: "x.mp4", size: bytes.length, mimeType: "video/mp4", contentHash: hash, rightsConfirmed: true },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("duplicate");

    const noRights = await other.req("/api/uploads", { method: "POST", json: { filename: "x.mp4", size: 10, mimeType: "video/mp4", contentHash: "c".repeat(64) } });
    expect(noRights.status).toBe(400);

    // Declared hash does not match the uploaded bytes -> processing fails.
    const bogus = Buffer.from([0, 0, 0, 0x18, ...Buffer.from("ftypisom"), ...Buffer.alloc(200, 7)]);
    const up = await other.req("/api/uploads", {
      method: "POST",
      json: { filename: "y.mp4", size: bogus.length, mimeType: "video/mp4", contentHash: createHash("sha256").update(randomUUID()).digest("hex"), rightsConfirmed: true },
    });
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    const put = await other.req(up.body.uploadUrl, { method: "PUT", body: bogus });
    expect(put.status).toBe(400);
    expect((await other.req(`/api/clips/${up.body.clipId}/status`)).body.status).toBe("failed");
  });

  it("deduplicates views and likes", async (ctx) => {
    if (!reachable) ctx.skip();
    const c = new Client();
    await c.signIn();
    const { clipId } = await uploadClip(c);
    await c.req(`/api/clips/${clipId}`, { method: "PATCH", json: { title: "Engagement test", description: "", categorySlug: "funny-moments", publish: true } });
    const viewer = new Client();
    await viewer.signIn();
    expect((await viewer.req(`/api/clips/${clipId}/engage`, { method: "POST", json: { type: "view" } })).body.counted).toBe(true);
    expect((await viewer.req(`/api/clips/${clipId}/engage`, { method: "POST", json: { type: "view" } })).body.counted).toBe(false);
    expect((await viewer.req(`/api/clips/${clipId}/engage`, { method: "POST", json: { type: "like" } })).body.counted).toBe(true);
    expect((await viewer.req(`/api/clips/${clipId}/engage`, { method: "POST", json: { type: "like" } })).body.counted).toBe(false);
    const got = await viewer.req(`/api/clips/${clipId}`);
    expect(got.body.clip.viewCount).toBe(1);
    expect(got.body.clip.likeCount).toBe(1);
    expect(got.body.liked).toBe(true);
    expect((await new Client().req(`/api/clips/${clipId}/engage`, { method: "POST", json: { type: "like" } })).status).toBe(401);
  });

  it("prepares launches honestly: validation, ownership, and on-chain simulation (unfunded wallet)", async (ctx) => {
    if (!reachable) ctx.skip();
    const c = new Client();
    await c.signIn();
    const { clipId } = await uploadClip(c);
    await c.req(`/api/clips/${clipId}`, { method: "PATCH", json: { title: "Launch prep test", description: "", categorySlug: "gta-6", publish: true } });
    // Upload a small PNG to use as the token image.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const fd = new FormData();
    fd.append("file", new Blob([png], { type: "image/png" }), "t.png");
    fd.append("purpose", "token");
    const img = await c.req("/api/uploads/image", { method: "POST", body: fd });
    expect(img.status).toBe(200);

    const base = {
      clipId,
      name: "Launch Prep Test",
      symbol: "$PREP",
      description: "integration",
      imageSource: "upload",
      imageUrl: img.body.url,
      devBuySol: 0,
      mint: Keypair.generate().publicKey.toBase58(),
      idempotencyKey: randomUUID(),
    };
    // Missing explicit acknowledgement.
    expect((await c.req("/api/launches", { method: "POST", json: base })).status).toBe(400);
    // Someone else's clip.
    const other = new Client();
    await other.signIn();
    expect((await other.req("/api/launches", { method: "POST", json: { ...base, acknowledgedRisks: true } })).status).toBe(404);
    // Image hosted elsewhere is refused.
    const ext = await c.req("/api/launches", { method: "POST", json: { ...base, imageUrl: "https://example.com/x.png", acknowledgedRisks: true, idempotencyKey: randomUUID() } });
    expect(ext.status).toBe(400);

    // A fresh wallet has no SOL: the server builds the real create_v2 transaction, simulates it,
    // and reports the problem instead of pretending.
    const r = await c.req("/api/launches", { method: "POST", json: { ...base, acknowledgedRisks: true } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("simulation_failed");
    expect(r.body.error.message, JSON.stringify(r.body)).toMatch(/SOL/);
  });

  it("only allows trading tokens launched through Fragfun", async (ctx) => {
    if (!reachable) ctx.skip();
    const c = new Client();
    await c.signIn();
    const r = await c.req("/api/trade/quote", {
      method: "POST",
      json: { mint: "61XhiiYkJATrSJ9PrNmVJPgqgk21NkwUJx3PssXepump", side: "buy", amount: "0.01", slippageBps: 300 },
    });
    expect(r.status).toBe(404);
  });

  it("supports reports, Clip Wars voting and search", async (ctx) => {
    if (!reachable) ctx.skip();
    const c = new Client();
    await c.signIn();
    const a = await uploadClip(c);
    const b = await uploadClip(c);
    for (const id of [a.clipId, b.clipId])
      await c.req(`/api/clips/${id}`, { method: "PATCH", json: { title: `War clip ${id.slice(0, 6)}`, description: "", categorySlug: "speedruns", publish: true } });
    const war = await c.req("/api/wars", { method: "POST", json: { clipAId: a.clipId, clipBId: b.clipId, durationHours: 1 } });
    expect(war.status).toBe(200);
    const voter = new Client();
    await voter.signIn();
    expect((await voter.req(`/api/wars/${war.body.id}/vote`, { method: "POST", json: { clipId: a.clipId } })).status).toBe(200);
    const again = await voter.req(`/api/wars/${war.body.id}/vote`, { method: "POST", json: { clipId: b.clipId } });
    expect(again.status).toBe(409);
    const rep = await voter.req("/api/reports", { method: "POST", json: { targetType: "clip", targetId: a.clipId, reason: "copyright", details: "test" } });
    expect(rep.status).toBe(200);
    const s = await voter.req(`/api/search?q=${encodeURIComponent("War clip")}`);
    expect(s.body.clips.length).toBeGreaterThanOrEqual(2);
    expect((await voter.req(`/api/search?q=a`)).status).toBe(400);
  });
});
