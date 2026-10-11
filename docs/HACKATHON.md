# CurveGuard Launch — hackathon narrative

## Problem

Token issuers often choose a familiar curve and fee preset without knowing whether ordinary buy and sell orders will have usable depth, or whether the graduated pool will preserve that experience. Price continuity alone does not ensure liquidity continuity. Creator leftover allocations can also change when the curve changes.

## Product

CurveGuard turns typical order size, maximum price impact and available quote capital into a native Meteora DBC configuration. It compares a targeted curve with a same-budget reference, discloses allocations, checks graduated DAMM v2 depth and stages native compounding. The issuer exports an inspectable specification, launches with their wallet, and later reads the pool's real reserves and fees.

## Judging criteria

| Criterion | Implemented evidence | Remaining evidence to obtain |
| --- | --- | --- |
| Meteora integration depth | Official DBC compiler/validation, curve math and exact-in quotes; SDK configuration/pool creation; DAMM v2 migration assumptions and native compounding; native account readers | User-authorized devnet and mainnet receipts, migration lifecycle checks |
| Technical execution | Typed modules, strict input boundaries, fixed-point compilation, deterministic comparison, configuration binding, simulated wallet transactions, resume flow, exported reports and reproducible tests | Browser-wallet QA across supported devices; RPC reliability trials; independent review |
| Originality and taste | Goal-driven buy-and-sell design with fair budget constraints, explicit supply allocation and post-graduation depth | Validate that these constraints solve issuer workflows; do not claim the native curve or compounding mechanism was invented here |
| Impact potential | Reusable settings/configuration export and standalone compiler; suitable for communities and tokenized service projects | Pilot with launchpad builders; asset-specific issuer integrations. Equity or RWA backing and legal rights require a separate issuer solution |
| Traction and volume | Inspector shows real queried reserves, fee metrics and migration state without inventing usage | Launch a real pilot, publish verifiable pool addresses and user-approved transaction receipts; measure actual volume and repeat usage |

## Pilot plan

Start with one standard SPL/SOL devnet launch, verify both creation signatures, test trades and migration, and compare observed reserve states with the report. Then conduct an explicitly funded mainnet pilot with a builder who needs a concrete order-size target. Track unique participating wallets, real swaps/volume, achieved depth at stated progress levels, graduated depth and repeat issuer usage from verifiable chain data.

This delivery supplies the product, complete implementation and reproducible validation. It does not claim real users, mainnet volume, asset backing, audit status, an official endorsement or a completed live pilot.
