// Optional: pre-configure the deployed contract so anyone opening the site sees the live board.
// PotKit is ONE contract (receipts + vault + settlement + market). Set VITE_KIT in .env after you deploy
// (see .env.example). For older .env files, VITE_VAULT / VITE_RECEIPT / VITE_MARKET are accepted too and may
// all hold the same address; VITE_USD is no longer used (payments are native tPOT).
const env = import.meta.env as Record<string, string | undefined>;
const kit = [env.VITE_KIT, env.VITE_VAULT, env.VITE_RECEIPT, env.VITE_MARKET].map((v) => (v ?? "").trim()).find(Boolean) ?? "";
export const DEFAULTS = {
  kit,
  receipt: kit,
  vault: kit,
  market: kit,
  usd: "",
};
