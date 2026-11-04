import { app } from "./Chrome";

/* Help content shared by the help page (src/Help.tsx) and the older doc layout (src/docs/Docs.tsx). */
export const HELP_LINKS: { ico: string; title: string; desc: string; href: string; tag: string }[] = [
  { ico: "M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z", title: "Getting started", desc: "Connect a wallet, understand the network, and learn the receipt lifecycle.", href: "/how-it-works", tag: "Guide" },
  { ico: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6", title: "Issue an invoice", desc: "Mint a receipt, lock it, and set its face value and due date.", href: "/how-it-works#mint", tag: "Issuers" },
  { ico: "M4 8h13l-3-3M20 16H7l3 3", title: "Trade receipt shares", desc: "Learn about listings, escrow, prices, and buying shares.", href: "/how-it-works#trade", tag: "Markets" },
  { ico: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 10h7M8.5 14h7", title: "Settlement & claims", desc: "See how invoice payments are split between share holders.", href: "/how-it-works#settle", tag: "Holders" },
  { ico: "M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6zM9 12l2 2 4-4", title: "Verify a receipt", desc: "Check backing, terms, status, and settlement from chain data.", href: app("?tab=verify"), tag: "Verification" },
  { ico: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3", title: "Security model", desc: "Understand custody, contract permissions, and testnet limits.", href: "/security", tag: "Security" },
];
export const HELP_FAQ = [
  ["What is a PotKit receipt?", "A receipt is an NFT representing an invoice or other receivable. Its owner can lock it and issue fixed-supply shares backed by the receipt."],
  ["Why does the app ask me to switch networks?", "PotKit transactions run on the Portaldot V3 testnet. Read-only pages such as Explore and Verify can still be used without switching."],
  ["How do I issue an invoice?", "Connect an eligible wallet, mint a receipt, then lock it with the invoice amount and optional due date. Minting is limited to the contract issuer and approved minters."],
  ["Can I sell only part of my shares?", "Yes. A seller chooses the share amount and price when creating a listing. Buyers can take a partial amount, and the seller can cancel the unsold remainder."],
  ["How are holders paid after settlement?", "The debtor pays at least the face value in native tPOT. Each holder claims their pro-rata share; the contract's cumulative rounding distributes the pool exactly."],
  ["Does PotKit charge a protocol fee?", "The current contract has no protocol fee. Market prices are set by sellers; the contract does not promise invoice payment or investment returns."],
  ["Who guarantees the debtor pays?", "Nobody. PotKit does not verify the invoice or the debtor; payment is a credit risk on the issuer and the debtor, and buyers should price it as one. The app shows the issuer's record and labels everything as issuer-provided."],
  ["Can an overdue invoice still be bought?", "The contract still accepts a purchase after the due date. This app hides Buy on overdue listings as a product rule. Do not buy shares of an invoice that is past due and unpaid unless you accept that risk."],
  ["Where can I find a transaction?", "Open History in the app for wallet activity, or follow the transaction hash in your wallet. Chain events are public and may take a moment to load."],
];
