# PotKit development log

Portaldot Hacker House 2026 · Track 4 (Ecosystem DApps) · build period 14 Oct – 6 Nov 2026.

This log lists what the repository history and the chain can show. Commit times are as Git recorded them (UTC+7); chain times are block timestamps (UTC). Where no dated evidence exists, the entry says so instead of guessing.

## Team

Solo project. Display name used in the deck: Tu - Builder, PotKit. The author confirms that the Git author names `itsjusttu` (43 commits) and `Tu` (1 commit, a README edit) are the same person.

## On-chain milestones (checked against the Portaldot V3 RPC)

| When (UTC) | What | Evidence |
|---|---|---|
| 2026-10-19 03:15:12 | `PotKit` deployed to Portaldot V3 testnet (chain 420420777), 3,910 bytes of code, status success | block 97421, tx `0x5ce8a4a4661025a4cac0fe059dd3f10b111a05890c4530abb5d6490c9bf41614`, contract `0x3c26351ad8b9dc7bb4f837c5b921879c35e20fb7` |
| 2026-10-19 03:33 – 03:45 | Full lifecycle recorded with two wallets: mint → lock → list → buy → settle → claim ×2 → redeem (9 transactions, all successful) | blocks 97421–97722, table in the README |
| 2026-10-20 23:41 | Receipt #1 locked again (a new lock cycle after the redeem) and listed | blocks 123,972 and 123,977 |
| 2026-10-21 22:49 | Two more listings on receipt #1 | blocks 137,797 and 137,799 |
| 2026-10-28 01:38 – 01:40 | Receipt #2 minted, locked into 100 shares and 40 shares listed | blocks 225,468, 225,478 and 225,482 |

As of 2026-10-31 07:01 UTC (block 263607; the same 28 were counted on 30 Oct 00:57 UTC) the kit has 28 state-changing transactions after the deployment from 2 wallets (read from its event logs, block 97421 to 245677; days in UTC): 8 in the recorded lifecycle run on 19 Oct and 20 later (2 on 20 Oct, 2 on 21 Oct, 3 on 28 Oct, 8 on 29 Oct, 5 on 30 Oct). Both wallets belong to the builder.

## Deployments

| What | When | Notes |
|---|---|---|
| Smart contract (`PotKit.yul`) | 2026-10-19 03:15:12 UTC (10:15 UTC+7) | One deployment, immutable. This is the only contract date that matters for the evidence above. |
| Web frontend (Vercel, production), current build | commit `a811082` "Settle drawer facts grid, claimed state for issued invoices, softer light theme with ink edges" (30 Oct, 07:52 UTC+7), deployed by hand with `vercel --prod` | The author reported the deploy as done. The live `app.potkit.pro` serves `Last-Modified: 2026-10-30 00:53:46 GMT` (07:53 UTC+7), and its stylesheet `index-BTea5JzT.css` is byte-for-byte the name a local build of `a811082` produces (the JS entry name differs, as Vercel bakes its own `VITE_*` values). Deployment time and time zone: not verified. |
| Web frontend, previous production deployments | `68c2889` (29 Oct, `Last-Modified: 2026-10-29 05:02:25 GMT`), then the builds of 29 and 30 Oct listed under the commit timeline below, deployed by hand as they were committed (times not recorded); before them `0d78ba9` (`Last-Modified: 2026-10-29 04:52:02 GMT`), `7155916` (04:19:09 GMT), `3c730af` (03:03:38 GMT), `c74bb03` (02:07:55 GMT), `e549ee5` (00:09:39 GMT), all on 29 Oct, and before them `f03a5ea` (28 Oct, `Last-Modified: 2026-10-28 02:39:06 GMT`) | `e549ee5`: the author's terminal output showed Ready in 54s, aliased to `potkit.pro`. `f03a5ea`: had the highlighted (blue) Production badge in the Vercel list supplied by the author ("21h ago"). Each was replaced by the next deployment. Commit `a8b86ee` (home link) has no deployment of its own that was observed; it is in the build from `0d78ba9` on at the latest. |

