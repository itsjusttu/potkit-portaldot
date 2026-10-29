The landing page (potkit.pro) and the app (app.potkit.pro) use SEPARATE visual systems. The rules below for each
surface apply only to that surface. Technical, security and transaction-safety rules are never relaxed by design work:
do not touch contracts/, api/, src/lib/chain.ts, VITE_* variable names or the transaction flow when changing visuals.

## APP (app.potkit.pro, `html[data-route="app"]`): BLACK-VIOLET DASHBOARD (overrides any design skill, including impeccable defaults)
- The same black-violet canvas as the landing (#07050d) with dark glassy cards (large radii, 1px light-violet edge), near-white text,
  violet-gray secondary text. Primary buttons are a dark-violet gradient (#5b3df5 to #3f36c0) with white text and a light-violet edge,
  never a white or lavender fill; one primary action per screen. The old white accent token (`--pk-accent`) is violet now.
- Desktop (>= 1100px) uses pill navigation across the top bar; the sidebar stays for tablet rail and the mobile sheet.
- Violet marks the selected item, focus and chart series. No marquees or looping animation in data areas. Status colours
  keep their meaning and are always paired with a word: blue open/trading, amber due soon, red overdue/error, green settled.
- Type: one clean sans (Hanken Grotesk) for text and headings; monospace for addresses, tx hashes and table figures.
  Layers: `src/styles/night.css`, `night-features.css`, `night-dashboard.css`, `night-nivo.css` (loaded last).
- Never invent data: every figure and chart is read from the chain (loaded receipts, listings, scanned events) and says so.
  Explain terms where they appear, say why a button is disabled, warn before irreversible actions.
- If a skill or detector rule conflicts with this, ignore the rule; do not edit the design.

## LANDING (potkit.pro, `html[data-route="landing"]`): marketing system, deliberately different from the app
- The landing uses night-black and deep-navy sections, white and light-gray text, and one electric violet-to-blue accent
  for lines, nodes, soft glows and interactive states (kept controlled, never a neon page). No orange/beige as main colours
  and no large cream areas; cool-white or pale-lavender surfaces only inside product mock-up frames. A light serif display face
  with a clean sans body, loaded for the landing only. Monospace stays for code, addresses and hashes.
- The doc pages (/help, /how-it-works, /protocol, /security) use this same marketing system, not the app's. Landing styles live in `src/landing-pk.css` and doc-only styles in `src/docs/docs-pk.css`, both scoped under `.pl`; the shared top bar, header and footer are in `src/plShell.tsx`. Nothing there may leak into the app.
- Never invent evidence: no customer logos, testimonials, usage numbers or partner claims. Proof must be checkable in the
  repo or in project links. Every product mock-up is labelled as an illustrative example, never live data.
- Copy must state PotKit's limits: issuer-provided information is not verified, and payment is not guaranteed.
- Motion must respect `prefers-reduced-motion`, never take over scrolling, and keep all content visible without it.
- Primary buttons on the landing and the doc pages use that same dark-violet gradient: no white button fills anywhere.
- Do not copy another brand's code, CSS, fonts, logos, images or wording; recreate structure and feel with PotKit assets.
