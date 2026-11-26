// Dev server for the v2 testnet helper page: `npx vite --config scripts/testnet/vite.config.mjs` → http://localhost:5180
// Own root and envDir, so no .env file (no VITE_KIT, no Privy) is read; the network defaults are the V3 testnet.
// It is never built or deployed; the app's vite.config.ts is not involved.
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root: here,
  envDir: here,
  cacheDir: fileURLToPath(new URL("../../node_modules/.vite-testnet-helper", import.meta.url)), // keep the app server's dep cache untouched
  server: { port: 5180, strictPort: true, host: "localhost", fs: { allow: [repo] } },
});
