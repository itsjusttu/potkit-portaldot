import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev-only: serve api/faucet.ts at /api/faucet so `npm run dev` works like Vercel.
 * Server-only vars (FAUCET_*) are read from .env.local into process.env here — they are NOT
 * exposed to the client bundle (only VITE_* are). Without FAUCET_PRIVATE_KEY the API reports
 * "disabled" and the UI shows the manual-funding fallback. Alternative: `vercel dev`.
 */
function devApi(): Plugin {
  return {
    name: "potkit-dev-api",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      for (const [k, v] of Object.entries(env)) if (k.startsWith("FAUCET_") || k.startsWith("KV_") || k.startsWith("UPSTASH_") || k === "VITE_RPC_URL") process.env[k] ??= v;
      server.middlewares.use("/api/faucet", async (req, res) => {
        try {
          const mod = await server.ssrLoadModule("/api/faucet.ts");
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const url = `http://localhost${req.originalUrl ?? req.url ?? "/api/faucet"}`;
          const headers = new Headers({ "x-real-ip": req.socket.remoteAddress ?? "local" });
          const request = new Request(url, { method: req.method, headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined });
          const handler = req.method === "POST" ? mod.POST : mod.GET;
          const r: Response = await handler(request);
          res.statusCode = r.status;
          r.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await r.text());
        } catch (e) {
          res.statusCode = 500; res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "internal", message: String((e as Error).message) }));
        }
      });
    },
  };
}

/** True when every path from an entry to this module goes through @privy-io (the optional Privy chunk). */
function onlyPrivy(id: string, info: (id: string) => { importers: readonly string[]; dynamicImporters: readonly string[]; isEntry: boolean } | null, seen = new Set<string>()): boolean {
  if (seen.has(id)) return true;
  seen.add(id);
  if (id.includes("/node_modules/@privy-io/") || id.includes("/src/lib/privy.tsx")) return true;
  const m = info(id);
  if (!m || m.isEntry) return false;
  const from = [...m.importers, ...m.dynamicImporters];
  if (!from.length) return false;
  return from.every((x) => onlyPrivy(x, info, seen));
}

export default defineConfig({
  plugins: [react(), devApi()],
  // preview/ holds local scratch files (raw photos and video); watching them crashed the dev server when a file was locked
  server: { port: 8080, host: true, watch: { ignored: ["**/preview/**"] } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id, { getModuleInfo }) {
          // Vite's dynamic-import helper is used by the entry itself. Left to Rollup it ends up inside the viem chunk, and then
          // index.html preloads ~290 KB of viem on the landing and doc pages, which never use it.
          if (id.includes("vite/preload-helper") || id.includes("vite/modulepreload-polyfill")) return "preload";
          // viem and its helpers as one cached chunk, but only modules the app itself reaches: anything imported only by the
          // optional Privy chunk (src/lib/privy.tsx, loaded when VITE_PRIVY_APP_ID is set) stays in that chunk, so the app does not grow
          const evm = (id.includes("/node_modules/viem/") || id.includes("/node_modules/ox/") || id.includes("/node_modules/@noble/")) && id.split("/node_modules/").length === 2;
          if (evm && !onlyPrivy(id, getModuleInfo)) return "evm-vendor";
        },
      },
    },
  },
});