### Vercel deployment list (screenshots supplied by the author)

Vercel shows a day or a relative age for each deployment. Time and time zone of each deployment: not verified. A deployment's time is not inferred from its commit's time. Every deployment in the list is Ready except one Error. Total: 51 deployments in the screenshots, which were taken before the 29 Oct deployment.

| Day shown in Vercel (time and time zone not verified) | Source | Deployments | Commits or notes |
|---|---|---|---|
| 14 Oct | `vercel deploy` (command line), no commit | 15 | no commit is attached, so the content is not known |
| 17 Oct | `vercel deploy` | 1 | no commit |
| 19 Oct | `vercel deploy` | 12 | one failed (Error, 3 s) and two "Redeploy of" entries; no commit |
| 20 Oct | `vercel deploy` from the git checkout (commit and branch `main` shown) | 4 | `13562f2`, `f0fe654`, `446b8ba`, `943b8ec` |
| 21 Oct | same | 2 | `696dd23`, `df57413` |
| 22 Oct | same | 2 | `452285a`, `23aecc0` |
| 23 Oct | same | 1 | `6ab2c24` |
| 24 Oct | same | 10 | `98698f3`, `8b91c0e`, `885dcfc`, `effd878`, `04dd84b`, `44c77fe`, `e28a5d7`, `e4a2767`, `a24068f`, `c240551` |
| 28 Oct (shown as "1d ago", "22h ago", "21h ago") | same | 4 | `a04bc2c`, `0304387`, `1ea619e`, `f03a5ea` |
| 29 Oct | `vercel --prod` (from the author's terminal output, not in the screenshots) | 6 observed | `e549ee5`, `c74bb03`, `3c730af`, `7155916`, `0d78ba9`, `68c2889` |

- All 23 commit hashes in the list exist in `git log`, with the same messages. Commit `696dd23` (21 Oct) was not the latest production deployment when the screenshots were taken; `f03a5ea` was, until `e549ee5` was deployed on 29 Oct.
- Six commits have no row in the list: `04cfd1c`, `522cf05`, `86d61da`, `71f9f0b`, `0269a44`, `d907a3c`. Deployments are made by hand: the project is not connected to Git (the Vercel CLI offers `vercel git connect` after each deploy), so only commits the author chose to deploy have a row. The reason for each missing commit is not recorded. Older deployments may also have been removed under the project's Deployment Retention setting.
- The list cannot be ordered against the contract deployment inside 19 Oct, because no clock time is shown. The contract date (19 Oct 03:15:12 UTC) is a separate fact from every date above.
- Time and time zone of each deployment are not verified and are not needed for this log.

## Contract versions

| Version | Design | Dates |
|---|---|---|
| v30 | Four Solidity contracts (Receipt, Vault, TestUSD, Market); kept in `contracts/v30/` for reference; measured deploy cost about 1,386 tPOT | No dated evidence. The v30 sources first appear in commit `04cfd1c` (19 Oct, 23:22 UTC+7) as a reference folder, with no earlier commit. No v30 deployment exists on-chain from the deployer wallet: its first transaction is the v31 deploy at block 97421. The v30 cost figures in the README are `eth_estimateGas` measurements. Nothing ties the Vercel deployments of 14–19 Oct to v30. The dates v30 was written are not recorded. |
| v31 | One hand-written Yul contract (`PotKit.yul`), native tPOT settlement, never-deployed `Lens.sol` for reads; deploy cost about 327 tPOT | deployed 2026-10-19, see above |

## Commit timeline (from `git log`)

58 commits between 19 and 30 Oct 2026, all on `main`. Subjects are quoted as committed.

**19 Oct**
- `04cfd1c` 23:22 Prepare PotKit hackathon submission (contracts, API, tests, app, README)

**20 Oct**
- `522cf05` 03:06 Update README.md
- `86d61da` 05:06 Complete DoraHacks submission links
- `13562f2` 06:11 Remove floating demo and scroll badges
- `f0fe654` 06:37 Improve RPC history loading
- `446b8ba` 07:28 Polish app interface and landing background
- `943b8ec` 19:55 Redesign app tabs and restore receipt history

**21 Oct**
- `696dd23` 09:17 Rebuild PotKit app experience
- `71f9f0b` 09:39 Simplify sidebar support section
- `df57413` 10:00 Add PotKit help center and support form

**22 Oct**
- `452285a` 01:24 Polish PotKit trade market experience
- `23aecc0` 23:26 Redesign PotKit

**23 Oct**
- `0269a44` 05:10 docs: lifecycle, ownership, overdue handling, limitations
- `d907a3c` 05:25 docs: README links, mermaid fix, refresh layout
- `6ab2c24` 07:42 ui: raise min font size, collapse trade filters

**24 Oct**
- `98698f3` 01:36 ui: monochrome favicon
- `8b91c0e` 04:44 Replace diamond logo with P circle logo
- `885dcfc` 05:17 Clean app launch URL
- `effd878` 05:23 Play intro when coming from landing
- `04dd84b` 05:36 Add direct contact links and fix help button
- `44c77fe` 05:44 Add PotKit socials and direct contact links
- `e28a5d7` 05:57 Help contact buttons, PotKit X link, remove Telegram from header
- `e4a2767` 06:12 Gmail links open compose, keep nav on one line
- `a24068f` 06:31 Keep waiting on slow tx instead of failing
- `c240551` 11:39 Redesign PotKit UI

**28 Oct**
- `a04bc2c` 04:54 Validate settle payment amounts
- `0304387` 05:37 Require confirmation for overpayments
- `1ea619e` 07:56 Redesign PotKit app with ledger workspace
- `f03a5ea` 09:15 Improve Trade sell panel layout

**29 Oct**
- `e935bf3` 07:03 Docs: evidence tables, devlog, deck outline, judge quick start
- `fb0e9a9` 07:03 Redesign landing page
- `89afa37` 07:03 Add night design system layers for the app
- `43e0daf` 07:04 App: dashboard, portfolio, pay page, tour, sale planner, block links, scan start
- `e549ee5` 07:04 Add set-minter admin script and tests
- `c74bb03` 09:05 Clarify Dashboard settled card, drop unused landing css, update devlog
- `df20c91` 09:10 DEVLOG: record the c74bb03 deployment
- `402fb2e` 09:21 Deck outline: slide 9 plan
- `6b99114` 09:27 Add business potential section and pitch deck PDF
- `3c730af` 10:01 Redesign help, how it works, protocol and security pages with the landing system
- `20b614c` 10:07 DEVLOG: record the 3c730af deployment
- `7155916` 11:17 Black-violet app palette matching the landing, dark-violet buttons, padded success pane, term popover fix
- `a8b86ee` 11:27 Home link from the app keeps only the deployment params, not the current tab
- `0d78ba9` 11:50 Tidier mobile layout for landing and doc pages; lighter Newsreader font
- `68c2889` 12:01 Keep Vite's preload helper out of the viem chunk so the landing no longer downloads viem
- `e37e698` 12:06 DEVLOG: record the later 29 Oct deployments
- `1e79377` 12:56 Mobile app layout: reference-style top row, bottom tab bar, card listings
- `2b4501e` 13:14 Mobile app: fix bottom bar width, trim helper copy
- `0df7530` 14:55 Receipt stub cards, hide kickers, ledger layer and visual cleanups
- `d4d5d87` 14:59 DEVLOG: record the app mobile layout and visual refresh
- `13958a4` 15:18 Update DORAHACKS.md (edited on GitHub)
- `9e71aaf` 17:01 Link the new demo video, remove the video TODO markers

**30 Oct**
- `3e1231c` 04:37 Show claimable payouts in Needs attention, last-claim note in Portfolio, clearer closed listings
- `df7d426` 04:52 Portfolio empty state: last claim on its own line under the actions
- `2c9c3f6` 05:17 Dashboard on a 12-column grid, flat surfaces, solid violet primary buttons
- `19d231a` 05:57 Receipt drawings in lists, consistent type scale, fix share value rounding, no long dashes in app copy
- `52af283` 06:27 Optional light theme with a top-bar switch, remembered per browser
- `7b8f7c2` 07:33 Sidebar layout, wallet status, transaction steps, invoice cards; audit fixes: headings, touch targets, dead CSS; research-first rule
- `a811082` 07:52 Settle drawer facts grid, claimed state for issued invoices, softer light theme with ink edges

The five commits of 29 Oct were made within about a minute. They group changes that had been sitting uncommitted in the working tree, so their times show when the changes were grouped, not when each one was written.

The contract, API and script files first appear in `04cfd1c`; `contracts/` and `api/` have not changed since. The GitHub repository was created on 2026-10-19 at 16:18:56 UTC (23:18 UTC+7), four minutes before the first commit, and the contract was deployed about 13 hours earlier (03:15:12 UTC). Before that, the only dated evidence of work is Vercel: 28 command-line deployments, 15 on 14 Oct, 1 on 17 Oct and 12 on 19 Oct (see Deployments). They carry no commit, so what they contained is not known, and the retention setting may have removed older ones. The deployer wallet sent no transaction before the contract deploy, and the files' modified times on disk are not evidence of authorship. No dated notes or drafts from 14–19 Oct were kept, so what was built before 19 Oct is not documented.

## What the 29 Oct commits contain (`e935bf3` to `e549ee5`, plus `c74bb03`)

- Landing page redesign (dark violet system, receipt → shares → settlement illustration, lifecycle walkthrough, evidence strip)
- App visual system ("night" layers), top-bar navigation, rebuilt Dashboard with market figures read from the chain and an 8-step lifecycle tracker
- Portfolio grouped by claimable payouts, shares held, open listings and receipts issued; *Claim all*; CSV and calendar export; History CSV export
- Debtor pay page with an optional off-chain acknowledgement signature; issuer record and watch list on Trade; *Cash-now planner*; quick Verify popover
- Profile page re-layout
- Plain-language term explanations, reasons shown next to disabled buttons, and a clearer closed-listing explanation
- Transaction links now point at the block (the node console cannot resolve EVM transaction hashes); since 30 Oct the README and DoraHacks evidence tables also link each hash to Pindex, a community explorer built by another hackathon participant, who pointed to it in the Discord office hour (it resolved all nine; at that time it had 10 of the kit's 28 transactions and said it was backfilling; on 31 Oct all 28 resolved, but its index still trailed the chain tip by about 1,300 blocks, so recent transactions can be missing and the app itself still links blocks)
- `scripts/set-minter.mjs` (issuer approves a minter; dry run by default; checks the network, the kit and the issuer's balance; estimates the cost), "Judge quick start" and the minter guide in the README
- The event scan starts at the shared kit's deploy block (97421) when `VITE_FROM_BLOCK` is not set, so a clone sees the kit's whole history
- Tests for the new pure logic (`test/insights.test.mjs`) and for the `set-minter` script (`test/setminter.test.mjs`, local Ganache) alongside the existing suite

## Added in `c74bb03`

- Dashboard *Settled* card wording: "1 payment received · 0 receipts paid now" (the tPOT figure adds every settle event; "paid now" counts receipts currently marked Settled), with an explanation on hover
- Removal of the unused `src/landing-xero.css`
- Deployment and commit records in this log

## Added after `c74bb03` (later on 29 Oct, up to `68c2889`)

- Business potential section in `submission/DORAHACKS.md` (a plan, stating no market size, customers or revenue) and the matching slide 9 in the deck outline
- Pitch deck as a PDF (`submission/PotKit-pitch-deck.pdf`, 11 slides; source `submission/deck/deck.html`)
- Landing: hero text without a long dash, and a line-art drawing for each of the six Explore cards
- Doc pages (`/help`, `/how-it-works`, `/protocol`, `/security`) rebuilt on the landing's design system: shared top bar, header and footer (`src/plShell.tsx`), doc styles in `src/docs/docs-pk.css`, new line art for each lifecycle step, the help center search, cards and FAQ restyled; the old doc stylesheets and header were removed
- App palette aligned with the landing: black-violet canvas (#07050d), dark-violet gradient primary buttons with no white or lavender fills (also on the landing and the help page), a padded "Invoice is live" pane whose heading is no longer hidden; the design rules in `CLAUDE.md` say so
- The "?" help popovers are rendered outside the transformed tab body so they open on screen (they were positioned off screen inside the Trade panel); the APR note in Trade is a plain line
- The home link in the app keeps only the deployment parameters (kit...), not the current tab (`src/lib/params.ts`, `test/params.test.mjs`)
- Landing and doc pages on phones: one-line testnet bar, tighter sections, two-column footer, tables as stacked cards, a swipe hint on diagrams; the serif font is loaded without its optical-size axis (128 KB to 56 KB)
- Vite's preload helper is kept out of the viem chunk, so the landing and doc pages no longer download viem. Lab measurement on the live site (mobile profile, cold cache, runs vary): landing 472 KB to 315 KB (JS 174 KB to 89 KB), first paint about 3.4–3.9 s to 2.4 s, largest paint about 4.8–4.9 s to 3.2 s. The app is unchanged (about 408 KB, it needs viem). Splitting the app stylesheet off the landing (about 74 KB) was left out on purpose.

## Added later on 29 Oct (app mobile layout and visual refresh, deployed by hand with `vercel --prod`)

- App on phones: a top row (logo, Verify, wallet, menu), a fixed bottom tab bar (Home, Explore, Issue, Trade, Portfolio), listings and history as cards, the Issue wizard without nested cards (`src/styles/night-mobile.css`). The bottom bar width was fixed after it overflowed on an iPhone-sized viewport
- Shorter helper copy across the app (tab descriptions hidden on phones, repeated "loaded" and "scanned events" suffixes removed); privacy and disabled-button explanations kept
- One date and number style in the app (`21 Nov 2026`, `156.0%`, fixed `en` locale), replacing browser-locale output such as "30 thg 9" and "156,0%". `src/lib/chain.ts` was not touched, so event note text it builds still follows the browser locale
- Dashboard: the 30-day activity grid and the weekly histogram were replaced by a maturity line (open receipts placed by due date, label = face value, colour = status word; `src/tabs/MaturityStrip.tsx`) and ledger-style rows for upcoming payments; the sparklines and card icon chips were removed; the settlement gauge reads "0 of 1" instead of "0%"
- Trade: price, yield and time to due use larger type; mobile stat cells are aligned
- Explore cards and the Portfolio "Ready to claim" rows use a receipt-stub style (perforation, notches, dashed rules); small uppercase kickers above headings are hidden in the app except on the Verify certificate
- Verify: larger receipt facts and a plain message when the node cannot be reached
- Landing footer: the decorative bars were replaced by a static maturity line labelled as an illustrative example; docs callouts and diagrams lost the side stripe and the grid background
- Styles for this layer live in `src/styles/night-ledger.css` (loaded last). Checked with `npm run build`, `npm test` (60 pass) and screenshots at 1440 px and 390 px; not checked on a physical phone, and the Portfolio claim rows were checked only on an injected sample row (no wallet with settled shares)

## Added on 30 Oct (app redesign and fixes, `3e1231c` to `a811082`)

- Wallet B test on the live app (by the author, real wallet): two invoices paid and one claim of 0.4 tPOT; the claim refunded the storage deposit (the balance rose by about 4.1 tPOT). Dashboard then showed claimable payouts under *Needs attention*, and Portfolio shows the last claim when the wallet holds nothing.
- Share value rounding fixed: face value of a share count is multiplied before dividing, so 60 of 60 shares show exactly 1 tPOT instead of 0.9999999999999996
- Dashboard on a 12-column grid with flat surfaces; the settlement gauge became a split bar; solid violet primary buttons in the app (the landing and doc pages keep the gradient)
- Drawn invoice thumbnails in Trade, Explore and Portfolio; Explore cards with a larger drawing (number, kind, face value, status stamp), face value and due date first
- Desktop app navigation moved to a persistent sidebar with a wallet status block (connected, wrong network, not connected; address, network, balance)
- A step panel for every on-chain write (approve in wallet, sent with hash, confirmed or failed), fed by the existing transaction events; the sending flow is unchanged
- Optional light theme from a top-bar switch, remembered per browser, toned down with ink edges; contrast checked page by page
- Copy: no long dashes in app sentences, sentence-case buttons, "1 buy" plural fix, settled invoices with nothing left to claim say *Claimed* / *All claimed*
- Impeccable `audit` pass: headings no longer skip from h1 to h3, every phone control is at least 44 px, dead CSS removed
- Checked with `npm run build`, `npm test` (60 pass), Playwright in Chrome and Firefox (layout, contrast, tap targets, console errors) at 1440 and 390 px. Not checked: Safari, a physical phone, and the transaction step panel during a real transaction
## Added on 31 Oct (credit-risk wording and a payer hint; no contract change)

- Verify shows a *Who paid* row for a settled receipt, and Explore cards show *Paid from the issuer's own wallet* when the settling wallet is the wallet that locked the receipt (`settlementPayer` in `src/tabs/receipt-history.ts`, 4 new tests; 64 tests pass). It is a hint read from public events, not a fraud check: an issuer can pay from a second wallet
- Verify notes that a past-due, unpaid receipt can still be bought at contract level (the app only hides Buy); the Security page has a new section *Credit risk and the due date*; the Help FAQ and the README answer *Who guarantees the debtor pays?* (nobody; planned, not built: optional debtor acknowledge and dispute, buy reverting after the due date, refund of overpayment)
- Submission text made consistent (31 Oct): the test count is 64 in the README, DoraHacks text and deck (it was 58 in the deck); the debtor acknowledgement is described the same way everywhere (optional, off-chain, not used by the contract; no on-chain attestation); the DoraHacks text has a new overview, the recorded run plus the later 28 transactions, and a README section *For Portaldot builders*
- Deck slide 4 now carries three screenshots of the live app (Verify, Dashboard, Explore, taken 31 Oct), the deploy transaction and the evidence link; slide 6 says how to try the app without tokens; traction re-read on 31 Oct (still 28 transactions from 2 wallets). Trade was not used for a screenshot because the market was empty: the three stale listings of receipt #1 were cancelled on 30 Oct (Pindex shows three `cancel` transactions at 00:47 and 00:48 UTC)

- Fixes from an outside walkthrough of the judge link (31 Oct): Verify shows *OVERDUE · UNPAID* with an exclamation mark for an overdue, unpaid invoice instead of *CHECKS FAILED* (a credit status is not a failed verification; real failures such as a missing lock still fail); the Explore title no longer says "real-world"; a link with `?kit=` skips the intro (arriving from the landing page still plays it); the Settled captions say what each page counts (Dashboard: all cycles, Explore: receipts paid now); *Settlement record* reads "2 of 3 paid on time" with a plain explanation; *Recent trades* says "From chain events" instead of "Verified". Checked in Chrome against the live chain
- Console errors from the RPC (`src/lib/chain.ts`, one constant, kept as its own commit with the author's approval). Measured on 31 Oct against the public V3 RPC: the gateway answers 503 without CORS headers to about 31% of preflight requests (25 of 80) and to 8–17% of `eth_getLogs` calls whatever the block span (40 trials each from 10,000 blocks up to the whole 166,000-block history; no span was ever rejected); sending `text/plain` to skip the preflight does not work (the RPC answers 415). The event scan window was therefore raised from 5,000 to 100,000 blocks. Eight cold loads each on a local build against the real RPC, before → after: RPC requests per load 55 → 12.6, `eth_getLogs` 44.8 → 2.1, failed requests 11 → 0.6, console error lines 22 → 1.3, loads with no console error 0/8 → 3/8; events loaded 8/8 both times. Not fixed, because the gateway still fails some calls, and a known weakness: with a simulated RPC that caps `eth_getLogs` at 20,000 blocks the new window loaded the events in 42 s (old: 7 s, never rejected), and at a 3,000-block cap the old build needed 191 s while the new one had not finished after 300 s, because the window grows back past the cap after every success. Proposed to the author, not done: a ceiling that remembers the largest rejected window

- Event scan hardening (31 Oct; `src/lib/scanstep.ts`, `src/lib/chain.ts`, 8 new tests, 72 pass). A refused window is halved and the scan never grows back past the size that worked; a transient failure (5xx, 429, timeout, dropped connection) is retried on the same window after a 0.6 s and a 1.2 s pause and no longer shrinks it; the working size is kept in sessionStorage per RPC. Browser scenarios on a local build: no limit, 2 requests in 3 s; an RPC refusing spans above 20,000 blocks, 11 s (it was 42 s) and 0 refusals on a reload in the same session; above 3,000 blocks, 48 s (it had not finished after 300 s); six 503s in a row, retried on the same 100,000-block window without shrinking and with all events loaded. Effect on console errors against the real RPC, 24 interleaved cold loads of Dashboard, Explore and Verify #1 per build: failed requests per load 2.0 before and 2.2 after, console error lines 4.1 and 4.3, so no change, because the scan is already two requests and most failures are `eth_call` (30 of the 40 failures counted on Verify #1, which makes about 22 requests per load). A throw-away build with JSON-RPC batching (`http(url, { batch })`, not applied) cut Verify #1 from 7.6 to 1.8 failed requests and from 15.3 to 3.5 console lines per load, and clean loads of Dashboard and Verify #1 from 5/16 to 14/16, but 1 of 16 loads showed no data because a failed batch fails every call in it; left to the author
- Layout between 768 and 1100 px (31 Oct): from 900 to 1100 px the old 56 px icon rail appeared next to the bottom tab bar and the wallet block was clipped inside it. The rail is no longer drawn below 1100 px (the bottom bar and the sections sheet carry navigation). Checked at 768, 820, 900, 1024, 1099, 1100 and 1101 px, and with the sheet open at 390 and 900 px. The Verify button no longer overflows its 44 px box above phone width
- Test count after these changes: 72 (slide, README and DoraHacks text updated, deck PDF re-exported)

## How the work is checked

- `npm test` compiles the contracts and runs the suite in `test/` (contract behaviour on a local Ganache chain, faucet logic, network switching, transaction errors, settle and trade input checks, receipt history, dashboard figures).
- `npm run build` type-checks the app and the API and builds the bundle.
- On-chain evidence: the README table, re-checkable with `eth_getTransactionReceipt`.
- Cost measurements: `node scripts/measure.mjs` (figures in the README).
- `scripts/set-minter.mjs`: the `--send` path is covered by `test/setminter.test.mjs` on a local Ganache chain only (flag false → true → false, wrong-key refusal, argument checks). The dry run was run read-only against Portaldot on 2026-10-29 (issuer read correctly, flag read, calldata printed). No transaction has been sent to Portaldot with it yet.
