import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import path from "node:path";

export const alt = "Fragfun — Clip it. Tokenize it. Trade it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social sharing card built from the supplied FF logo. */
export default async function OgImage() {
  const logo = await fs.readFile(path.join(process.cwd(), "public/brand/fragfun-mark.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#050505", display: "flex", flexDirection: "column", justifyContent: "center", padding: 90 }}>
        <img src={src} width={330} height={158} alt="" />
        <div style={{ color: "#fff", fontSize: 64, fontWeight: 700, marginTop: 56, letterSpacing: -2 }}>Clip it. Tokenize it. Trade it.</div>
        <div style={{ color: "#969696", fontSize: 30, marginTop: 16 }}>Turn viral gaming moments into tradable tokens on Solana.</div>
      </div>
    ),
    size,
  );
}
