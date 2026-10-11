import { formatNumber, formatPrice, type DesignResult } from "./launch-types";

export function reportMarkdown(d: DesignResult, fingerprint: string) {
  const c = d.input, s = d.selected, g = d.graduation;
  return `# CurveGuard Launch — Issuance specification

This is a modeled issuance specification, not a record of a live launch.

## Configuration identity

- SDK: @meteora-ag/dynamic-bonding-curve-sdk ${d.sdkVersion}
- SHA-256 of the exact serialized SDK configuration: ${fingerprint || "not yet calculated"}
- Method: ${d.method}
- Tested / SDK-valid candidates: ${d.candidatesTested} / ${d.feasibleCandidates}
- SDK validation: ${s.sdkValid ? "passed" : "failed"}
- Target at sampled states: ${s.targetMet ? "met" : "not met"}

## Issuance parameters

| Parameter | Value |
| --- | --- |
| Quote token | ${c.quoteToken} |
| Total supply | ${formatNumber(c.totalSupply)} TOKEN |
| Initial fully diluted valuation | ${formatNumber(c.initialMarketCap)} ${c.quoteToken} |
| Nominal graduation fully diluted valuation | ${formatNumber(c.migrationMarketCap)} ${c.quoteToken} |
| Graduation quote threshold | ${formatNumber(c.targetQuoteReserve)} ${c.quoteToken} |
| Typical order | ${formatNumber(c.orderSize)} ${c.quoteToken} equivalent |
| Price-impact target | ${c.impactTargetPercent}% excluding fees |
| DBC trading fee | ${c.feeBps / 100}% fixed |
| Graduated DAMM v2 fee | ${c.graduatedFeeBps / 100}% fixed |
| LP fee reinvestment | ${c.compoundingPercent}% after protocol fees |
| Permanently locked creator LP | ${c.lockedLiquidityPercent}% |
| Withdrawable creator LP | ${100 - c.lockedLiquidityPercent}% |
| Creator's DBC non-protocol fee share | 100% |
| App / partner creation and migration fee | 0 |
| Token format | SPL, 6 decimals, immutable metadata update authority |

## Trading depth

Sell capacity is the input token amount valued at the pre-trade spot price.

| Net reserve progress | Buy price impact | Sell price impact | Buy capacity at target | Sell capacity at target |
| --- | --- | --- | --- | --- |
${s.depth.map(p => `| ${p.progress}% | ${p.buyImpact === null ? "not fillable" : formatNumber(p.buyImpact) + "%"} | ${p.sellImpact === null ? "not fillable" : formatNumber(p.sellImpact) + "%"} | ${formatNumber(p.buyCapacity)} ${c.quoteToken} | ${formatNumber(p.sellCapacity)} ${c.quoteToken} |`).join("\n")}

## Same-budget comparison

- Selected worst sampled impact: ${s.worstImpact >= 1000 ? "order not fillable" : formatNumber(s.worstImpact) + "%"}
- Standard worst sampled impact: ${d.baseline.worstImpact >= 1000 ? "order not fillable" : formatNumber(d.baseline.worstImpact) + "%"}
- Relative reduction: ${formatNumber(d.improvementPercent)}%
- Baseline SDK-valid: ${d.baseline.sdkValid}
- Same supply, nominal endpoints, fees and quote threshold. Token distribution and leftover allocation may differ.

## Token allocation

- Curve distribution: ${formatNumber(s.curveTokens)} TOKEN
- Graduation allocation before protocol migration fee: ${formatNumber(s.migrationTokens)} TOKEN
- Expected leftover to launching wallet: ${formatNumber(s.leftoverTokens)} TOKEN
- Minimum pre-migration supply including SDK buffer: ${formatNumber(s.requiredTokens)} TOKEN
- All unlocked LP and leftover tokens are controlled by the launching wallet.

## Graduation model

- Modeled opening price: ${formatPrice(g.price)} ${c.quoteToken}/TOKEN
- Quote reserves after protocol migration fee: ${formatNumber(g.quoteReserve)} ${c.quoteToken}
- Base reserves after protocol migration fee: ${formatNumber(g.baseReserve)} TOKEN
- Protocol migration fee: ${formatNumber(g.protocolMigrationQuoteFee)} ${c.quoteToken} + ${formatNumber(g.protocolMigrationBaseFee)} TOKEN
- Typical buy impact: ${formatNumber(g.buyImpact)}%
- Typical sell impact: ${formatNumber(g.sellImpact)}%
- Native LP fee compounding into token B reserves: ${c.compoundingPercent}%
- DBC-phase fees are not automatically reinvested and do not count toward the quote threshold.

## Warnings

${d.warnings.length ? d.warnings.map(w => "- " + w).join("\n") : "No configured screening warnings."}

## Modeling limits

${d.limitations.map(w => "- " + w).join("\n")}

## Official references

- https://docs.meteora.ag/core-products/dbc/universal-curve
- https://docs.meteora.ag/core-products/dbc/migration-and-liquidity
- https://docs.meteora.ag/core-products/damm-v2/compounding-liquidity
- https://docs.meteora.ag/developer-guides/dbc/typescript-sdk/reference
`;
}
export function downloadText(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function configFingerprint(config: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
