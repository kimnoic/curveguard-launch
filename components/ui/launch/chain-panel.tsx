"use client";
import { useRef, useState } from "react";
import { Activity, ExternalLink, LoaderCircle, Search, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber, formatPrice, type Network } from "@/lib/launch-types";
import type { PoolSnapshot } from "@/lib/solana-client";
import { Panel, Metric, Notice } from "./shared";

export function readableError(error: unknown) {
  return (error instanceof Error ? error.message : "The request failed. Please try again.").replace(/https?:\/\/[^\s"']+/g, "RPC endpoint").slice(0, 420);
}
export function NetworkFields({ network, setNetwork, rpc, setRpc, disabled = false, idPrefix = "inspect" }: {
  network: Network; setNetwork: (n: Network) => void; rpc: string; setRpc: (v: string) => void; disabled?: boolean; idPrefix?: string;
}) {
  return <><div className="network-select" role="group" aria-label="Solana network">{(["devnet", "mainnet-beta"] as Network[]).map(n => <Button key={n} type="button" className={`network-option ${network === n ? "active" : ""}`} disabled={disabled} aria-pressed={network === n} onClick={() => setNetwork(n)}><span className={`network-dot ${n}`} />{n === "devnet" ? "Devnet" : "Mainnet"}</Button>)}</div><div className="field"><label className="form-label" htmlFor={`${idPrefix}-rpc-endpoint`}>RPC endpoint<span className="muted" style={{ fontWeight: 400 }}>Optional</span></label><Input id={`${idPrefix}-rpc-endpoint`} className="field-input address-input" type="url" placeholder={network === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com"} value={rpc} onChange={e => setRpc(e.target.value)} disabled={disabled} autoComplete="off" /><p className="field-hint">Used directly in your browser. Public RPCs can limit traffic; use a browser-safe endpoint for reliable access.</p></div></>;
}
const link = (kind: string, value: string, network: Network) => `https://explorer.solana.com/${kind}/${encodeURIComponent(value)}${network === "devnet" ? "?cluster=devnet" : ""}`;
export function AddressLink({ label, value, network }: { label: string; value: string; network: Network }) {
  return <div className="address-row"><span className="tiny-label">{label}</span><a className="address address-link" href={link("address", value, network)} target="_blank" rel="noreferrer">{value}<ExternalLink size={13} /></a></div>;
}
export function ChainPanel({ impactTarget, initialAddress = "", initialNetwork = "devnet" }: { impactTarget: number; initialAddress?: string; initialNetwork?: Network }) {
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const [rpc, setRpc] = useState("");
  const [address, setAddress] = useState(initialAddress);
  const [snapshot, setSnapshot] = useState<PoolSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState(impactTarget);
  const inFlight = useRef(false);
  async function inspect() {
    if (inFlight.current) return;
    if (!address.trim()) { setError("Enter a DBC pool address."); return; }
    if (!Number.isFinite(target) || target < .1 || target > 10) { setError("Impact target must be between 0.1% and 10%."); return; }
    inFlight.current = true; setBusy(true); setError(""); setSnapshot(null);
    try { const { inspectPool } = await import("@/lib/solana-client"); setSnapshot(await inspectPool(address.trim(), network, rpc, target)); }
    catch (e) { setError(readableError(e)); } finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="wide-grid"><div className="stack"><Panel title="Look beyond the launch" subtitle="Read confirmed DBC accounts from your selected network." index="04"><form className="panel-body" onSubmit={e => { e.preventDefault(); void inspect(); }}><NetworkFields network={network} setNetwork={setNetwork} rpc={rpc} setRpc={setRpc} disabled={busy} /><div className="field"><label className="form-label" htmlFor="pool-address">DBC pool address</label><Input id="pool-address" className="field-input address-input" placeholder="Paste a Meteora DBC pool address" value={address} onChange={e => setAddress(e.target.value)} disabled={busy} required autoComplete="off" /></div><div className="field"><label className="form-label" htmlFor="live-impact">Price-impact target</label><div className="input-unit"><Input id="live-impact" className="field-input" type="number" min={.1} max={10} step={.1} value={Number.isFinite(target) ? target : ""} onChange={e => setTarget(e.target.value === "" ? NaN : Number(e.target.value))} required disabled={busy} /><span className="unit">%</span></div></div><Button className="primary-button full-width" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}{busy ? "Reading pool accounts…" : "Inspect on-chain pool"}</Button>{error && <p className="inline-error" role="alert">{error}</p>}</form></Panel><div className="info-card"><strong>Bring your own pool.</strong><br />This view reads real reserves, earned quote fees, creator permissions and migration status. Once graduated, it also attempts to resolve the DAMM v2 pool. No wallet connection is needed.</div></div><div className="stack">{!snapshot ? <div className="empty-state"><div className="empty-icon"><Activity size={27} /></div><h3>{busy ? "Fetching confirmed accounts" : "Your pool's next chapter"}</h3><p>{busy ? "Checking the network, DBC configuration and available depth." : "Paste a pool address to inspect its actual state. Your curve studio design stays separate from these on-chain readings."}</p></div> : <>
    <div className="live-metrics"><Metric label="DBC quote reserve" value={formatNumber(snapshot.quoteReserve)} unit={snapshot.quoteSymbol} caption={`${formatNumber(snapshot.progress, 1)}% of graduation threshold`} icon={Waves} /><Metric label="Current spot price" value={formatPrice(snapshot.price)} unit={snapshot.quoteSymbol} caption="From DBC square-root price" /><Metric label="Recorded quote fees" value={formatNumber(snapshot.totalTradingQuoteFee)} unit={snapshot.quoteSymbol} caption="Cumulative trading-fee metric" /></div>
    <Panel title={snapshot.status} subtitle={`Confirmed snapshot · slot ${snapshot.slot.toLocaleString("en-US")} · ${new Date(snapshot.fetchedAt).toLocaleTimeString("en-US", { timeZone: "UTC" })} UTC`} action={<span className="mini-tag">{snapshot.network === "devnet" ? "Devnet" : "Mainnet"}</span>}><div className="panel-body"><div className="pool-progress"><span style={{ width: `${Math.min(100, snapshot.progress)}%` }} /></div><div className="stat-list"><div><span>Graduation threshold</span><strong>{formatNumber(snapshot.graduationReserve)} {snapshot.quoteSymbol}</strong></div><div><span>Buy capacity at {target}% impact</span><strong>{snapshot.buyCapacity === null ? "Unavailable" : `${formatNumber(snapshot.buyCapacity)} ${snapshot.quoteSymbol}`}</strong></div><div><span>Sell capacity at {target}% impact</span><strong>{snapshot.sellCapacity === null ? "Unavailable" : `${formatNumber(snapshot.sellCapacity)} ${snapshot.quoteSymbol}`}</strong></div><div><span>Permanently locked LP</span><strong>{snapshot.lockedLiquidityPercent}%</strong></div><div><span>Configured LP fee reinvestment</span><strong>{snapshot.compoundingPercent}%</strong></div></div><div className="address-stack"><AddressLink label="DBC pool" value={snapshot.address} network={snapshot.network} /><AddressLink label="Configuration" value={snapshot.config} network={snapshot.network} /><AddressLink label="Creator" value={snapshot.creator} network={snapshot.network} /></div></div></Panel>
    {snapshot.damm && <Panel title="Graduated DAMM v2 liquidity" subtitle="Measured reserves, separate from the pre-launch model."><div className="panel-body"><div className="stat-list"><div><span>Quote reserve</span><strong>{formatNumber(snapshot.damm.quoteReserve)} {snapshot.quoteSymbol}</strong></div><div><span>Base reserve</span><strong>{formatNumber(snapshot.damm.baseReserve)} TOKEN</strong></div><div><span>Reserve-ratio price</span><strong>{formatPrice(snapshot.damm.price)} {snapshot.quoteSymbol}</strong></div><div><span>Net buy capacity at {target}% impact</span><strong>{snapshot.damm.buyCapacity === null ? "Unavailable" : `${formatNumber(snapshot.damm.buyCapacity)} ${snapshot.quoteSymbol}`}</strong></div><div><span>Net sell capacity at {target}% impact</span><strong>{snapshot.damm.sellCapacity === null ? "Unavailable" : `${formatNumber(snapshot.damm.sellCapacity)} ${snapshot.quoteSymbol}`}</strong></div><div><span>LP fee reinvestment</span><strong>{snapshot.damm.compoundingPercent}%</strong></div></div><div style={{ marginTop: 20 }}><AddressLink label="DAMM v2 pool" value={snapshot.damm.address} network={snapshot.network} /></div></div></Panel>}
    <Notice>{snapshot.notes.join(" ")}</Notice>
  </>}</div></div>;
}
