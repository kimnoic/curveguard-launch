import BN from "bn.js";
import {
  ActivationType, BaseFeeMode, CollectFeeMode, DammV2DynamicFeeMode,
  MigratedCollectFeeMode, MigrationFeeOption, MigrationOption,
  TokenAuthorityOption, TokenType, MAX_SQRT_PRICE,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID, buildCurveWithMarketCap,
  convertToLamports, getBaseTokenForSwap, getMigrationBaseToken,
  getMigrationThresholdPrice, getSqrtPriceFromPrice, getSwapAmountWithBuffer,
  validateConfigParameters, type BuildCurveBaseParams, type ConfigParameters,
  type PoolConfig,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import type { LaunchInputs } from "./launch-types";

export const SDK_VERSION = "1.5.13";
export const BASE_DECIMALS = 6;
export const quoteDecimals = (c: LaunchInputs) => c.quoteToken === "SOL" ? 9 : 6;
export const human = (v: BN, decimals: number) => Number(v.toString(10)) / 10 ** decimals;

export function toSerializable(value: unknown): unknown {
  if (BN.isBN(value)) return value.toString(10);
  if (Array.isArray(value)) return value.map(toSerializable);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, toSerializable(v)]));
  return value;
}

export function baseSettings(c: LaunchInputs): BuildCurveBaseParams {
  return {
    token: {
      tokenType: TokenType.SPLToken, tokenBaseDecimal: BASE_DECIMALS,
      tokenQuoteDecimal: quoteDecimals(c), tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: c.totalSupply, leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: { startingFeeBps: c.feeBps, endingFeeBps: c.feeBps, numberOfPeriod: 0, totalDuration: 0 },
      },
      dynamicFeeEnabled: false, collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 100, poolCreationFee: 0, enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: c.compoundingPercent > 0 ? MigratedCollectFeeMode.Compounding : MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps: c.graduatedFeeBps, compoundingFeeBps: c.compoundingPercent * 100,
      },
    },
    liquidityDistribution: {
      partnerLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 100 - c.lockedLiquidityPercent,
      creatorPermanentLockedLiquidityPercentage: c.lockedLiquidityPercent,
    },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp,
  };
}

/**
 * Compile a 16-segment curve with a fixed quote budget and fixed nominal endpoints.
 * Liquidity is normalized using the SDK's integer fixed-point math. The last segment extends to the
 * protocol limit, so rounding cannot strand a pool just before its quote threshold.
 * SDK-derived graduation price and supply/buffer validation remain authoritative.
 */
export function compileCurve(c: LaunchInputs, weights: number[]) {
  if (weights.length !== 16 || weights.some(w => !Number.isFinite(w) || w < 0.01 || w > 100)) {
    throw new Error("A curve needs 16 positive liquidity weights between 0.01 and 100.");
  }
  const params: ConfigParameters = buildCurveWithMarketCap({
    ...baseSettings(c), initialMarketCap: c.initialMarketCap, migrationMarketCap: c.migrationMarketCap,
  });
  const startPrice = c.initialMarketCap / c.totalSupply;
  const endPrice = c.migrationMarketCap / c.totalSupply;
  const prices = Array.from({ length: 17 }, (_, i) => getSqrtPriceFromPrice(
    (startPrice * (endPrice / startPrice) ** (i / 16)).toString(), BASE_DECIMALS, quoteDecimals(c)));
  const w = weights.map(n => new BN(Math.round(n * 10000)));
  const sum = w.reduce((a, wi, i) => a.add(prices[i + 1].sub(prices[i]).mul(wi)), new BN(0));
  const budget = convertToLamports(c.targetQuoteReserve, quoteDecimals(c));
  const unit = budget.shln(128).div(sum);
  if (unit.isZero()) throw new Error("This budget is too small for the requested prices and precision.");
  params.sqrtStartPrice = prices[0];
  params.migrationQuoteThreshold = budget;
  params.curve = w.map((wi, i) => ({
    sqrtPrice: i === 15 ? MAX_SQRT_PRICE.clone() : prices[i + 1],
    liquidity: unit.mul(wi),
  }));
  const migrationSqrtPrice = getMigrationThresholdPrice(budget, params.sqrtStartPrice, params.curve);
  const sold = getBaseTokenForSwap(params.sqrtStartPrice, migrationSqrtPrice, params.curve);
  const migrationBase = getMigrationBaseToken(budget, migrationSqrtPrice, MigrationOption.MET_DAMM_V2);
  const buffer = getSwapAmountWithBuffer(sold, params.sqrtStartPrice, params.curve);
  const required = buffer.add(migrationBase);
  let validationError: string | null = null;
  try { validateConfigParameters({ ...params, leftoverReceiver: DYNAMIC_BONDING_CURVE_PROGRAM_ID }); }
  catch (error) { validationError = error instanceof Error ? error.message : "SDK validation failed."; }
  const poolConfig = { ...params, migrationSqrtPrice,
    poolFees: { ...params.poolFees, dynamicFee: { initialized: 0 } } } as unknown as PoolConfig;
  return { params, poolConfig, migrationSqrtPrice, sold, migrationBase, required, validationError };
}
