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

export default defineConfig({
  plugins: [react(), devApi()],
  server: { port: 8080, host: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/viem/") || id.includes("/node_modules/ox/") || id.includes("/node_modules/@noble/")) return "evm-vendor";
        },
      },
    },
  },
});
