# PotKit development log

Portaldot Hacker House 2026 · Track 4 (Ecosystem DApps) · build period 14 Oct – 6 Nov 2026.

This log lists what the repository history and the chain can show. Commit times are as Git recorded them (UTC+7); chain times are block timestamps (UTC). Entries marked **TODO** are facts only the author can fill in; they are left open on purpose rather than guessed.

## Team

Solo project. Display name used in the deck: Tu - Builder, PotKit. The author confirms that the Git author names `itsjusttu` (34 commits) and `Tu` (1 commit, a README edit) are the same person.

## On-chain milestones (checked against the Portaldot V3 RPC)

| When (UTC) | What | Evidence |
|---|---|---|
| 2026-10-19 03:15:12 | `PotKit` deployed to Portaldot V3 testnet (chain 420420777), 3,910 bytes of code, status success | block 97421, tx `0x5ce8a4a4661025a4cac0fe059dd3f10b111a05890c4530abb5d6490c9bf41614`, contract `0x3c26351ad8b9dc7bb4f837c5b921879c35e20fb7` |
| 2026-10-19 03:33 – 03:45 | Full lifecycle recorded with two wallets: mint → lock → list → buy → settle → claim ×2 → redeem (9 transactions, all successful) | blocks 97421–97722, table in the README |
| 2026-10-20 23:41 | Receipt #1 locked again (a new lock cycle after the redeem) and listed | blocks 123,972 and 123,977 |
| 2026-10-21 22:49 | Two more listings on receipt #1 | blocks 137,797 and 137,799 |
| 2026-10-28 01:38 – 01:40 | Receipt #2 minted, locked into 100 shares and 40 shares listed | blocks 225,468, 225,478 and 225,482 |

As of 2026-10-29 the kit has 15 state-changing transactions after the deployment from 2 wallets (read from its event logs): 8 in the recorded lifecycle run and 7 later (2 on 20 Oct, 2 on 21 Oct, 3 on 28 Oct).

## Deployments

