import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, ".sites-runtime", "verification");
fs.mkdirSync(output, { recursive: true });
for (const name of ["launch-types", "curve-config", "launch-engine"]) {
  const source = fs.readFileSync(path.join(root, "lib", `${name}.ts`), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replaceAll('"./curve-config"', '"./curve-config.mjs"').replaceAll('"./launch-types"', '"./launch-types.mjs"');
  fs.writeFileSync(path.join(output, `${name}.mjs`), compiled);
}
const { designLaunch, quoteTrade, inputSchema } = await import(path.join(output, "launch-engine.mjs"));
const { compileCurve } = await import(path.join(output, "curve-config.mjs"));
const { DEFAULT_INPUTS } = await import(path.join(output, "launch-types.mjs"));

const started = performance.now();
const d = designLaunch(DEFAULT_INPUTS);
assert.ok(d.selected.sdkValid, d.selected.validationError);
assert.equal(d.candidatesTested, 15);
assert.equal(d.selected.chart.length, 81);
assert.equal(d.selected.depth.length, 7);
assert.equal(d.baseline.quoteReserve, d.selected.quoteReserve);
assert.equal(d.baseline.startPrice, d.selected.startPrice);
assert.ok(d.selected.worstImpact <= d.baseline.worstImpact);
assert.ok(d.graduation.quoteReserve < DEFAULT_INPUTS.targetQuoteReserve);
for (let i = 1; i < d.selected.chart.length; i++) {
  assert.ok(d.selected.chart[i].price >= d.selected.chart[i - 1].price);
  assert.ok(d.selected.chart[i].soldTokens >= d.selected.chart[i - 1].soldTokens);
}
const buy = quoteTrade(DEFAULT_INPUTS, d.selected.weights, 50, "buy", 500, 100);
assert.ok(buy.amountOut > 0);
assert.ok(buy.nextProgress > 50);
assert.ok(Math.abs(buy.fee - 5) < .0001);
assert.ok(buy.minimumOut <= buy.amountOut * .990001);
const sell = quoteTrade(DEFAULT_INPUTS, d.selected.weights, 50, "sell", 500 / buy.currentPrice, 100);
assert.ok(sell.amountOut > 0);
assert.ok(sell.nextProgress < 50);
assert.ok(Math.abs(sell.fee + sell.amountOut - (sell.amountOut / .99)) < .001);
assert.throws(() => quoteTrade(DEFAULT_INPUTS, d.selected.weights, 0, "sell", 1, 100));
assert.throws(() => quoteTrade(DEFAULT_INPUTS, d.selected.weights, 100, "buy", 1, 100));
assert.throws(() => quoteTrade(DEFAULT_INPUTS, d.selected.weights, 99, "buy", 50000, 100));
assert.equal(inputSchema.safeParse({ ...DEFAULT_INPUTS, feeBps: 1 }).success, false);
assert.equal(inputSchema.safeParse({ ...DEFAULT_INPUTS, lockedLiquidityPercent: 0 }).success, false);
assert.equal(inputSchema.safeParse({ ...DEFAULT_INPUTS, orderSize: NaN }).success, false);
assert.equal(inputSchema.safeParse({ ...DEFAULT_INPUTS, injected: true }).success, false);

const impossible = designLaunch({ ...DEFAULT_INPUTS, targetQuoteReserve: 500000 });
assert.equal(impossible.selected.sdkValid, false);
assert.equal(impossible.feasibleCandidates, 0);
assert.ok(impossible.warnings.length);
const strict = designLaunch({ ...DEFAULT_INPUTS, impactTargetPercent: .1, orderSize: 5000 });
assert.equal(strict.selected.targetMet, false);
assert.equal(strict.graduation.targetMet, false);
const sol = { ...DEFAULT_INPUTS, quoteToken: "SOL", initialMarketCap: 5, migrationMarketCap: 50, targetQuoteReserve: 10, orderSize: .1 };
const ds = designLaunch(sol);
assert.ok(ds.selected.sdkValid, ds.selected.validationError);
assert.ok(quoteTrade(sol, ds.selected.weights, 50, "buy", .1, 100).amountOut > 0);
const cfg = compileCurve(DEFAULT_INPUTS, d.selected.weights).params;
assert.equal(cfg.compoundingFeeBps, 7000);
assert.equal(cfg.migratedPoolFee.collectFeeMode, 2);
assert.equal(cfg.creatorTradingFeePercentage, 100);
assert.ok(compileCurve({ ...DEFAULT_INPUTS, compoundingPercent: 0 }, d.selected.weights).validationError === null);

console.log(JSON.stringify({ status: "passed",
  elapsedMs: Math.round(performance.now() - started),
  default: { sdkValid: d.selected.sdkValid, targetMet: d.selected.targetMet,
    worstImpact: d.selected.worstImpact, baselineImpact: d.baseline.worstImpact,
    improvement: d.improvementPercent, leftoverTokens: d.selected.leftoverTokens },
  coverage: ["fixed-budget comparison", "SDK supply validation", "monotone curves", "buy/sell fees", "slippage", "graduation boundaries", "infeasible goals", "SOL precision", "compounding config"],
}));
