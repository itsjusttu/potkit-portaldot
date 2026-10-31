# PotKit pitch deck: outline (draft)

The final submission requires a pitch deck as a **PDF or a publicly accessible link**. It should cover: the problem addressed, why Portaldot is essential, proof that the product works, and reasons for continued future support. About 10 slides is enough; the live demo carries the rest. Figures are read from the chain and dated.

## Slides

| # | Slide | Content (source in this repo) |
|---|---|---|
| 1 | **Title** | PotKit: invoices that pay you now. One line: *tokenise an unpaid invoice into backed, tradeable shares on Portaldot V3 and pay every holder pro-rata, on-chain, when the debtor settles.* Track 4 · Ecosystem DApps (RWA). Links: app, repo, video. Team: Tu - Builder, PotKit (GitHub `itsjusttu`; the Git author `Tu` is the same person). |
| 2 | **Problem** | Freelancers and small businesses wait for payment; factoring is opaque and closed to small invoices; investors have no simple, verifiable way to fund a slice of a receivable. No numeric waiting time is used: no reliable source was found for "30–90 days", so the figure was removed from the submission text and the docs page. |
| 3 | **Solution** | One flow, one contract: mint receipt (ERC-721) → lock and issue fixed-supply ERC-20 shares → trade on an escrow market → debtor settles in native tPOT → holders claim pro-rata → redeem. Use the lifecycle diagram from the README. |
| 4 | **It works: proof** | Deployed kit `0x3c26…0fb7`, block 97421 (2026-10-19). The 9-transaction run with UTC times (README → Testnet evidence). Screenshots of Dashboard, Trade and Verify. State plainly which data is real testnet data. Add the new demo video link. |
| 5 | **Why Portaldot** | Uses the EVM path of V3 (pallet-revive): Solidity and Yul deployed as-is, ERC-721 and ERC-20 standards. Native tPOT settlement: no stablecoin and no token approvals. Built around the storage deposit: one 3.9 KB contract, 82-byte share forwarders, reads in a never-deployed `Lens`. Measured: deploy about 327 tPOT vs 1,386 in the first design; full demo about 47 tPOT vs 87 (`scripts/measure.mjs`). Mapped-account gas flow explained in the UI. Be explicit that WASM/ink! and cross-chain are not used today. |
| 6 | **Architecture** | The mermaid diagram from the README: React + viem, one PotKit contract, `Lens` in `eth_call`, no database. Only two small server functions (tokenURI JSON, optional faucet). |
| 7 | **Safety and honesty** | Fixed share supply, checks-effects-interactions, payout rounding that empties the pool exactly, tests. What it does **not** prove: invoices are issuer-provided; no debtor attestation, no default procedure. What the product does about it today: clear limits in the UI, public Verify page, optional off-chain debtor acknowledgement, issuer payment record from on-chain events. |
| 8 | **Traction (honest)** | Numbers read from the kit's event logs on 2026-10-31 (07:01 UTC, block 263607; unchanged since 30 Oct): 28 state-changing transactions after the deployment (8 in the recorded run, 20 later) from 2 wallets, both the builder's. Re-read the chain on the export day; count other testers only if their transactions are real. |
| 9 | **Where PotKit goes next (a plan, not shipped)** | **First users:** freelancers and small businesses with unpaid invoices, as issuers. Minting is permissioned today (issuer and approved minters), so they are onboarded one by one with the `set-minter` script (README → step 6); anyone can buy shares without approval. **Earning:** none today. The contract takes no fee and PotKit is open source (MIT); the near-term plan is ecosystem support through Portaldot's post-hackathon programme. A fee or paid software would be a later decision, and a fee needs a contract change and a new deployment (about 327 tPOT). **First channel:** the Portaldot community (Discord, X, Hacker House mentors and testers): a tester sends an address, the issuer approves it, and the resulting testnet transactions are checkable evidence. **Why now:** Portaldot V3's new EVM path (pallet-revive) and a design built around its storage deposit: deploy about 327 tPOT against 1,386 in the first design, full demo about 47 against 87 (testnet estimates from `scripts/measure.mjs`, not mainnet cost). Say on the slide: issuer-provided details are not verified and payment is not guaranteed. No market size, customers, partners or usage numbers. |
| 10 | **Roadmap and ask** | Debtor attestation and issuer reputation, explicit default and recovery policy, partial payments, indexer. What continued support would unlock (mainnet migration guidance, RWA data mapping and oracle or data synchronisation, security review, liquidity and gas incentives), matching the Foundation's post-hackathon programme. |
| 11 | **Appendix** | Links, test coverage, third-party disclosure, how to run it locally (README → Judge quick start). |

