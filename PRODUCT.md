# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

PotKit users tokenise real-world receivables and manage or inspect receipt-backed positions through a web app.

## Product Purpose

PotKit turns real-world receivables into on-chain receipt NFTs and fractional share positions. Users can issue receipts, inspect active receivables, browse and buy marketplace listings, review portfolio claims, and verify receipt status.

## Positioning

PotKit combines a receipt NFT, vault-locked fractional shares, and a public on-chain board so a receivable can be inspected and traded through one coherent record.

## Capabilities and Constraints

The redesign must preserve existing functionality, contracts, ABI, data, and transaction logic. The interface must not connect wallets, sign messages, or send transactions automatically. Existing wallet and transaction actions remain user-triggered. The interface uses a strict black, white, and gray palette; green/red are not used as decorative accents. Core surfaces are Dashboard, Marketplace/Trade, Issue, Portfolio, and Verify.

## Brand Commitments

The product name is PotKit. Existing monospace treatment for addresses and transaction hashes remains required.

## Evidence on Hand

The repository contains the existing React/Vite implementation, contract and test suite, current route components, and existing screenshot captures under the local temporary capture directory. No new product claims or fabricated data should be introduced.

## Product Principles

- Receivable records are the primary objects, not decorative summary cards.
- Context should make the next safe action obvious without hiding important state.
- On-chain truth and current status must remain visible and inspectable.
- Preserve user control around wallets, signatures, and transactions.
- Dense operational information should remain scannable on desktop and usable in one column on mobile.
