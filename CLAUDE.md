The landing page (potkit.pro) and the app (app.potkit.pro) share ONE set of design tokens (`src/styles/brand.css`) and a calm
fintech look. Technical, security and transaction-safety rules are never relaxed by design work: do not touch contracts/, api/,
src/lib/chain.ts, VITE_* variable names or the transaction flow when changing visuals.

## DESIGN TOKENS (landing and app)
- Light is the default. Canvas ivory #F6F2EA, surface #FFFFFF, ink #14181F, muted #5B6370, line #E3DDD0. One accent: deep navy #16233B
  (hover #22365A). Bronze (#B07A3A; #8A5A22 for small text and links, 5:1 on ivory) is a highlight for key numbers, rules and links, used sparingly.
- Only status is coloured: Settled green #2F6B4F, Overdue red #A8412F, Pending/Open grey-navy #4A5A78. Status is always paired with a word.
- No purple or blue gradients, no neon glow, no glassmorphism, no emoji icons, no gradient headings or buttons. Primary buttons are solid navy
  with white text; one primary action per screen. The only gradients allowed are the dark overlays that keep text readable on the hero photo.
- Type: Fraunces (serif) for headings, Inter for text, IBM Plex Mono for addresses and tx hashes only. Figures use tabular-nums.
- Dark is an optional app theme (top-bar switch, remembered per browser): ink canvas #0E1218 with #141A22 cards, warm ivory text #ECE7DD,
  primary buttons warm ivory with ink text, one bronze accent #D4A15E for focus, selection, links and charts; quieter status colours
  (settled #5FB389, overdue #E58B78, open #9FB0CC). No violet anywhere. The landing is light only.

## LANDING (potkit.pro, `html[data-route="landing"]`)
- `src/Landing.tsx` with `src/lp/lp.css` (scoped under `.lp`), `src/lp/useLive.ts` (chain reads), `src/lp/fx.tsx` (scroll helpers), `src/lp/Bento.tsx` (pinned block) and `src/lp/series.ts`.
  Sections: floating pill nav (no announcement bar), pinned photo hero whose frame shrinks while the headline splits, word-by-word statement, pinned Receipts/Market/Settlement block with charts built from chain events,
  large counting numerals, large-type statement, how it works (active step and receipt follow the scroll), honest limits, closing band, footer. No news or testimonial sections.
  Scroll effects only read the scroll position and write CSS variables (`--e`, `--s`, `--p`, `--c`); the page always scrolls natively, and below 900px or with reduced motion nothing is pinned.
- Hero is a muted looping video from Pexels (video 15170398, Pexels licence, Ho Chi Minh City; `city-*.mp4` with `city-poster-*.webp`, no audio or metadata),
  paused off screen and a still frame under reduced motion. The Dragon Bridge photo (Da Nang) is the author's own work, used in the closing band and menu previews.
  Images are WebP with all metadata removed; tone is changed in CSS (overlay) only, never in the file. Only use media that is the author's own or carries a
  clear free licence, and credit it in the footer, the README and submission/DORAHACKS.md. "How it works" uses a flat navy panel, no photo.
- /help uses the landing system (`src/Help.tsx`, shared chrome `src/lp/Shell.tsx`). The other doc pages (/how-it-works, /protocol, /security) still use the older marketing system (`src/landing-pk.css`, `src/docs/docs-pk.css`, `src/plShell.tsx`).
  Nothing there may leak into the landing or the app.
- Never invent evidence: no customer logos, testimonials, usage numbers or partner claims. Every figure is read from the chain or dated and documented in the
  repo; the receipt in "How it works" is labelled illustrative. Proof must be checkable in the repo or in project links.
- Copy must state PotKit's limits: issuer-provided information is not verified, and payment is not guaranteed.
- Motion (marquee, scroll reveal) must respect `prefers-reduced-motion`, never take over scrolling, and keep all content visible without it.

## APP (app.potkit.pro, `html[data-route="app"]`)
- Tokens in `src/styles/brand.css`; the final layer `src/styles/clean.css` flattens the older `night-*.css` layers (no gradients, glow, blur or heavy shadows,
  1px lines, white cards on ivory). The light theme colours live in `src/styles/night-light.css` under `html[data-theme="light"]`; every new dark-only colour needs a light counterpart there.
- Desktop (>= 1100px) uses a persistent left sidebar (Main, Account, Trust, Support) that scrolls as a whole and never clips its sections, with the wallet status block at its foot
  and a slim top bar with a breadcrumb; phones keep the top row, the bottom tab bar and the sections sheet. On-chain writes show the step panel from `src/TxStatus.tsx`.
- Big numbers with small muted labels, compact tables, status as small chips, skeleton loaders while the RPC answers (no blank screens), friendly empty states with a next step.
- Never invent data: every figure and chart is read from the chain (loaded receipts, listings, scanned events) and says so. Explain terms where they appear, say why a button is
  disabled, warn before irreversible actions. Share amounts are shown with `fmtShares` and `shareUnit` (`src/lib/shares.ts`); exact values stay in tooltips, inputs, CSV and transactions.
- If a skill or detector rule conflicts with this, ignore the rule; do not edit the design.

## WORKING ON CODE (both surfaces)
- For a feature that is unfamiliar, do not write it from scratch: first look for open-source projects on GitHub that solve the
  same problem, compare their approaches, and only then start. Reuse ideas and patterns, never copied code that the licence does
  not allow, and say which projects were compared.
