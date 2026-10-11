import { Buffer } from "buffer";
import BN from "bn.js";
import { Connection, PublicKey, Keypair, Transaction, ComputeBudgetProgram, clusterApiUrl, type Signer } from "@solana/web3.js";
import {
  DynamicBondingCurveClient, DYNAMIC_BONDING_CURVE_PROGRAM_ID, DAMM_V2_PROGRAM_ID,
  DAMM_V2_MIGRATION_FEE_ADDRESS, deriveDbcPoolAddress, deriveDammV2PoolAddress,
  createDammV2Program, convertToLamports, getPriceFromSqrtPrice, getCurrentPoint,
  swapQuoteExactIn,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { compileCurve, toSerializable } from "./curve-config";
import type { DesignResult, LaunchInputs, Network } from "./launch-types";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const GENESIS_PREFIX = { devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1", "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" };

export interface WalletProvider {
  publicKey?: { toBase58(): string } | null;
  isPhantom?: boolean;
  connect(): Promise<{ publicKey?: { toBase58(): string } } | void>;
  disconnect(): Promise<void>;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}
export function walletProvider(name: "Phantom" | "Solflare"): WalletProvider | null {
  const w = window as unknown as { phantom?: { solana?: WalletProvider }; solana?: WalletProvider; solflare?: WalletProvider };
  return name === "Phantom" ? w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null) : w.solflare ?? null;
}
export function defaultRpc(network: Network) { return clusterApiUrl(network); }
export function explorerUrl(kind: "address" | "tx", value: string, network: Network) {
  return `https://explorer.solana.com/${kind}/${encodeURIComponent(value)}${network === "devnet" ? "?cluster=devnet" : ""}`;
}
export function rpcConnection(network: Network, rpc: string) {
  const runtime = globalThis as unknown as { Buffer?: typeof Buffer };
  runtime.Buffer ??= Buffer;
  const endpoint = rpc.trim() || defaultRpc(network);
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Use an HTTPS RPC endpoint, or localhost for development.");
  }
  return new Connection(endpoint, { commitment: "confirmed", disableRetryOnRateLimit: true });
}
async function checkNetwork(connection: Connection, network: Network) {
  const genesis = await connection.getGenesisHash();
  if (!genesis.startsWith(GENESIS_PREFIX[network])) throw new Error(`The RPC endpoint is not ${network}. Check your network settings.`);
}
async function mintDecimals(connection: Connection, mint: PublicKey) {
  const result = await connection.getParsedAccountInfo(mint, "confirmed");
  if (!result.value || result.value.owner.toBase58() !== TOKEN_PROGRAM) throw new Error("This launch supports standard SPL quote mints only.");
  const data = result.value.data;
  if (!("parsed" in data) || data.parsed.type !== "mint") throw new Error("The quote address is not an SPL mint.");
  const decimals = Number(data.parsed.info.decimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) throw new Error("Unsupported token precision.");
  return decimals;
}
const amount = (v: BN, decimals: number) => Number(v.toString()) / 10 ** decimals;

export interface LaunchMetadata { name: string; symbol: string; uri: string; devnetUsdcMint: string }
export interface PendingLaunch {
  configKeypair: Keypair;
  baseMintKeypair: Keypair;
  owner: string;
  network: Network;
  specification: string;
  metadata: LaunchMetadata;
  quoteMint: PublicKey;
  configSignature?: string;
  poolSignature?: string;
}
export interface LaunchReceipt { pool: string; config: string; baseMint: string; network: Network; configSignature: string; poolSignature: string }

