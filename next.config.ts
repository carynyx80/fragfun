import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Server-only packages with WASM internals are loaded from node_modules at runtime.
  // @pump-fun/pump-sdk must stay bundled: its ESM build fails under native Node ESM
  // (named `BN` import from the CommonJS @coral-xyz/anchor); the bundler handles the interop.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Split deployment: the frontend (Vercel) forwards every API call to the backend (Railway), so the
  // browser only ever talks to one origin (session cookie, CSRF origin check and sign-in domain).
  async rewrites() {
    const backend = process.env.BACKEND_URL?.replace(/\/$/, "");
    if (!backend) return [];
    return { beforeFiles: [{ source: "/api/:path*", destination: `${backend}/api/:path*` }], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
