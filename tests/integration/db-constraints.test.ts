/**
 * Database-level guarantees, run against the real schema on an in-memory PGlite (Postgres) instance.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, migrate, type Db } from "@/lib/db/core";

let db: Db;
let userId: string;
let otherUser: string;
let clipId: string;

async function expectFail(p: Promise<unknown>, pattern: RegExp) {
  await expect(p).rejects.toThrow(pattern);
}

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  userId = (await db.query<{ id: string }>("insert into users (wallet_address) values ($1) returning id", ["2rAJiU6HoixBrjUxepbznQcXQWGW48Tp1SeyK27bcpcW"]))[0].id;
  otherUser = (await db.query<{ id: string }>("insert into users (wallet_address) values ($1) returning id", ["3WELkTFKXkaV6ob8wLV4dy4g7ZjoAcFXHcU4wRJcp6yE"]))[0].id;
  clipId = (
    await db.query<{ id: string }>(
      `insert into clips (creator_id, video_provider, content_hash, processing_status, moderation_status, is_draft)
       values ($1, 'local', $2, 'ready', 'approved', false) returning id`,
      [userId, "a".repeat(64)],
    )
  )[0].id;
});

afterAll(async () => db.close());

const token = (mint: string, status: string) =>
  db.query(
    `insert into tokens (clip_id, creator_id, mint_address, name, symbol, image_url, metadata_uri, launch_status)
     values ($1, $2, $3, 'Name', 'SYM', 'https://i', 'https://m', $4)`,
    [clipId, userId, mint, status],
  );

describe("schema constraints", () => {
  it("migrations are idempotent", async () => {
    expect(await migrate(db)).toEqual([]);
  });

  it("allows only one in-flight or confirmed launch per clip, but permits retries after failures", async () => {
    await token("MintFailed1111111111111111111111111111111", "failed");
    await token("MintFailed2222222222222222222222222222222", "failed");
    await token("MintActive1111111111111111111111111111111", "awaiting_signature");
    await expectFail(token("MintActive2222222222222222222222222222222", "submitted"), /tokens_one_active_per_clip/);
    await db.query("update tokens set launch_status = 'confirmed' where mint_address = 'MintActive1111111111111111111111111111111'");
    await expectFail(token("MintActive3333333333333333333333333333333", "confirmed"), /tokens_one_active_per_clip/);
  });

  it("prevents the same mint from being recorded twice", async () => {
    await expectFail(token("MintFailed1111111111111111111111111111111", "failed"), /duplicate key/);
  });

  it("rejects malformed tickers and over-long names at the database layer", async () => {
    await expectFail(
      db.query(
        `insert into tokens (clip_id, creator_id, mint_address, name, symbol, image_url, metadata_uri, launch_status)
         values ($1, $2, 'MintBadSym', 'n', 'bad-sym', 'i', 'm', 'failed')`,
        [clipId, userId],
      ),
      /check constraint/,
    );
  });

  it("detects duplicate live uploads by content hash", async () => {
    await expectFail(
      db.query(`insert into clips (creator_id, video_provider, content_hash) values ($1, 'local', $2)`, [otherUser, "a".repeat(64)]),
      /clips_content_hash_live/,
    );
    // Once the original is removed, the hash is free again (e.g. after a takedown and re-upload by the owner).
    await db.query("update clips set moderation_status = 'removed' where id = $1", [clipId]);
    await db.query(`insert into clips (creator_id, video_provider, content_hash) values ($1, 'local', $2)`, [otherUser, "a".repeat(64)]);
    // ...and the removed original cannot be restored while another live copy exists.
    await expectFail(db.query("update clips set moderation_status = 'approved' where id = $1", [clipId]), /clips_content_hash_live/);
  });

  it("deduplicates engagement events (idempotent view and like processing)", async () => {
    const ins = (type: string, bucket: string) =>
      db.query(
        `insert into clip_engagement (clip_id, visitor_key, engagement_type, bucket) values ($1, 'v:abc', $2, $3)
         on conflict do nothing returning id`,
        [clipId, type, bucket],
      );
    expect((await ins("view", "2026-11-20T10")).length).toBe(1);
    expect((await ins("view", "2026-11-20T10")).length).toBe(0);
    expect((await ins("view", "2026-11-20T11")).length).toBe(1);
    expect((await ins("like", "once")).length).toBe(1);
    expect((await ins("like", "once")).length).toBe(0);
  });

  it("does not let a failed upload block the same file", async () => {
    await db.query(`insert into clips (creator_id, video_provider, content_hash, processing_status) values ($1, 'local', $2, 'failed')`, [otherUser, "e".repeat(64)]);
    await db.query(`insert into clips (creator_id, video_provider, content_hash) values ($1, 'local', $2)`, [userId, "e".repeat(64)]);
  });

  it("allows one Clip War vote per user and forbids self-wars", async () => {
    const clip2 = (
      await db.query<{ id: string }>(`insert into clips (creator_id, video_provider, content_hash) values ($1, 'local', $2) returning id`, [userId, "b".repeat(64)])
    )[0].id;
    await expectFail(
      db.query("insert into clip_wars (clip_a_id, clip_b_id, created_by, ends_at) values ($1, $1, $2, now() + interval '1 day')", [clipId, userId]),
      /check constraint/,
    );
    const war = (
      await db.query<{ id: string }>("insert into clip_wars (clip_a_id, clip_b_id, created_by, ends_at) values ($1, $2, $3, now() + interval '1 day') returning id", [
        clipId,
        clip2,
        userId,
      ])
    )[0].id;
    await db.query("insert into clip_war_votes (war_id, user_id, clip_id) values ($1, $2, $3)", [war, otherUser, clipId]);
    await expectFail(db.query("insert into clip_war_votes (war_id, user_id, clip_id) values ($1, $2, $3)", [war, otherUser, clip2]), /duplicate key/);
  });

  it("makes launch attempts idempotent per creator", async () => {
    const t = (await db.query<{ id: string }>("select id from tokens limit 1"))[0].id;
    await db.query("insert into token_launch_attempts (creator_id, token_id, idempotency_key) values ($1, $2, 'k1')", [userId, t]);
    await expectFail(db.query("insert into token_launch_attempts (creator_id, token_id, idempotency_key) values ($1, $2, 'k1')", [userId, t]), /duplicate key/);
  });

  it("enables row level security on every application table", async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migrations'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(16);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });
});