/** Account-init signers are ephemeral and never stored or transmitted as secrets. */
export function prepareLaunch(d: DesignResult, owner: string, network: Network, meta: LaunchMetadata): PendingLaunch {
  if (!d.selected.sdkValid) throw new Error("Generate a deployable configuration first.");
  if (!meta.name.trim() || new TextEncoder().encode(meta.name.trim()).length > 32) throw new Error("Token name must be 1–32 UTF-8 bytes.");
  if (!/^[A-Za-z0-9]{1,10}$/.test(meta.symbol)) throw new Error("Symbol must be 1–10 letters or numbers.");
  if (new TextEncoder().encode(meta.uri).length > 200 || (meta.uri && !/^(https:\/\/|ipfs:\/\/|ar:\/\/)/.test(meta.uri))) throw new Error("Metadata URI must be HTTPS, IPFS or Arweave, and at most 200 UTF-8 bytes.");
  const quote = d.input.quoteToken === "SOL" ? SOL_MINT : network === "mainnet-beta" ? USDC_MINT : meta.devnetUsdcMint;
  if (!quote) throw new Error("Provide your 6-decimal devnet USDC mint, or generate a SOL launch configuration.");
  return { configKeypair: Keypair.generate(), baseMintKeypair: Keypair.generate(), owner, network,
    specification: JSON.stringify(d.selected.sdkConfig), metadata: { ...meta }, quoteMint: new PublicKey(quote) };
}

