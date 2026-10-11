# Architecture and calculation contract

## Product boundaries

The studio and report are reproducible models. The pool inspector reads selected network accounts. The launch flow creates user-reviewed accounts with wallet-signed transactions. Model outputs never masquerade as live reserve, volume or user data.

React components use existing Radix/shadcn form, tab, slider, accordion, checkbox and dialog primitives. Vinext handles server rendering and two JSON endpoints. The Meteora compiler and quote engine run on the server; the Solana client is loaded lazily when the visitor connects a wallet or reads a pool. There is no custodial server, database, hidden fee receiver or key upload.

## Curve compiler

`lib/curve-config.ts` creates SDK-compatible parameters, using `buildCurveWithMarketCap` for complete defaults and `validateConfigParameters` for protocol constraints. It then compiles 16 weighted native liquidity segments.

Let P0 = initial FDV / total supply and P1 = nominal graduation FDV / total supply. Seventeen checkpoints follow P(i) = P0 × (P1/P0)^(i/16). The SDK converts them to integer square-root prices s(i). Positive liquidity weights are quantized to integers w(i). With quote budget Q in raw quote units, the compiler derives:

```
unit = floor((Q << 128) / sum(w(i) * (s(i+1) - s(i))))
L(i) = unit * w(i)
```

The 128-bit scaling matches the SDK liquidity convention. Final curve output uses the protocol maximum square-root-price bound for the last segment so quote-threshold rounding does not strand a pool. The actual threshold price is derived by `getMigrationThresholdPrice`; it is authoritative and can differ slightly from P1.

`getBaseTokenForSwap`, `getMigrationBaseToken` and `getSwapAmountWithBuffer` compute curve distribution, graduation allocation and the minimum pre-migration supply. Supply feasibility includes the SDK buffer, not just sold plus migrated tokens. Any leftover after graduation is a separate creator allocation and is disclosed.

## Deterministic search

The uniform-liquidity reference uses sixteen equal weights. Fourteen alternatives combine tilt in {-2,-1,0,1,2} with a middle-depth focus in {0,1.5,4}, excluding the duplicate uniform case:

```
weight(i) = exp(tilt * (t - 0.5)) * (1 + focus * sin(pi*t)^2)
t = (i + 0.5) / 16
```

Candidates are normalized to the same quote budget and nominal endpoints. Feasible candidates rank by worst sampled buy-or-sell price impact, then average impact. If none passes SDK validation, the best theoretical candidate is shown as model-only and cannot be launched.

Sampled progress is net quote reserve divided by the graduation threshold. Seven samples cover 20%–80%; the chart covers 0%–100% in 1.25% steps. Same supply, quote budget, fees and nominal price endpoints make the comparison useful, but token distribution and leftover allocation differ. No continuous maximum or globally optimal curve is claimed.

## Fees and depth

The studio reconstructs a synthetic DBC state using native curve math and uses `swapQuoteExactIn` for buy and sell execution, current/next price, trading fees and minimum output. A typical sell amount equals configured quote-equivalent value divided by pre-trade spot price. Modeled sells cannot exceed tokens distributed at that state.

Buy impact = (net quote input / base output / spot - 1). Sell impact = (1 - gross quote output / base input / spot). Quote fees are removed from buy input or added back to sell output before computing impact. Fee line items remain separate. Capacity uses a bounded binary search over native quotes.

After graduation, the full-range model subtracts SDK-derived protocol migration fees from both reserves. For target fraction e, quote reserve q and fixed DAMM fee fraction f:

```
buy capacity (gross input) = q*e/(1-f)
sell capacity (pre-trade quote-equivalent input) = q*e/(1-e)
```

Actual migration balances can differ due to protocol rounding, account costs and dead liquidity. These equations are models, not executable routing quotes.

Native DAMM v2 reinvestment is a percentage of LP fees after protocol fees. The scenario sums those reinvested token-B quote fees under an editable fixed daily-volume assumption. It does not compound a predicted investment return or model market-driven reserve changes.

## Read-only pool snapshots

`lib/solana-client.ts` checks the RPC genesis identity, program ownership and quote mint, then fetches native DBC pool and configuration accounts. State reads are sequential, not atomic. DBC capacity uses bounded SDK quotes for active standard SPL pools collecting quote fees with supported fee scheduling. Unsupported modes display unavailable depth rather than fabricated estimates.

For graduated pools, the reader derives the standard DAMM v2 migration address, verifies program ownership and mint pair, then reads native reserves and configured fee reinvestment. Compounding pools expose fee-excluded, full-range reserve depth estimates. An unresolved migration address is disclosed. No trading volume is inferred from accumulated fees.

## Launch authorization

The user selects a network, metadata and launching wallet. The client recompiles the selected curve and compares its serialized parameters with the reviewed specification. It checks genesis and quote-mint precision, creates separate configuration and pool transactions through the native SDK, bounds packets at 1,232 bytes, simulates each, requests the wallet's signature and polls confirmed status.

Creator fee recipients and leftover recipients are the launching wallet. The application never auto-signs or automatically buys/migrates tokens. Ephemeral configuration/mint keypairs only authorize creation of those accounts. Retry checks confirmed existing accounts and can resume an interrupted second transaction while the session remains open.

## Source map

- `app/launch-app.tsx`: English workspace, model requests, imports, wallet connection and optional WebMCP.
- `components/launch/`: accessible inputs, chart, graduation scenario, pool inspector, launch and report.
- `lib/launch-engine.ts`: strict schemas, native modeled quotes, screening and graduation.
- `lib/curve-config.ts`: integer SDK compiler and serializable configuration.
- `lib/solana-client.ts`: read-only RPC and wallet-reviewed account creation.
- `lib/launch-report.ts`: downloadable English specification and SHA-256.
- `app/api/design/route.ts`, `app/api/quote/route.ts`: bounded server JSON endpoints.
- `scripts/verify-*.mjs`: reproducible model, offline transaction and Worker HTTP verification.
- `examples/export-config.mjs`: standalone model/configuration export.
- `build/`, `scripts/`, `.openai/`, `vite.config.ts`: server/hosting infrastructure.
