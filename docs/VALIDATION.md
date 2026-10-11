# Validation

## Reproduce

```sh
pnpm test
pnpm typecheck
pnpm build
node scripts/verify-worker.mjs
```

`verify-worker.mjs` exercises the production Worker fetch handler under Node with a filesystem-backed asset binding. It is an HTTP contract/SSR check, not a Cloudflare production or browser-wallet test. The source archive must first exist at `public/downloads/curveguard-launch-source.zip`; regenerate it with `python3 scripts/package-source.py` before building a fresh fork if needed.

## Model suite

`verify-launch.mjs` checks fixed-budget reference matching, 15 screened candidates, seven two-direction samples, an 81-point monotonic chart, supply/buffer validation, exact-in buy and sell fee accounting, slippage minima, insufficient sell inventory, graduation-crossing rejection, strict fields, infeasible supply, unmet targets, SOL precision and native compounding fields.

Recorded default result: SDK-valid selected curve, worst sampled impact 0.9828992%, uniform-liquidity baseline 1.49439547%, relative reduction 34.227638%, expected leftover 300,507,302.468777 tokens. These are model outputs for the shipped default inputs, not empirical market outcomes.

## Offline transaction suite

`verify-transactions.mjs` uses actual Meteora SDK instruction construction and actual Solana transaction serialization/signatures. Every RPC method is mocked; nothing is broadcast. It verifies wallet-account binding, network genesis rejection, quote-mint precision, reviewed-config binding, simulation before wallet signature and resuming after a declined second transaction without duplicating configuration creation.

Recorded successful serialized packet sizes: configuration 1,117 bytes, pool 714 bytes, below Solana's 1,232-byte limit. The test token has an empty metadata URI; larger metadata must still pass runtime packet sizing and network simulation.

## Production-handler contract

`verify-worker.mjs` checks the built callable fetch export, English SSR and expected workspace labels, default JSON design, native exact-in quote endpoint, no-store headers, bad/extra fields, malformed JSON, request size limits, graduated-state rejection, built CSS and downloadable full source asset.

## Limitations of this verification

- No real user wallet was connected or asked to sign.
- No actual devnet/mainnet pool or migration was created during verification.
- RPC tests use deterministic offline stubs; no claim is made about a public RPC's reliability or browser CORS settings.
- Browser automation and device screenshot review were unavailable; layout includes desktop/tablet/mobile CSS, semantic labels and existing accessible primitives but interactive/browser QA remains to be performed.
- The engine models seven progress samples and supported fixed quote fees. It does not prove continuous depth, forecast demand or model arbitrary token extensions.
- Source and SDK configuration are inspectable; this is not an independent smart-contract audit.