async function submit(connection: Connection, provider: WalletProvider, payer: PublicKey, tx: Transaction,
  signers: Signer[], onUpdate: (message: string) => void, onSubmitted: (signature: string) => void) {
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = payer; tx.recentBlockhash = latest.blockhash;
  tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));
  tx.partialSign(...signers);
  const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  if (bytes.length > 1232) throw new Error("This transaction exceeds Solana's packet limit. Reduce metadata size or use the source SDK integration.");
  onUpdate("Checking the transaction against the selected network…");
  const simulation = await connection.simulateTransaction(tx);
  if (simulation.value.err) throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}. Check SOL balance, quote mint and configuration.`);
  if (provider.publicKey?.toBase58() !== payer.toBase58()) throw new Error("Your wallet account changed. Reconnect and start again.");
  onUpdate("Review and sign this transaction in your wallet.");
  const signed = await provider.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 2, preflightCommitment: "confirmed" });
  onSubmitted(signature); onUpdate("Transaction submitted. Waiting for confirmation…");
  // HTTP polling avoids a required websocket connection on hosted or restricted clients.
  for (let i = 0; i < 22; i++) {
    const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = value[0];
    if (status?.err) throw new Error(`The transaction was rejected: ${JSON.stringify(status.err)}.`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return signature;
    await new Promise(resolve => setTimeout(resolve, 1400));
  }
  throw new Error("The transaction was submitted but confirmation is still pending. Check its explorer link before retrying.");
}

export async function executeLaunch(d: DesignResult, pending: PendingLaunch, provider: WalletProvider, rpc: string,
  onStep: (step: number, message: string) => void, onSubmitted: (stage: "config" | "pool", signature: string) => void): Promise<LaunchReceipt> {
  if (provider.publicKey?.toBase58() !== pending.owner) throw new Error("Reconnect the original launching wallet.");
  if (JSON.stringify(d.selected.sdkConfig) !== pending.specification) throw new Error("The configuration changed. Generate a new launch session.");
  const connection = rpcConnection(pending.network, rpc);
  await checkNetwork(connection, pending.network);
  const payer = new PublicKey(pending.owner);
  const decimals = await mintDecimals(connection, pending.quoteMint);
  if (decimals !== (d.input.quoteToken === "SOL" ? 9 : 6)) throw new Error("Quote mint decimals do not match this configuration.");
  const b = compileCurve(d.input, d.selected.weights);
  if (b.validationError) throw new Error(b.validationError);
  if (JSON.stringify(toSerializable(b.params)) !== pending.specification) throw new Error("Compiled parameters do not match the reviewed specification.");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const config = pending.configKeypair.publicKey, baseMint = pending.baseMintKeypair.publicKey;
  const pool = deriveDbcPoolAddress(pending.quoteMint, baseMint, config);
  const existingConfig = await connection.getAccountInfo(config, "confirmed");
  if (!existingConfig) {
    onStep(1, "Creating the DBC configuration…");
    const tx = await client.partner.createConfig({ ...b.params, config, feeClaimer: payer,
      leftoverReceiver: payer, quoteMint: pending.quoteMint, payer });
    pending.configSignature = await submit(connection, provider, payer, tx, [pending.configKeypair],
      message => onStep(1, message), signature => { pending.configSignature = signature; onSubmitted("config", signature); });
  } else if (!existingConfig.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)) throw new Error("The configuration account has an unexpected owner.");
  onStep(2, "Configuration is ready. Preparing token and pool creation…");
  const existingPool = await connection.getAccountInfo(pool, "confirmed");
  if (!existingPool) {
    const tx = await client.creator.createPool({ config, baseMint, payer, poolCreator: payer,
      name: pending.metadata.name.trim(), symbol: pending.metadata.symbol, uri: pending.metadata.uri.trim() });
    pending.poolSignature = await submit(connection, provider, payer, tx, [pending.baseMintKeypair],
      message => onStep(2, message), signature => { pending.poolSignature = signature; onSubmitted("pool", signature); });
  } else if (!existingPool.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)) throw new Error("The pool account has an unexpected owner.");
  onStep(3, "The DBC pool is live on the selected network.");
  return { pool: pool.toBase58(), config: config.toBase58(), baseMint: baseMint.toBase58(), network: pending.network,
    configSignature: pending.configSignature ?? "", poolSignature: pending.poolSignature ?? "" };
}

export interface PoolSnapshot {
  address: string; config: string; creator: string; baseMint: string; quoteMint: string;
  network: Network; slot: number; fetchedAt: string; status: string; progress: number;
  quoteSymbol: string; quoteReserve: number; graduationReserve: number; price: number;
  totalTradingQuoteFee: number; buyCapacity: number | null; sellCapacity: number | null;
  lockedLiquidityPercent: number; compoundingPercent: number;
  notes: string[];
  damm: null | { address: string; quoteReserve: number; baseReserve: number; price: number;
    buyCapacity: number | null; sellCapacity: number | null; compoundingPercent: number };
}

export async function inspectPool(address: string, network: Network, rpc: string, targetImpactPercent: number): Promise<PoolSnapshot> {
  const connection = rpcConnection(network, rpc);
  await checkNetwork(connection, network);
  const publicKey = new PublicKey(address);
  const account = await connection.getAccountInfoAndContext(publicKey, "confirmed");
  if (!account.value || !account.value.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)) throw new Error("This address is not a Meteora DBC pool on the selected network.");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const pool = await client.state.getPool(publicKey);
  if (!pool) throw new Error("No supported DBC pool was found.");
  const state = pool.poolState;
  const config = await client.state.getPoolConfig(state.config);
  if (!config) throw new Error("The DBC configuration could not be read.");
  const quoteDecimal = await mintDecimals(connection, config.quoteMint);
  const baseDecimal = config.tokenDecimal;
  const quoteSymbol = config.quoteMint.toBase58() === SOL_MINT ? "SOL" : config.quoteMint.toBase58() === USDC_MINT ? "USDC" : "QUOTE";
  const price = getPriceFromSqrtPrice(state.sqrtPrice, baseDecimal, quoteDecimal).toNumber();
  const reserve = amount(state.quoteReserve, quoteDecimal);
  const threshold = amount(config.migrationQuoteThreshold, quoteDecimal);
  const progress = Math.min(100, reserve / threshold * 100);
  const notes: string[] = ["Confirmed accounts are fetched sequentially; this is a snapshot, not an atomic multi-account quote.",
    "Price-impact capacities exclude fees and are estimated by bounded quote searches. They are not executable trade quotes."];
  const current = await getCurrentPoint(connection, config.activationType);
  const active = state.isMigrated === 0 && state.quoteReserve.lt(config.migrationQuoteThreshold);
  const supportsDepth = active && config.tokenType === 0 && config.collectFeeMode === 0 && config.poolFees.baseFee.baseFeeMode !== 2;
  function impact(value: number, sell: boolean) {
    try {
      const input = convertToLamports(sell ? value / price : value, sell ? baseDecimal : quoteDecimal);
      if (input.isZero()) return Infinity;
      const q = swapQuoteExactIn(pool!, config!, sell, input, 0, false, current, false);
      const output = amount(q.outputAmount, sell ? quoteDecimal : baseDecimal);
      const fee = amount(q.protocolFee.add(q.tradingFee), quoteDecimal);
      return sell ? (1 - (output + fee) / (value / price) / price) * 100 : ((value - fee) / output / price - 1) * 100;
    } catch { return Infinity; }
  }
  function capacity(sell: boolean) {
    let low = 0, high = Math.max(threshold, reserve) * 2;
    for (let i = 0; i < 22; i++) { const mid = (low + high) / 2; if (impact(mid, sell) <= targetImpactPercent) low = mid; else high = mid; }
    return low;
  }
  if (!supportsDepth && active) notes.push("Capacity quotes are available for quote-fee SPL pools with standard fee scheduling. This pool uses an unsupported mode.");
  const status = state.isMigrated ? "Graduated" : !active ? "Ready to migrate" : "Bonding curve active";
  const snapshot: PoolSnapshot = {
    address, network, slot: account.context.slot, fetchedAt: new Date().toISOString(),
    config: state.config.toBase58(), creator: state.creator.toBase58(), baseMint: state.baseMint.toBase58(), quoteMint: config.quoteMint.toBase58(),
    status, progress, quoteSymbol, quoteReserve: reserve, graduationReserve: threshold, price,
    totalTradingQuoteFee: amount(state.metrics.totalTradingQuoteFee, quoteDecimal),
    buyCapacity: supportsDepth ? capacity(false) : null, sellCapacity: supportsDepth ? capacity(true) : null,
    lockedLiquidityPercent: config.creatorPermanentLockedLiquidityPercentage + config.partnerPermanentLockedLiquidityPercentage,
    compoundingPercent: config.migratedCompoundingFeeBps / 100, notes, damm: null,
  };
  if (state.isMigrated) {
    const feeConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption];
    if (feeConfig) {
      const dammAddress = deriveDammV2PoolAddress(feeConfig, state.baseMint, config.quoteMint);
      const info = await connection.getAccountInfo(dammAddress, "confirmed");
      if (info?.owner.equals(DAMM_V2_PROGRAM_ID)) {
        const program = createDammV2Program(connection);
        const dp = await program.account.pool.fetch(dammAddress);
        const quoteIsB = dp.tokenBMint.equals(config.quoteMint);
        const tokensMatch = (quoteIsB && dp.tokenAMint.equals(state.baseMint)) ||
          (dp.tokenAMint.equals(config.quoteMint) && dp.tokenBMint.equals(state.baseMint));
        if (tokensMatch) {
          const q = amount(quoteIsB ? dp.tokenBAmount : dp.tokenAAmount, quoteDecimal);
          const a = amount(quoteIsB ? dp.tokenAAmount : dp.tokenBAmount, baseDecimal);
          const eps = targetImpactPercent / 100;
          snapshot.damm = { address: dammAddress.toBase58(), quoteReserve: q, baseReserve: a,
            price: a > 0 ? q / a : 0, buyCapacity: dp.collectFeeMode === 2 ? q * eps : null,
            sellCapacity: dp.collectFeeMode === 2 ? q * eps / (1 - eps) : null,
            compoundingPercent: dp.poolFees.compoundingFeeBps / 100 };
          snapshot.notes.push("DAMM capacity is a fee-excluded full-range reserve estimate, available for compounding pools. It does not include dynamic fees or routing.");
        }
      } else snapshot.notes.push("The graduated DAMM account could not be resolved through the standard migration fee configuration.");
    }
  }
  return snapshot;
}
