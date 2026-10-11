export type QuoteToken = "USDC" | "SOL";
export type Network = "devnet" | "mainnet-beta";
export type Direction = "buy" | "sell";

export interface LaunchInputs {
  quoteToken: QuoteToken;
  totalSupply: number;
  initialMarketCap: number;
  migrationMarketCap: number;
  targetQuoteReserve: number;
  orderSize: number;
  impactTargetPercent: number;
  feeBps: number;
  graduatedFeeBps: number;
  compoundingPercent: number;
  lockedLiquidityPercent: number;
}

export const DEFAULT_INPUTS: LaunchInputs = {
  quoteToken: "USDC", totalSupply: 1_000_000_000,
  initialMarketCap: 25_000, migrationMarketCap: 250_000,
  targetQuoteReserve: 50_000, orderSize: 500, impactTargetPercent: 1,
  feeBps: 100, graduatedFeeBps: 30, compoundingPercent: 70,
  lockedLiquidityPercent: 90,
};

export interface CurvePoint {
  progress: number; price: number; reserve: number; soldTokens: number;
}
export interface DepthSample {
  progress: number;
  price: number;
  buyImpact: number | null;
  sellImpact: number | null;
  buyCapacity: number;
  sellCapacity: number;
}
export interface CurveSummary {
  id: string;
  name: string;
  weights: number[];
  sdkValid: boolean;
  validationError: string | null;
  startPrice: number;
  graduationPrice: number;
  quoteReserve: number;
  curveTokens: number;
  migrationTokens: number;
  leftoverTokens: number;
  requiredTokens: number;
  worstBuyImpact: number;
  worstSellImpact: number;
  worstImpact: number;
  averageImpact: number;
  targetMet: boolean;
  chart: CurvePoint[];
  depth: DepthSample[];
  sdkConfig: Record<string, unknown>;
}
export interface GraduationModel {
  quoteReserve: number;
  baseReserve: number;
  protocolMigrationQuoteFee: number;
  protocolMigrationBaseFee: number;
  price: number;
  buyCapacity: number;
  sellCapacity: number;
  buyImpact: number;
  sellImpact: number;
  grossFeeOnOrder: number;
  targetMet: boolean;
  suggestedQuoteReserve: number;
}
export interface DesignResult {
  input: LaunchInputs;
  sdkVersion: string;
  method: string;
  sampledProgress: number[];
  candidatesTested: number;
  feasibleCandidates: number;
  selected: CurveSummary;
  baseline: CurveSummary;
  improvementPercent: number;
  graduation: GraduationModel;
  warnings: string[];
  limitations: string[];
}
export interface TradeQuote {
  direction: Direction;
  progress: number;
  amountIn: number;
  amountOut: number;
  minimumOut: number;
  fee: number;
  protocolFee: number;
  creatorFee: number;
  priceImpact: number;
  currentPrice: number;
  nextPrice: number;
  nextProgress: number;
  inputToken: string;
  outputToken: string;
}
export const formatNumber = (n: number, digits = 2) => Number.isFinite(n)
  ? new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n) : "—";
export const compactNumber = (n: number) => Number.isFinite(n)
  ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n) : "—";
export const formatPrice = (n: number) => Number.isFinite(n)
  ? new Intl.NumberFormat("en-US", { maximumSignificantDigits: 5 }).format(n) : "—";
