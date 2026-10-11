# CurveGuard Launch

An English-language Meteora DBC launch studio that starts with a trading goal, generates a native configuration, and checks the liquidity handoff into DAMM v2.

## What works

- Generate a 16-segment DBC curve for a typical order and a price-impact target.
- Compare buys and sells against a uniform-liquidity baseline using the same supply, quote budget, nominal price endpoints and fees.
- Inspect seven launch-progress samples, an 81-point price curve, exact-in quotes, slippage, fees and token allocations.
- Model graduated DAMM v2 depth and an editable native fee-compounding scenario.
- Export the exact SDK configuration, SHA-256 fingerprint and English issuance report; import settings from exported JSON.
- Connect an injected Phantom or Solflare wallet and create a configuration, token and DBC pool with two separately reviewed transactions. Each is simulated before signing.
- Read an existing pool's confirmed on-chain reserves, fees, permissions and migration status. Attempt to resolve its graduated DAMM v2 pool.
- Download this complete source package from the website.

All studio numbers are modeled. The on-chain tab only displays accounts the visitor explicitly queries. No user counts, volume, protocol endorsement or launch receipts are invented.

## Run locally

Requirements: Node.js 22.13 or newer and pnpm 11.25.0. The lockfile pins Meteora DBC SDK 1.5.13 and Solana web3.js 1.99.0.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm dev
```

A clean exported project uses the portable development profile and serves the app at `http://localhost:5173`. Runtime-owned previews use the managed profile. The scripts support both; no external SDK tool or paid service is necessary for modeling.

```sh
pnpm build
pnpm start
```

The build produces Cloudflare Worker-compatible server output in `dist/server` and browser assets in `dist/client`. `.openai/hosting.json` records the original Site's project identifier; configure your own hosting project before redeploying a fork. `vite.config.ts` enables Anchor's browser mode so SDK math does not initialize a filesystem wallet inside the Worker.

Optional native acceleration packages `bigint-buffer`, `bufferutil` and `utf-8-validate` have build scripts disabled; supported JavaScript fallbacks are used. No API keys are required. A custom RPC URL can be entered in the browser; it is not stored or sent to the modeling server.

## A useful demo

1. Open Curve studio. The Community example is already calculated.
2. Compare the selected curve with its baseline; hover the chart and change the simulated trade direction or progress.
3. Edit typical order size or graduation reserve, then select **Generate curve**. A stale-results message appears until recalculation succeeds.
4. Inspect Graduation to see whether the same order remains within the target after migration.
5. Change the assumed fee volume to see the reinvestment calculation. This is a scenario, not a forecast.
6. Export Report and Config. Import settings to reproduce the deterministic search.
7. To exercise a test launch, choose the **SOL launch** preset, generate, connect a supported wallet, and open Launch on **Devnet** with enough test SOL for account creation.

The default Community example models a 500 USDC order, a 50,000 USDC quote threshold, 1% impact target and 16 native curve segments. In the current model its worst sampled impact is approximately 0.983%, compared with 1.494% for the uniform-liquidity baseline. The improvement is specific to these seven samples and settings. Allocations differ: the selected configuration leaves about 30.05% of supply to the launching wallet after graduation. This tradeoff is shown in the app and report.

## Wallet launch behavior

- Devnet is selected by default. Mainnet is an explicit user selection and uses real SOL for network and account-creation costs.
- SOL uses the standard wrapped-native quote mint. Mainnet USDC uses its canonical mint. A devnet USDC launch requires the visitor's own standard SPL, 6-decimal test quote mint; mainnet USDC is not reused on devnet.
- Base tokens are standard SPL tokens with 6 decimals. Metadata update authority is removed. Choose a final metadata URI before creation; the app does not host metadata.
- Creator fee recipients, leftover receiver and LP ownership belong to the launching wallet. CurveGuard does not add a creation or migration fee and does not custody funds.
- Configuration and mint account signers are ephemeral browser-memory keypairs. The wallet's private key is never requested or available to the app.
- Two transactions are intentionally separate. Declining the second does not undo the first. Resume reuses this session's account signers and checks confirmed existing accounts; reloading loses that session. Confirm submitted transactions in the explorer before retrying.
- The launch operation creates a pool only. It does not purchase tokens, automatically migrate a pool, claim fees or withdraw liquidity. Graduation happens when reserve conditions are reached and the protocol's migration process completes.

## API and standalone configuration

`POST /api/design` accepts a strict `LaunchInputs` JSON object and returns the selected native configuration, baseline, samples, allocations, graduation model and limitations. `POST /api/quote` accepts `input`, 16 `weights`, `progress`, `direction`, `amount` and `slippageBps`. Buy input is quote currency; sell input is base tokens. Request sizes are bounded and invalid fields return readable 400 responses.

```sh
node examples/export-config.mjs > launch-config.json
```

The example generates the default configuration without an RPC call. An optional JSON file argument accepts exported settings. Integer SDK values serialize as decimal strings; use `lib/curve-config.ts` to compile them back to native BN values before building transactions. The website uses this compiler and validates the reviewed parameter fingerprint before submission.

When a browser supports WebMCP, the app registers `design_curveguard_launch` and `read_curveguard_design`. These only calculate, stage or read modeled results; they cannot access signing keys or submit transactions.

## Scope and validation

The curve search is a deterministic screening of 15 candidates, not a global optimizer. Depth is checked at 20%, 30%, 40%, 50%, 60%, 70% and 80% net quote-reserve progress. Endpoint behavior, fees and asset allocations remain material. Trading fees are excluded from price impact and reported separately. Native segmented curves and fee compounding are Meteora features; the project contribution is a goal-driven design, comparison and lifecycle workflow built around them.

`pnpm test` covers SDK validation, supply/buffer limits, buy/sell fees, slippage, graduation boundaries, infeasible inputs, SOL precision, instruction encoding, valid signed packet sizes and launch resume behavior. RPC and wallet tests are offline mocks. No real wallet-signing session, on-chain creation or user-traction claim has been verified as part of this delivery. Browser interaction and device screenshots were not available in the build environment; TypeScript, model, offline transaction and Worker HTTP checks provide the recorded verification.

See [Architecture](docs/ARCHITECTURE.md), [Validation](docs/VALIDATION.md) and [Hackathon narrative](docs/HACKATHON.md) for calculation details, limitations and the judging-criteria mapping.

## Official references

- [DBC developer guide](https://docs.meteora.ag/developer-guides/dbc/overview)
- [DBC SDK](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk)
- [Universal curve](https://docs.meteora.ag/core-products/dbc/universal-curve)
- [Migration and liquidity](https://docs.meteora.ag/core-products/dbc/migration-and-liquidity)
- [DAMM v2 compounding liquidity](https://docs.meteora.ag/core-products/damm-v2/compounding-liquidity)