| What | When | Notes |
|---|---|---|
| Smart contract (`PotKit.yul`) | 2026-10-19 03:15:12 UTC (10:15 UTC+7) | One deployment, immutable. This is the only contract date that matters for the evidence above. |
| Web frontend (Vercel, production), current build | commit `c74bb03` "Clarify Dashboard settled card, drop unused landing css, update devlog" (29 Oct, 09:05 UTC+7), deployed by hand with `vercel --prod` | The author reported the deploy as live; the live site agrees: `app.potkit.pro` and `potkit.pro` serve one build (identical ETag) with `Last-Modified: 2026-10-29 02:07:55 GMT` (09:07 UTC+7), which is when the served files were last modified, not a confirmed deployment time. In a browser check the Dashboard's Settled card shows the wording added in this commit. Deployment time and time zone: not verified. |
| Web frontend, previous production deployments | `e549ee5` "Add set-minter admin script and tests" (29 Oct), before it `f03a5ea` "Improve Trade sell panel layout" (28 Oct) | `e549ee5`: the author's terminal output showed Ready in 54s, aliased to `potkit.pro`; live files had `Last-Modified: 2026-10-29 00:09:39 GMT` (07:09 UTC+7). `f03a5ea`: had the highlighted (blue) Production badge in the Vercel list supplied by the author ("21h ago"); live files had `Last-Modified: 2026-10-28 02:39:06 GMT` (09:39 UTC+7). |

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
| 29 Oct | `vercel --prod` (from the author's terminal output, not in the screenshots) | 2 | `e549ee5`, `c74bb03` |

- All 23 commit hashes in the list exist in `git log`, with the same messages. Commit `696dd23` (21 Oct) was not the latest production deployment when the screenshots were taken; `f03a5ea` was, until `e549ee5` was deployed on 29 Oct.
- Six commits have no row in the list: `04cfd1c`, `522cf05`, `86d61da`, `71f9f0b`, `0269a44`, `d907a3c`. Deployments are made by hand: the project is not connected to Git (the Vercel CLI offers `vercel git connect` after each deploy), so only commits the author chose to deploy have a row. The reason for each missing commit is not recorded. Older deployments may also have been removed under the project's Deployment Retention setting.
- The list cannot be ordered against the contract deployment inside 19 Oct, because no clock time is shown. The contract date (19 Oct 03:15:12 UTC) is a separate fact from every date above.
- Time and time zone of each deployment are not verified and are not needed for this log.

## Contract versions

| Version | Design | Dates |
|---|---|---|
| v30 | Four Solidity contracts (Receipt, Vault, TestUSD, Market); kept in `contracts/v30/` for reference; measured deploy cost about 1,386 tPOT | No dated evidence. The v30 sources first appear in commit `04cfd1c` (19 Oct, 23:22 UTC+7) as a reference folder, with no earlier commit. No v30 deployment exists on-chain from the deployer wallet: its first transaction is the v31 deploy at block 97421. The v30 cost figures in the README are `eth_estimateGas` measurements. Nothing ties the Vercel deployments of 14–19 Oct to v30. **TODO:** the dates v30 was written, only if you can show a dated note or file. |
| v31 | One hand-written Yul contract (`PotKit.yul`), native tPOT settlement, never-deployed `Lens.sol` for reads; deploy cost about 327 tPOT | deployed 2026-10-19, see above |

## Commit timeline (from `git log`)

35 commits between 19 and 29 Oct 2026, all on `main`. Subjects are quoted as committed.

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

The five commits of 29 Oct were made within about a minute. They group changes that had been sitting uncommitted in the working tree, so their times show when the changes were grouped, not when each one was written.

The contract, API and script files first appear in `04cfd1c`; `contracts/` and `api/` have not changed since. The GitHub repository was created on 2026-10-19 at 16:18:56 UTC (23:18 UTC+7), four minutes before the first commit, and the contract was deployed about 13 hours earlier (03:15:12 UTC). Before that, the only dated evidence of work is Vercel: 28 command-line deployments, 15 on 14 Oct, 1 on 17 Oct and 12 on 19 Oct (see Deployments). They carry no commit, so what they contained is not known, and the retention setting may have removed older ones. The deployer wallet sent no transaction before the contract deploy, and the files' modified times on disk are not evidence of authorship. **TODO:** any dated notes or drafts from 14–19 Oct that show what was built; otherwise the earlier work stays undocumented.

## What the 29 Oct commits contain (`e935bf3` to `e549ee5`, plus `c74bb03`)

- Landing page redesign (dark violet system, receipt → shares → settlement illustration, lifecycle walkthrough, evidence strip)
- App visual system ("night" layers), top-bar navigation, rebuilt Dashboard with market figures read from the chain and an 8-step lifecycle tracker
- Portfolio grouped by claimable payouts, shares held, open listings and receipts issued; *Claim all*; CSV and calendar export; History CSV export
- Debtor pay page with an optional off-chain acknowledgement signature; issuer record and watch list on Trade; *Cash-now planner*; quick Verify popover
- Profile page re-layout
- Plain-language term explanations, reasons shown next to disabled buttons, and a clearer closed-listing explanation
- Transaction links now point at the block (the node console cannot resolve EVM transaction hashes)
- `scripts/set-minter.mjs` (issuer approves a minter; dry run by default; checks the network, the kit and the issuer's balance; estimates the cost), "Judge quick start" and the minter guide in the README
- The event scan starts at the shared kit's deploy block (97421) when `VITE_FROM_BLOCK` is not set, so a clone sees the kit's whole history
- Tests for the new pure logic (`test/insights.test.mjs`) and for the `set-minter` script (`test/setminter.test.mjs`, local Ganache) alongside the existing suite

## Added in `c74bb03`

- Dashboard *Settled* card wording: "1 payment received · 0 receipts paid now" (the tPOT figure adds every settle event; "paid now" counts receipts currently marked Settled), with an explanation on hover
- Removal of the unused `src/landing-xero.css`
- Deployment and commit records in this log

## How the work is checked

- `npm test` compiles the contracts and runs the suite in `test/` (contract behaviour on a local Ganache chain, faucet logic, network switching, transaction errors, settle and trade input checks, receipt history, dashboard figures).
- `npm run build` type-checks the app and the API and builds the bundle.
- On-chain evidence: the README table, re-checkable with `eth_getTransactionReceipt`.
- Cost measurements: `node scripts/measure.mjs` (figures in the README).
- `scripts/set-minter.mjs`: the `--send` path is covered by `test/setminter.test.mjs` on a local Ganache chain only (flag false → true → false, wrong-key refusal, argument checks). The dry run was run read-only against Portaldot on 2026-10-29 (issuer read correctly, flag read, calldata printed). No transaction has been sent to Portaldot with it yet.
