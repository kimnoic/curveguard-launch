"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Download, ExternalLink, LoaderCircle, Rocket, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { formatNumber, type DesignResult, type Network } from "@/lib/launch-types";
import { downloadText } from "@/lib/launch-report";
import type { LaunchMetadata, LaunchReceipt, PendingLaunch, WalletProvider } from "@/lib/solana-client";
import { Panel, Notice } from "./shared";
import { AddressLink, NetworkFields, readableError } from "./chain-panel";

export function LaunchPanel({ design: d, stale, fingerprint, walletAddress, provider, connectWallet, inspectReceipt }: {
  design: DesignResult; stale: boolean; fingerprint: string; walletAddress: string; provider: WalletProvider | null;
  connectWallet: () => void; inspectReceipt: (receipt: LaunchReceipt) => void;
}) {
  const [network, setNetwork] = useState<Network>("devnet");
  const [rpc, setRpc] = useState("");
  const [meta, setMeta] = useState<LaunchMetadata>({ name: "", symbol: "", uri: "", devnetUsdcMint: "" });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<{ stage: string; signature: string }[]>([]);
  const [receipt, setReceipt] = useState<LaunchReceipt | null>(null);
  const pending = useRef<PendingLaunch | null>(null);
  const inFlight = useRef(false);
  const locked = busy || !!pending.current;
  const valid = d.selected.sdkValid && !stale;
  const specification = JSON.stringify(d.selected.sdkConfig);
  useEffect(() => { setAccepted(false); }, [specification, network, walletAddress]);
  async function launch() {
    if (inFlight.current || !provider || !accepted || !valid || receipt) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const client = await import("@/lib/solana-client");
      pending.current ??= client.prepareLaunch(d, walletAddress, network, meta);
      const result = await client.executeLaunch(d, pending.current, provider, rpc,
        (n, text) => { setStep(n); setMessage(text); },
        (stage, signature) => setSubmitted(old => [...old.filter(s => s.stage !== stage), { stage, signature }]));
      setReceipt(result);
    } catch (e) { setError(readableError(e)); }
    finally { setBusy(false); inFlight.current = false; }
  }
  const change = (key: keyof LaunchMetadata, value: string) => { setMeta(m => ({ ...m, [key]: value })); setAccepted(false); };
  const txLink = (signature: string) => `https://explorer.solana.com/tx/${signature}${network === "devnet" ? "?cluster=devnet" : ""}`;
  return <div className="wide-grid"><div className="stack"><Panel title="Make your configuration real" subtitle="Create a DBC configuration, then a token and launch pool." index="05"><div className="panel-body">
    <NetworkFields idPrefix="launch" network={network} setNetwork={setNetwork} rpc={rpc} setRpc={setRpc} disabled={locked} />
    <div className="two-fields"><div className="field"><label className="form-label" htmlFor="token-name">Token name</label><Input id="token-name" className="field-input" value={meta.name} onChange={e => change("name", e.target.value)} placeholder="Your project name" maxLength={32} disabled={locked} /></div><div className="field"><label className="form-label" htmlFor="token-symbol">Symbol</label><Input id="token-symbol" className="field-input" value={meta.symbol} onChange={e => change("symbol", e.target.value.toUpperCase())} placeholder="TOKEN" maxLength={10} disabled={locked} /></div></div>
    <div className="field"><label className="form-label" htmlFor="metadata-uri">Metadata URI<span className="muted" style={{ fontWeight: 400 }}>Optional</span></label><Input id="metadata-uri" className="field-input" value={meta.uri} onChange={e => change("uri", e.target.value)} placeholder="https://…/metadata.json" maxLength={200} disabled={locked} /><p className="field-hint">Choose a final, publicly hosted token metadata JSON. This app does not upload files. Metadata update authority is removed at creation.</p></div>
    {network === "devnet" && d.input.quoteToken === "USDC" && <div className="field"><label className="form-label" htmlFor="devnet-usdc">Devnet quote mint</label><Input id="devnet-usdc" className="field-input address-input" value={meta.devnetUsdcMint} onChange={e => change("devnetUsdcMint", e.target.value)} placeholder="Your standard SPL, 6-decimal test mint" disabled={locked} /><p className="field-hint">Mainnet USDC does not exist on devnet. Supply a test quote mint, or select the SOL launch preset in Curve studio.</p></div>}
    {!walletAddress ? <Button className="wallet-button full-width" onClick={connectWallet}><Wallet size={16} />Connect wallet to continue</Button> : <><div className="address">Launching wallet · {walletAddress}</div><label className="checkbox-line" htmlFor="launch-acknowledgment"><Checkbox id="launch-acknowledgment" checked={accepted} onCheckedChange={v => setAccepted(v === true)} disabled={busy || !!receipt} /><span>I reviewed the configuration, creator allocations and irreversible LP locks. I will pay network and account-creation costs and check both transactions in my wallet{network === "mainnet-beta" ? " using real SOL on mainnet" : " on devnet"}.</span></label><Button className="primary-button full-width" onClick={() => void launch()} disabled={!accepted || !valid || busy || !!receipt}>{busy ? <LoaderCircle size={16} className="spin" /> : <Rocket size={16} />}{busy ? "Follow your wallet prompts…" : receipt ? "Pool created" : pending.current ? "Resume this launch" : `Create ${network === "devnet" ? "devnet" : "mainnet"} launch`}</Button></>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {pending.current && !busy && !receipt && <div className="session-reset"><p className="field-hint">Resume uses this session's account signers. Reloading loses them. Any confirmed configuration remains on-chain.</p><Button className="text-button" onClick={() => { pending.current = null; setStep(0); setMessage(""); setSubmitted([]); setError(""); setAccepted(false); }}>Start a new launch session</Button></div>}
  </div></Panel></div><div className="stack">
    <Notice tone={!valid ? "warn" : "success"}>{stale ? "Your inputs have changed. Generate a new curve before launching." : !d.selected.sdkValid ? d.selected.validationError ?? "This configuration is not deployable." : "The selected parameters pass Meteora SDK validation. Network simulation runs before each wallet signature."}</Notice>
    <Panel title="What you are approving" subtitle="Account recipients are always your launching wallet."><div className="panel-body"><div className="stat-list"><div><span>Graduation quote reserve</span><strong>{formatNumber(d.input.targetQuoteReserve)} {d.input.quoteToken}</strong></div><div><span>DBC / graduated trading fee</span><strong>{d.input.feeBps / 100}% / {d.input.graduatedFeeBps / 100}%</strong></div><div><span>Leftover tokens to your wallet</span><strong>{formatNumber(d.selected.leftoverTokens / d.input.totalSupply * 100)}% of supply</strong></div><div><span>LP permanently locked / withdrawable</span><strong>{d.input.lockedLiquidityPercent}% / {100 - d.input.lockedLiquidityPercent}%</strong></div><div><span>LP fee reinvestment</span><strong>{d.input.compoundingPercent}% after protocol fees</strong></div><div><span>CurveGuard creation / migration fee</span><strong>0</strong></div></div><div style={{ marginTop: 22 }}><span className="tiny-label">Reviewed configuration · SHA-256</span><div className="address">{fingerprint || "Calculating…"}</div></div></div></Panel>
    <Panel title="Two transactions. One launch." subtitle={message || "Review parameters here; authorize transactions in your wallet."}><div className="panel-body">{[
      ["Create DBC configuration", "16 curve segments, fee settings, graduation threshold and LP permissions."],
      ["Create token and DBC pool", "Mint and pool creation using your token metadata. No initial token purchase is made."],
      ["Keep your launch receipt", "Inspect your confirmed pool, then share its public addresses and transaction links."],
    ].map(([title, description], i) => <div key={title} className={`launch-step ${step === i + 1 ? "active" : ""} ${step > i + 1 || receipt ? "done" : ""}`}><div className="step-icon">{step > i + 1 || receipt ? <Check size={13} /> : i + 1}</div><div><h3>{title}</h3><p>{description}</p></div></div>)}{submitted.length > 0 && <div className="source-links" style={{ marginTop: 16 }}>{submitted.map(s => <a key={s.stage} href={txLink(s.signature)} target="_blank" rel="noreferrer">{s.stage === "config" ? "Configuration" : "Pool"} transaction <ExternalLink size={12} style={{ display: "inline" }} /></a>)}</div>}</div></Panel>
    {receipt && <Panel title="Your pool is live" subtitle={`Confirmed on ${receipt.network}. Keep this receipt.`}><div className="panel-body"><div className="address-stack"><AddressLink label="DBC pool" value={receipt.pool} network={receipt.network} /><AddressLink label="Base token mint" value={receipt.baseMint} network={receipt.network} /><AddressLink label="Configuration" value={receipt.config} network={receipt.network} /></div><div className="report-actions" style={{ marginTop: 20 }}><Button className="primary-button" onClick={() => inspectReceipt(receipt)}>Inspect pool<ExternalLink size={15} /></Button><Button className="secondary-button" onClick={() => downloadText("curveguard-launch-receipt.json", JSON.stringify({ ...receipt, fingerprint, input: d.input, sdkConfig: d.selected.sdkConfig }, null, 2), "application/json")}><Download size={15} />Receipt</Button></div></div></Panel>}
    <div className="info-card">Transactions are signed in your wallet. CurveGuard never receives your wallet's private key. Account-creation signers stay in browser memory. This flow creates a launch pool; graduation is triggered later by reserve growth and Meteora's migration process.</div>
  </div></div>;
}
