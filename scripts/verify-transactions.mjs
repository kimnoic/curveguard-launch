import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { DynamicBondingCurveClient, DYNAMIC_BONDING_CURVE_PROGRAM_ID } from "@meteora-ag/dynamic-bonding-curve-sdk";

// Offline verification: all RPC methods used below are mocked. Nothing is sent.
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, ".sites-runtime", "verification");
fs.mkdirSync(output, { recursive: true });
for (const name of ["launch-types", "curve-config", "launch-engine", "solana-client"]) {
  const source = fs.readFileSync(path.join(root, "lib", `${name}.ts`), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replaceAll('"./curve-config"', '"./curve-config.mjs"').replaceAll('"./launch-types"', '"./launch-types.mjs"');
  fs.writeFileSync(path.join(output, `${name}.mjs`), compiled);
}
const { designLaunch } = await import(path.join(output, "launch-engine.mjs"));
const { compileCurve } = await import(path.join(output, "curve-config.mjs"));
const { DEFAULT_INPUTS } = await import(path.join(output, "launch-types.mjs"));
const { prepareLaunch, executeLaunch, rpcConnection } = await import(path.join(output, "solana-client.mjs"));
const input = { ...DEFAULT_INPUTS, quoteToken: "SOL", initialMarketCap: 5, migrationMarketCap: 50, targetQuoteReserve: 10, orderSize: .1 };
const d = designLaunch(input);
const wallet = Keypair.generate();
const meta = { name: "CurveGuard Test", symbol: "CGTEST", uri: "", devnetUsdcMint: "" };
const configState = { ...compileCurve(input, d.selected.weights).poolConfig, tokenType: 0, quoteMint: new PublicKey("So11111111111111111111111111111111111111112") };
let pending, sends = 0, simulations = 0, walletPrompts = 0, rejectNextPool = false, wrongNetwork = false, decimals = 9;
const accounts = new Map();
const packetSizes = [];
const originals = new Map();
function mock(name, method) { originals.set(name, Connection.prototype[name]); Connection.prototype[name] = method; }
const originalCreate = DynamicBondingCurveClient.create;
DynamicBondingCurveClient.create = (...args) => {
  const client = originalCreate(...args);
  // Stand-in for the confirmed config-account read; real instruction construction remains unchanged.
  client.creator.getPoolConfigForNewPool = async () => configState;
  return client;
};
const provider = {
  publicKey: wallet.publicKey,
  async signTransaction(tx) {
    walletPrompts++;
    if (rejectNextPool && walletPrompts === 2) throw new Error("Wallet declined the pool transaction.");
    tx.partialSign(wallet); return tx;
  },
};
mock("getGenesisHash", async () => wrongNetwork ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" : "EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
mock("getParsedAccountInfo", async () => ({ context: { slot: 1 }, value: { owner: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), data: { parsed: { type: "mint", info: { decimals } } } } }));
mock("getAccountInfo", async key => key.equals(configState.quoteMint) ? { owner: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), executable: false, lamports: 1, data: Buffer.alloc(82) } : accounts.get(key.toBase58()) ?? null);
mock("getLatestBlockhash", async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 999 }));
mock("simulateTransaction", async tx => { simulations++; assert.ok(tx.instructions.length >= 2); return { context: { slot: 1 }, value: { err: null } }; });
mock("sendRawTransaction", async bytes => {
  const tx = Transaction.from(bytes);
  assert.ok(tx.verifySignatures());
  assert.ok(bytes.length <= 1232, `Packet is ${bytes.length} bytes`);
  packetSizes.push(bytes.length); sends++;
  const ix = tx.instructions.find(ix => ix.programId.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID));
  assert.ok(ix, "A real DBC instruction is present");
  for (const k of ix.keys) if (k.isSigner && !k.pubkey.equals(wallet.publicKey)) accounts.set(k.pubkey.toBase58(), { owner: DYNAMIC_BONDING_CURVE_PROGRAM_ID });
  // Config has one init signer; pool is a PDA, recorded from the built instruction.
  if (sends > 1) for (const k of ix.keys) if (k.isWritable && !k.isSigner) accounts.set(k.pubkey.toBase58(), { owner: DYNAMIC_BONDING_CURVE_PROGRAM_ID });
  return `${wallet.publicKey.toBase58()}${wallet.publicKey.toBase58()}`;
});
mock("getSignatureStatuses", async () => ({ context: { slot: 1 }, value: [{ confirmationStatus: "confirmed", err: null }] }));
try {
  assert.throws(() => rpcConnection("devnet", "http://example.com"));
  assert.throws(() => prepareLaunch(d, wallet.publicKey.toBase58(), "devnet", { ...meta, name: "" }));
  assert.throws(() => prepareLaunch(designLaunch(DEFAULT_INPUTS), wallet.publicKey.toBase58(), "devnet", meta));
  pending = prepareLaunch(d, wallet.publicKey.toBase58(), "devnet", meta);
  await assert.rejects(() => executeLaunch(d, pending, { ...provider, publicKey: Keypair.generate().publicKey }, "", () => {}, () => {}), /original launching wallet/);
  wrongNetwork = true;
  await assert.rejects(() => executeLaunch(d, pending, provider, "", () => {}, () => {}), /not devnet/);
  wrongNetwork = false; decimals = 6;
  await assert.rejects(() => executeLaunch(d, pending, provider, "", () => {}, () => {}), /decimals/);
  decimals = 9;
  const changed = designLaunch({ ...input, feeBps: 200 });
  await assert.rejects(() => executeLaunch(changed, pending, provider, "", () => {}, () => {}), /configuration changed/);
  assert.equal(walletPrompts, 0);
  rejectNextPool = true;
  await assert.rejects(() => executeLaunch(d, pending, provider, "", () => {}, () => {}), /Wallet declined/);
  assert.equal(sends, 1);
  assert.ok(pending.configSignature);
  assert.equal(pending.poolSignature, undefined);
  rejectNextPool = false;
  const steps = [];
  const receipt = await executeLaunch(d, pending, provider, "", (step, text) => steps.push([step, text]), () => {});
  assert.equal(sends, 2, "Resume must not recreate the config");
  assert.equal(receipt.config, pending.configKeypair.publicKey.toBase58());
  assert.equal(receipt.baseMint, pending.baseMintKeypair.publicKey.toBase58());
  assert.ok(receipt.poolSignature && receipt.configSignature);
  assert.equal(steps.at(-1)[0], 3);
  assert.equal(simulations, 3, "Each attempted wallet transaction must be simulated first");
  console.log(JSON.stringify({ status: "passed", offline: true, packetSizes, sends, walletPrompts, coverage: ["real SDK instruction encoding", "valid signed packets", "1232-byte packet limit", "genesis guard", "quote-mint precision", "reviewed configuration binding", "wallet account binding", "simulation before signature", "resume after second transaction declined"] }));
} finally {
  for (const [name, original] of originals) Connection.prototype[name] = original;
  DynamicBondingCurveClient.create = originalCreate;
}
