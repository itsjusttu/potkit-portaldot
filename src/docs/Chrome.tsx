import { appUrl } from "../routes";

// All external links live here, grouped once (header dropdowns + footer columns read from these).
// Every URL was already present in earlier versions; nothing new is invented.
export const L = {
  x: "https://x.com/PortaldotL0",
  discord: "https://discord.gg/G33tVtCsNW",
  website: "https://portaldot.world/",
  github: "https://github.com/portaldotVolunteer",
  repo: "https://github.com/portaldotVolunteer/Portaldot",
  whitepaper: "https://portaldot-network.gitbook.io/portaldot-network-docs",
  docs: "https://portaldot-dev.readthedocs.io/en/latest/",
  guide: "https://github.com/ItsCogumellum/portaldot-v3-testnet-guide",
  hackathon: "https://dorahacks.io/hackathon/portaldot-hacker-house-2026/detail",
};
export const ext = { target: "_blank", rel: "noreferrer noopener" } as const;
export const app = (q = "") => appUrl(q);
/** Internal doc-page URL, keeping the judge query string. */
export const page = (p: string) => `${p}${location.search}`;

export const IcoTelegram = () => <svg viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M21.9 4.3 18.6 19.6c-.2 1.1-.9 1.3-1.8.8l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6.1 13.1 1.2 11.6c-1.1-.3-1.1-1.1.2-1.6L20.6 2.7c.9-.3 1.7.2 1.3 1.6z"/></svg>;
