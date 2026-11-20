import "server-only";
import { env } from "@/lib/env";
import { putPublicFile } from "./index";

/**
 * Token metadata in the JSON shape Pump.fun coins use (Metaplex-style off-chain metadata).
 */
export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: true;
  createdOn: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export function buildMetadata(input: {
  name: string;
  symbol: string;
  description: string;
  image: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  clipUrl: string;
}): TokenMetadata {
  const m: TokenMetadata = {
    name: input.name,
    symbol: input.symbol,
    description: input.description || `Clip token for ${input.clipUrl}`,
    image: input.image,
    showName: true,
    createdOn: env().APP_URL,
  };
  m.website = input.website ?? input.clipUrl;
  if (input.twitter) m.twitter = input.twitter;
  if (input.telegram) m.telegram = input.telegram;
  return m;
}

async function pinataUpload(name: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const e = env();
  if (!e.PINATA_JWT) throw new Error("PINATA_JWT is not configured");
  const form = new FormData();
  form.append("network", "public");
  form.append("name", name);
  form.append("file", new Blob([Buffer.from(bytes)], { type: contentType }), name);
  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${e.PINATA_JWT}` },
    body: form,
  });
  if (!res.ok) throw new Error(`IPFS upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: { cid?: string } };
  const cid = json.data?.cid;
  if (!cid) throw new Error("IPFS upload returned no CID");
  return `${e.PINATA_GATEWAY.replace(/\/$/, "")}/ipfs/${cid}`;
}

/** Upload the token image (if provider is IPFS) and return a durable URL. */
export async function storeTokenImage(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  if (env().METADATA_PROVIDER === "pinata") return pinataUpload(key.split("/").pop() ?? "image", bytes, contentType);
  return putPublicFile(key, bytes, contentType);
}

export async function storeMetadataJson(key: string, metadata: TokenMetadata): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(metadata));
  if (env().METADATA_PROVIDER === "pinata") return pinataUpload(`${metadata.symbol}-metadata.json`, bytes, "application/json");
  return putPublicFile(key, bytes, "application/json");
}
