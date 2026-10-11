import BN from "bn.js";
import { z } from "zod";
import {
  calculateQuoteToBaseFromAmountIn, convertToLamports, getPriceFromSqrtPrice,
  getProtocolMigrationFee, getQuoteReserveFromNextSqrtPrice, MigrationOption,
  swapQuoteExactIn, type VirtualPool,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { BASE_DECIMALS, compileCurve, human, quoteDecimals, SDK_VERSION, toSerializable } from "./curve-config";
import type { LaunchInputs, DesignResult, CurveSummary, TradeQuote, Direction, GraduationModel } from "./launch-types";

export const inputSchema = z.object({
  quoteToken: z.enum(["USDC", "SOL"]),
  totalSupply: z.number().finite().min(1_000).max(10_000_000_000),
  initialMarketCap: z.number().finite().min(0.01).max(1_000_000_000),
  migrationMarketCap: z.number().finite().min(0.02).max(10_000_000_000),
  targetQuoteReserve: z.number().finite().min(0.001).max(100_000_000),
  orderSize: z.number().finite().min(0.000001).max(10_000_000),
  impactTargetPercent: z.number().finite().min(0.1).max(10),
  feeBps: z.number().int().min(25).max(1000),
  graduatedFeeBps: z.number().int().min(10).max(1000),
  compoundingPercent: z.number().int().min(0).max(100),
  lockedLiquidityPercent: z.number().int().min(10).max(100),
}).strict().refine(c => c.migrationMarketCap > c.initialMarketCap && c.migrationMarketCap / c.initialMarketCap <= 1000,
  { message: "Graduation valuation must exceed the initial valuation, with a maximum 1,000× multiple.", path: ["migrationMarketCap"] });

export const quoteRequestSchema = z.object({
  input: inputSchema,
  weights: z.array(z.number().finite().min(0.01).max(100)).length(16),
  progress: z.number().finite().min(0).max(99.9),
  direction: z.enum(["buy", "sell"]),
  amount: z.number().finite().positive().max(10_000_000_000),
  slippageBps: z.number().int().min(0).max(5000),
}).strict();

type Compiled = ReturnType<typeof compileCurve>;
const SAMPLE_PROGRESS = [20, 30, 40, 50, 60, 70, 80];

function stateAt(c: LaunchInputs, b: Compiled, progress: number) {
  const reserve = b.params.migrationQuoteThreshold.muln(Math.round(progress * 1000)).divn(100000);
  const fill = calculateQuoteToBaseFromAmountIn(b.poolConfig, b.params.sqrtStartPrice, reserve, b.migrationSqrtPrice);
  return { reserve, sqrtPrice: fill.nextSqrtPrice, sold: fill.outputAmount,
    price: getPriceFromSqrtPrice(fill.nextSqrtPrice, BASE_DECIMALS, quoteDecimals(c)).toNumber() };
}

function executeQuote(c: LaunchInputs, b: Compiled, progress: number, direction: Direction, amount: number, slippageBps = 100): TradeQuote {
  if (progress >= 100) throw new Error("DBC trading ends at graduation. Use the graduated DAMM v2 pool.");
  const state = stateAt(c, b, progress);
  const amountIn = convertToLamports(amount, direction === "buy" ? quoteDecimals(c) : BASE_DECIMALS);
  if (amountIn.isZero()) throw new Error("Increase the order size to at least one token unit.");
  if (direction === "sell" && amountIn.gt(state.sold)) throw new Error("This modeled state has not distributed enough tokens for this sell order.");
  const pool = { poolState: { sqrtPrice: state.sqrtPrice, quoteReserve: state.reserve,
    activationPoint: new BN(0), volatilityTracker: {} } } as unknown as VirtualPool;
  let r: ReturnType<typeof swapQuoteExactIn>;
  try { r = swapQuoteExactIn(pool, b.poolConfig, direction === "sell", amountIn, slippageBps, false, new BN(1), false); }
  catch { throw new Error("This order exceeds the available curve depth or crosses graduation. Reduce its size."); }
  const output = human(r.outputAmount, direction === "buy" ? BASE_DECIMALS : quoteDecimals(c));
  const fee = human(r.tradingFee.add(r.protocolFee), quoteDecimals(c));
  if (output <= 0) throw new Error("This order is below the pool's output precision.");
  const netIn = amount - (direction === "buy" ? fee : 0);
  const grossOut = output + (direction === "sell" ? fee : 0);
  const impact = direction === "buy" ? (netIn / output / state.price - 1) * 100
    : (1 - grossOut / amount / state.price) * 100;
  return {
    direction, progress, amountIn: amount, amountOut: output,
    minimumOut: human(r.minimumAmountOut ?? r.outputAmount, direction === "buy" ? BASE_DECIMALS : quoteDecimals(c)),
    fee, protocolFee: human(r.protocolFee, quoteDecimals(c)), creatorFee: human(r.tradingFee, quoteDecimals(c)),
    priceImpact: Math.max(0, impact), currentPrice: state.price,
    nextPrice: getPriceFromSqrtPrice(r.nextSqrtPrice, BASE_DECIMALS, quoteDecimals(c)).toNumber(),
    nextProgress: Math.min(100, human(getQuoteReserveFromNextSqrtPrice(r.nextSqrtPrice, b.poolConfig), quoteDecimals(c)) / c.targetQuoteReserve * 100),
    inputToken: direction === "buy" ? c.quoteToken : "TOKEN",
    outputToken: direction === "buy" ? "TOKEN" : c.quoteToken,
  };
}

export function quoteTrade(input: LaunchInputs, weights: number[], progress: number, direction: Direction, amount: number, slippageBps: number) {
  const v = quoteRequestSchema.parse({ input, weights, progress, direction, amount, slippageBps });
  const b = compileCurve(v.input, v.weights);
  if (b.validationError) throw new Error("This configuration is not deployable. Adjust your budget or token allocation.");
  return executeQuote(v.input, b, progress, direction, amount, slippageBps);
}

function impactAt(c: LaunchInputs, b: Compiled, progress: number, direction: Direction, quoteValue: number): number {
  const state = stateAt(c, b, progress);
  try { return executeQuote(c, b, progress, direction, direction === "buy" ? quoteValue : quoteValue / state.price, 0).priceImpact; }
  catch { return Infinity; }
}

function capacityAt(c: LaunchInputs, b: Compiled, progress: number, direction: Direction): number {
  let low = 0;
  let high = direction === "buy" ? c.targetQuoteReserve * (1 - progress / 100) / (1 - c.feeBps / 10000)
    : human(stateAt(c, b, progress).sold, BASE_DECIMALS) * stateAt(c, b, progress).price;
  // A monotone exact-in price-impact bound, expressed as quote-equivalent input.
  for (let i = 0; i < 21; i++) {
    const mid = (low + high) / 2;
    if (impactAt(c, b, progress, direction, mid) <= c.impactTargetPercent) low = mid;
    else high = mid;
  }
  return low;
}

function summarize(c: LaunchInputs, weights: number[], id: string, name: string, full = false): CurveSummary {
  const b = compileCurve(c, weights);
  const values = SAMPLE_PROGRESS.map(progress => {
    const buy = impactAt(c, b, progress, "buy", c.orderSize);
    const sell = impactAt(c, b, progress, "sell", c.orderSize);
    return { progress, price: stateAt(c, b, progress).price,
      buyImpact: Number.isFinite(buy) ? buy : null, sellImpact: Number.isFinite(sell) ? sell : null,
      buyCapacity: full ? capacityAt(c, b, progress, "buy") : 0,
      sellCapacity: full ? capacityAt(c, b, progress, "sell") : 0 };
  });
  const buy = values.map(s => s.buyImpact ?? 1000);
  const sell = values.map(s => s.sellImpact ?? 1000);
  const curveTokens = human(b.sold, BASE_DECIMALS);
  const migrationTokens = human(b.migrationBase, BASE_DECIMALS);
  const worst = Math.max(...buy, ...sell);
  return {
    id, name, weights, sdkValid: !b.validationError, validationError: b.validationError,
    startPrice: c.initialMarketCap / c.totalSupply,
    graduationPrice: getPriceFromSqrtPrice(b.migrationSqrtPrice, BASE_DECIMALS, quoteDecimals(c)).toNumber(),
    quoteReserve: c.targetQuoteReserve, curveTokens, migrationTokens,
    leftoverTokens: Math.max(0, c.totalSupply - curveTokens - migrationTokens),
    requiredTokens: human(b.required, BASE_DECIMALS),
    worstBuyImpact: Math.max(...buy), worstSellImpact: Math.max(...sell), worstImpact: worst,
    averageImpact: [...buy, ...sell].reduce((a, v) => a + v, 0) / 14,
    targetMet: !b.validationError && worst <= c.impactTargetPercent,
    chart: full ? Array.from({ length: 81 }, (_, i) => {
      const p = i * 1.25; const s = stateAt(c, b, p);
      return { progress: p, price: s.price, reserve: human(s.reserve, quoteDecimals(c)), soldTokens: human(s.sold, BASE_DECIMALS) };
    }) : [],
    depth: values,
    sdkConfig: full ? toSerializable(b.params) as Record<string, unknown> : {},
  };
}

export function graduationModel(c: LaunchInputs, curve: CurveSummary): GraduationModel {
  const b = compileCurve(c, curve.weights);
  const [baseFee, quoteFee] = getProtocolMigrationFee(b.migrationBase, b.params.migrationQuoteThreshold,
    b.migrationSqrtPrice, 20, MigrationOption.MET_DAMM_V2);
  const q = c.targetQuoteReserve - human(quoteFee, quoteDecimals(c));
  const a = human(b.migrationBase.sub(baseFee), BASE_DECIMALS);
  const price = q / a;
  const eps = c.impactTargetPercent / 100;
  const feeFactor = 1 - c.graduatedFeeBps / 10000;
  const order = c.orderSize;
  const buyImpact = order * feeFactor / q * 100;
  const sellImpact = order / (q + order) * 100;
  return { quoteReserve: q, baseReserve: a, price,
    protocolMigrationQuoteFee: human(quoteFee, quoteDecimals(c)), protocolMigrationBaseFee: human(baseFee, BASE_DECIMALS),
    buyCapacity: q * eps / feeFactor,
    sellCapacity: q * eps / (1 - eps),
    buyImpact, sellImpact, grossFeeOnOrder: order * c.graduatedFeeBps / 10000,
    targetMet: Math.max(buyImpact, sellImpact) <= c.impactTargetPercent,
    suggestedQuoteReserve: Math.max(order * feeFactor / eps, order * (1 - eps) / eps) / .998,
  };
}

export function designLaunch(raw: LaunchInputs): DesignResult {
  const c = inputSchema.parse(raw);
  const candidates: { id: string; name: string; weights: number[] }[] = [
    { id: "standard", name: "Standard curve", weights: Array(16).fill(1) },
  ];
  for (const tilt of [-2, -1, 0, 1, 2]) {
    for (const focus of [0, 1.5, 4]) {
      if (tilt === 0 && focus === 0) continue;
      candidates.push({ id: `depth-${tilt}-${focus}`, name: "Depth-targeted curve",
        weights: Array.from({ length: 16 }, (_, i) => Number((Math.exp(tilt * (i / 15 - .5)) *
          (1 + focus * Math.sin(Math.PI * (i + .5) / 16) ** 2)).toFixed(4))) });
    }
  }
  const evaluated = candidates.map(candidate => summarize(c, candidate.weights, candidate.id, candidate.name));
  const feasible = evaluated.filter(v => v.sdkValid);
  const ordered = [...(feasible.length ? feasible : evaluated)].sort((a, b) => a.worstImpact - b.worstImpact || a.averageImpact - b.averageImpact);
  const winner = ordered[0];
  const selected = summarize(c, winner.weights, winner.id, winner.name, true);
  const baseline = summarize(c, candidates[0].weights, "standard", "Standard curve", true);
  const graduation = graduationModel(c, selected);
  const warnings: string[] = [];
  if (!selected.sdkValid) warnings.push(`No deployable curve was found in this search. The smallest tested configuration needs ${Math.ceil(Math.min(...evaluated.map(v => v.requiredTokens))).toLocaleString("en-US")} tokens, including the SDK's pre-migration buffer. Increase supply or reduce the quote budget / price range.`);
  if (!selected.targetMet) warnings.push("The selected curve does not meet the order-size target at every sampled state. Lower the order size, relax the impact target, or revise the budget and valuations.");
  if (!graduation.targetMet) warnings.push("The modeled graduated pool needs more quote reserves to meet this order-size target. Curve shaping alone cannot provide that extra capital.");
  if (selected.leftoverTokens / c.totalSupply > .25) warnings.push("More than 25% of supply is expected to remain as leftover. The launching wallet receives this allocation after graduation; disclose its intended use.");
  if (c.lockedLiquidityPercent < 80) warnings.push("Less than 80% of LP is permanently locked. The launching wallet can withdraw the unlocked share.");
  if (c.feeBps >= 300) warnings.push("The DBC trading fee is at least 3%. Fees are separate from the displayed price-impact target.");
  return {
    input: c, sdkVersion: SDK_VERSION,
    method: "Deterministic 15-candidate parameter search; minimum worst-case buy/sell impact at seven sampled reserve states.",
    sampledProgress: SAMPLE_PROGRESS, candidatesTested: evaluated.length, feasibleCandidates: feasible.length,
    selected, baseline,
    improvementPercent: baseline.worstImpact > 0 ? Math.max(0, (baseline.worstImpact - selected.worstImpact) / baseline.worstImpact * 100) : 0,
    graduation, warnings,
    limitations: [
      "These are modeled pools, not live account snapshots. SDK validation is not an audit or a guarantee of transaction success.",
      "Targets are checked at 20%, 30%, 40%, 50%, 60%, 70%, and 80% of net quote reserves. They are not a continuous guarantee or proof of global optimality.",
      "Both curves use the same supply, initial valuation, nominal graduation valuation, quote threshold and fees. Distribution and leftover allocations can differ.",
      "Price impact excludes trading fees. Sell order sizes and sell capacities are valued at the pre-trade spot price.",
      "Graduation models deduct the 0.2% protocol migration fee. Rent, rounding, dead liquidity and actual migration state can change the final balances.",
      "Fee-reinvestment scenarios assume stated volume and protocol fee share. They do not predict market demand, returns, or future prices.",
    ],
  };
}