## Slide 9 options considered (chosen by the author: 1A, 2C, 3A, 4B; these are plans, none of it is true of PotKit today)

Minting is permissioned today (issuer and approved minters), so any plan that has freelancers issuing their own invoices needs an approval step first.

| Decision | Option | Pro | Con |
|---|---|---|---|
| First users | A. Freelancers and SMEs with unpaid invoices (issuers) | Matches the Problem slide and the proven flow | Need minter approval; invoices are issuer-provided and unverified |
| | B. Portaldot community investors and testers (share buyers) | Reachable now; produces real testnet transactions | Only useful once there are invoices to buy; testnet tPOT has no value |
| | C. Platforms that issue receivables to many sellers (integrators) | One integration, many receipts; fits the RWA data-mapping support | Long sales cycle; needs an API or indexer that does not exist yet |
| Earning | A. Listing or settlement fee | Simple and tied to value | The contract has no fee; needs a contract change and a redeploy (~327 tPOT) |
| | B. Paid issuer software (dashboard, reminders, accounting export, verification) | No contract change | The app is free today; no billing and no tested customers |
| | C. Open-source infrastructure (MIT) funded by the post-hackathon programme | Honest at this stage | Not revenue; depends on the programme |
| First channel | A. Portaldot community (Discord, X, Hacker House mentors and testers) | Immediate, right audience | Small, testnet only |
| | B. Direct outreach to a few freelancers or SMEs for one consented real case | Real evidence | Manual work for one person; only evidence after it is done |
| | C. Developer content (README, docs, cost script, mapped-account guide) | Cheap, uses existing assets | Attracts builders more than invoice holders |
| Why now | A. New EVM path (pallet-revive) on Portaldot V3 needs real applications | Fits the Ecosystem criterion | Depends on Portaldot's path; do not claim "first" without proof |
| | B. Storage-deposit-aware design makes on-chain receivables cheap (deploy ~327 vs 1,386 tPOT; demo ~47 vs ~87) | Checkable in the repo | Testnet cost, not mainnet cost |
| | C. Fits the Foundation's post-hackathon support (RWA data mapping, oracles, security review) | Clear and presentable | More of an ask than a market reason |

## How the slides map to the four criteria

| Criterion | Where it shows |
|---|---|
| Technical feasibility (30%) | Slides 4, 6, 7; commit timeline in `DEVLOG.md`; verifiable transactions |
| Innovation (30%) | Slides 3, 5 (storage-deposit-aware design, native tPOT, one-contract receivables) |
| Ecosystem contribution (20%) | Slides 5, 10; open source (MIT); reusable pieces (Lens-in-`eth_call` reads, cost-measuring script, local seed script, mapped-account guide) |
| Business potential (20%) | Slides 2, 8, 9, 10 |

## Before you export

- The new demo video is public (https://youtu.be/Cr7XRDwAU6g) and linked in the README and `submission/DORAHACKS.md`. The deck itself carries no video link.
- Re-read the evidence table and the traction numbers against the chain on the export day.
- Keep claims to what the repository and the chain show; the DoraHacks scoring is based on objective evidence.
