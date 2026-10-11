"use client";
import { useEffect, useRef, useState } from "react";
import { Activity, ArrowDownUp, ArrowRight, BookOpen, ChartNoAxesCombined, CheckCheck, Code2, FileText, Gauge, GitCompareArrows, LoaderCircle, Rocket, Upload, Wallet, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CurveChart } from "@/components/launch/curve-chart";
import { InputPanel } from "@/components/launch/input-panel";
import { GraduationPanel } from "@/components/launch/graduation-panel";
import { ChainPanel, readableError } from "@/components/launch/chain-panel";
import { LaunchPanel } from "@/components/launch/launch-panel";
import { ReportPanel } from "@/components/launch/report-panel";
import { Metric, Notice, NumberField, Panel, formatImpact } from "@/components/launch/shared";
import { configFingerprint } from "@/lib/launch-report";
import { formatNumber, compactNumber, type DesignResult, type Direction, type LaunchInputs, type TradeQuote } from "@/lib/launch-types";
import type { LaunchReceipt, WalletProvider } from "@/lib/solana-client";

async function requestDesign(input: unknown, signal?: AbortSignal): Promise<DesignResult> {
  const response = await fetch("/api/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
  const value = await response.json() as DesignResult & { error?: string };
  if (!response.ok) throw new Error(value.error || "The configuration could not be generated.");
  return value;
}
export default function LaunchApp({ initialDesign, initialQuote }: { initialDesign: DesignResult; initialQuote: TradeQuote }) {
  const [input, setInput] = useState(initialDesign.input);
  const [design, setDesign] = useState(initialDesign);
  const [preset, setPreset] = useState("Community");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("studio");
  const [fingerprint, setFingerprint] = useState("");
  const [progress, setProgress] = useState(50);
  const [direction, setDirection] = useState<Direction>("buy");
  const [order, setOrder] = useState(initialDesign.input.orderSize);
  const [slippage, setSlippage] = useState(1);
  const [quote, setQuote] = useState<TradeQuote | null>(initialQuote);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [provider, setProvider] = useState<WalletProvider | null>(null);
  const [receipt, setReceipt] = useState<LaunchReceipt | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef<AbortController | null>(null);
  const firstQuote = useRef(true);
  const webState = useRef({ input, design, busy, error, quote });
  webState.current = { input, design, busy, error, quote };
  const stale = JSON.stringify(input) !== JSON.stringify(design.input);
  const c = design.input, s = design.selected;

  function applyDesign(next: DesignResult) {
    setDesign(next); setInput(next.input); setOrder(next.input.orderSize); setError("");
    setQuote(null); setQuoteError("");
  }
  async function generate() {
    generation.current?.abort();
    const abort = new AbortController(); generation.current = abort;
    setBusy(true); setError("");
    try {
      if (Object.values(input).some(v => typeof v === "number" && !Number.isFinite(v))) throw new Error("Complete all numeric fields before generating.");
      const next = await requestDesign(input, abort.signal);
      if (!abort.signal.aborted) applyDesign(next);
    } catch (e) { if (!abort.signal.aborted) setError(readableError(e)); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  useEffect(() => () => generation.current?.abort(), []);
  useEffect(() => {
    let active = true; setFingerprint("");
    void configFingerprint(design.selected.sdkConfig).then(v => { if (active) setFingerprint(v); }).catch(() => { if (active) setFingerprint("SHA-256 is unavailable in this browser."); });
    return () => { active = false; };
  }, [design]);
  useEffect(() => {
    if (firstQuote.current) { firstQuote.current = false; return; }
    const abort = new AbortController();
    setQuote(null); setQuoteError(""); setQuoteBusy(true);
    const timer = setTimeout(async () => {
      try {
        if (!Number.isFinite(order) || order <= 0 || !Number.isFinite(slippage) || slippage < 0 || slippage > 50) throw new Error("Enter a positive order and slippage between 0% and 50%.");
        const spot = design.selected.chart[Math.round(progress / 1.25)].price;
        const amount = direction === "buy" ? order : order / spot;
        const response = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ input: design.input, weights: design.selected.weights, progress, direction, amount, slippageBps: Math.round(slippage * 100) }) });
        const value = await response.json() as TradeQuote & { error?: string };
        if (!response.ok) throw new Error(value.error || "The quote could not be calculated.");
        if (!abort.signal.aborted) setQuote(value);
      } catch (e) { if (!abort.signal.aborted) setQuoteError(readableError(e)); }
      finally { if (!abort.signal.aborted) setQuoteBusy(false); }
    }, 220);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [design, progress, direction, order, slippage]);
  useEffect(() => {
    if (!provider) return;
    const accountChanged = (key: unknown) => {
      const next = key && typeof key === "object" && "toBase58" in key ? (key as { toBase58(): string }).toBase58() : "";
      setWalletAddress(next);
    };
    const disconnected = () => { setWalletAddress(""); setProvider(null); };
    provider.on?.("accountChanged", accountChanged); provider.on?.("disconnect", disconnected);
    return () => { provider.removeListener?.("accountChanged", accountChanged); provider.removeListener?.("disconnect", disconnected); };
  }, [provider]);
  async function connect(name: "Phantom" | "Solflare") {
    if (walletBusy) return;
    setWalletBusy(true); setWalletError("");
    try {
      const { walletProvider } = await import("@/lib/solana-client");
      const next = walletProvider(name);
      if (!next) throw new Error(`${name} was not detected. Install it or open this site in your wallet's browser.`);
      const result = await next.connect();
      const address = next.publicKey?.toBase58() || result?.publicKey?.toBase58();
      if (!address) throw new Error("The wallet did not return an account.");
      setProvider(next); setWalletAddress(address); setWalletOpen(false);
    } catch (e) { setWalletError(readableError(e)); } finally { setWalletBusy(false); }
  }
  async function disconnect() {
    try { await provider?.disconnect(); setProvider(null); setWalletAddress(""); setWalletOpen(false); }
    catch (e) { setWalletError(readableError(e)); }
  }
  async function importSettings(file: File) {
    generation.current?.abort();
    const abort = new AbortController(); generation.current = abort;
    setBusy(true); setError(""); setTab("studio");
    try {
      if (file.size > 64000) throw new Error("Use a configuration JSON file smaller than 64 KB.");
      const data = JSON.parse(await file.text()) as { input?: LaunchInputs };
      const next = await requestDesign(data.input ?? data, abort.signal);
      if (!abort.signal.aborted) { applyDesign(next); setPreset("Imported"); }
    } catch (e) { if (!abort.signal.aborted) setError(readableError(e)); }
    finally { if (!abort.signal.aborted) setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  useEffect(() => {
    type Context = { registerTool: (tool: Record<string, unknown>, options: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: Context }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const number = (minimum: number, maximum: number, integer = false) => ({ type: integer ? "integer" : "number", minimum, maximum });
    try {
      void Promise.resolve(context.registerTool({ name: "design_curveguard_launch", title: "Design a CurveGuard launch", description: "Generate a modeled Meteora DBC configuration and stage it in the curve studio. Does not connect wallets or submit transactions.", annotations: { readOnlyHint: false, untrustedContentHint: false },
        inputSchema: { type: "object", additionalProperties: false, required: Object.keys(initialDesign.input), properties: { quoteToken: { type: "string", enum: ["USDC", "SOL"] }, totalSupply: number(1000, 1e10), initialMarketCap: number(.01, 1e9), migrationMarketCap: number(.02, 1e10), targetQuoteReserve: number(.001, 1e8), orderSize: number(.000001, 1e7), impactTargetPercent: number(.1, 10), feeBps: number(25, 1000, true), graduatedFeeBps: number(10, 1000, true), compoundingPercent: number(0, 100, true), lockedLiquidityPercent: number(10, 100, true) } },
        execute: async (args: unknown) => { generation.current?.abort(); setBusy(true); setError(""); try { const next = await requestDesign(args, lifecycle.signal); applyDesign(next); setPreset("Custom"); setTab("studio"); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); return { input: next.input, sdkValid: next.selected.sdkValid, worstImpact: next.selected.worstImpact, warnings: next.warnings, graduation: next.graduation }; } catch (e) { setError(readableError(e)); throw e; } finally { setBusy(false); } },
      }, { signal: lifecycle.signal })).catch(() => {});
      void Promise.resolve(context.registerTool({ name: "read_curveguard_design", title: "Read CurveGuard design", description: "Read current inputs, modeled results and quote. No wallet information or account signers are returned.", annotations: { readOnlyHint: true, untrustedContentHint: false }, inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: (args: unknown) => { if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).length) throw new Error("Use an empty object."); return webState.current; } }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional progressive enhancement. */ }
    return () => lifecycle.abort();
  }, [initialDesign.input]);
  const minimumCapacity = Math.min(...s.depth.flatMap(p => [p.buyCapacity, p.sellCapacity]));
  return <><header className="app-header"><div className="header-inner"><a href="/" className="brand" aria-label="CurveGuard Launch home"><span className="brand-mark"><ChartNoAxesCombined size={24} strokeWidth={2.2} /></span><span className="brand-name">CurveGuard<span>Launch</span></span></a><div className="header-actions"><a className="header-link" href="https://docs.meteora.ag/developer-guides/dbc/overview" target="_blank" rel="noreferrer"><BookOpen size={16} /><span>Meteora docs</span></a><button className="header-link" onClick={() => fileInput.current?.click()}><Upload size={15} /><span>Import settings</span></button><a className="header-link" href="/downloads/curveguard-launch-source.zip" download><Code2 size={17} /><span>Source code</span></a><Button className="wallet-button" onClick={() => { setWalletError(""); setWalletOpen(true); }}><Wallet size={16} />{walletAddress ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}` : "Connect wallet"}</Button></div></div></header>
    <input className="sr-only" aria-label="Import launch settings JSON" type="file" accept=".json,application/json" ref={fileInput} onChange={e => { if (e.target.files?.[0]) void importSettings(e.target.files[0]); }} />
    <main className="app-shell"><div className="page-intro"><div><span className="eyebrow">A better start for your token</span><h1>Design liquidity before you launch.</h1><p>Set your trading goals. Shape the curve. Know what happens after graduation.</p></div><div className="protocol-tag"><span className="protocol-dot" /><span>Built on <strong>Meteora</strong><br /><span style={{ fontSize: 12 }}>DBC → DAMM v2</span></span></div></div>
      <Tabs value={tab} onValueChange={setTab}><TabsList className="top-tabs" aria-label="Launch workspace">{[{ id: "studio", label: "Curve studio", icon: ChartNoAxesCombined }, { id: "graduation", label: "Graduation", icon: Waves }, { id: "chain", label: "On-chain", icon: Activity }, { id: "launch", label: "Launch", icon: Rocket }, { id: "report", label: "Report", icon: FileText }].map((item, i) => <TabsTrigger className="top-tab" key={item.id} value={item.id}><item.icon /><span>{item.label}</span><span className="tab-number">0{i + 1}</span></TabsTrigger>)}</TabsList>
      <TabsContent value="studio" forceMount><div className="studio-layout"><InputPanel value={input} onChange={next => { setInput(next); setPreset("Custom"); }} preset={preset} setPreset={setPreset} busy={busy} error={error} onGenerate={() => void generate()} /><div className="results-column">
        {stale && <Notice tone="warn">Settings changed. Generate a new curve to update these results.</Notice>}
        <div className="metric-grid"><Metric label="Worst sampled price impact" value={formatImpact(s.worstImpact)} caption={`${c.orderSize.toLocaleString("en-US")} ${c.quoteToken} buys & sells`} tone={s.targetMet ? "good" : "warn"} icon={Gauge} /><Metric label={`Minimum ${c.impactTargetPercent}% capacity`} value={compactNumber(minimumCapacity)} unit={c.quoteToken} caption="Across 7 sampled launch stages" icon={ArrowDownUp} /><Metric label="Improvement vs. baseline" value={`${formatNumber(design.improvementPercent, 1)}%`} caption="Relative reduction in worst impact" tone={design.improvementPercent > 0 ? "good" : undefined} icon={GitCompareArrows} /></div>
        <CurveChart design={design} />
        <Notice tone={!s.sdkValid ? "error" : s.targetMet ? "success" : "warn"}><strong>{!s.sdkValid ? "No deployable candidate found." : s.targetMet ? "Your target is met at every sampled stage." : "This target needs more depth."}</strong> {s.sdkValid ? `${design.feasibleCandidates} of ${design.candidatesTested} candidates passed SDK validation. Tests cover both directions at 20%–80% progress; other stages can have higher impact.` : s.validationError}</Notice>
        <Panel title="Depth where trading happens" subtitle={`A ${formatNumber(c.orderSize)} ${c.quoteToken} order at each stage. Fees shown separately in the quote.`} action={<span className="mini-tag">{c.impactTargetPercent}% target</span>}><div className="depth-grid">{s.depth.map(p => <div className="depth-cell" key={p.progress}><div className="depth-progress">{p.progress}% progress</div><div className={`depth-impact ${p.buyImpact === null || p.buyImpact > c.impactTargetPercent ? "bad" : ""}`}>↑ {formatImpact(p.buyImpact)}</div><div className={`depth-sell ${p.sellImpact === null || p.sellImpact > c.impactTargetPercent ? "warning-text" : ""}`}>↓ {formatImpact(p.sellImpact)}</div></div>)}</div><p className="depth-caption">↑ Buy impact &nbsp; ↓ Sell impact · Sell input is valued at pre-trade spot price.</p></Panel>
        <Panel title="Try a trade before anyone does" subtitle="Exact-in Meteora SDK quote against the modeled curve." action={<span className="mini-tag">Simulation</span>}><div className="trade-layout"><div className="trade-form"><Tabs value={direction} onValueChange={v => setDirection(v as Direction)}><TabsList className="direction-tabs" aria-label="Trade direction"><TabsTrigger className="direction-tab" value="buy">Buy TOKEN</TabsTrigger><TabsTrigger className="direction-tab" value="sell">Sell TOKEN</TabsTrigger></TabsList></Tabs><div className="two-fields"><NumberField id="order-size" label={direction === "buy" ? "Pay" : "Sell value at spot"} value={order} onChange={setOrder} unit={c.quoteToken} min={.000001} max={10000000} /><NumberField id="slippage" label="Slippage tolerance" value={slippage} onChange={setSlippage} unit="%" min={0} max={50} step={.1} /></div><label className="progress-label" htmlFor="trade-progress"><span>Launch progress</span><span>{progress}%</span></label><Slider id="trade-progress" aria-label="Modeled launch progress" className="slim-slider" value={[progress]} onValueChange={v => setProgress(v[0])} min={5} max={95} step={5} /><div className="slider-labels"><span>Early launch</span><span>Near graduation</span></div>{direction === "sell" && quote && <p className="field-hint">Modeled input: {formatNumber(quote.amountIn, 6)} TOKEN.</p>}{quoteError && <p className="inline-error" role="alert">{quoteError}</p>}</div><div className="quote-box" aria-live="polite" aria-busy={quoteBusy}><span className="eyebrow">Estimated receive</span><div className="quote-value">{quoteBusy ? <LoaderCircle className="spin" size={24} /> : quote ? formatNumber(quote.amountOut, direction === "buy" ? 2 : 6) : "—"}</div><p className="quote-token">{direction === "buy" ? "TOKEN" : c.quoteToken}</p><div className="quote-detail"><span>Price impact · excludes fees</span><strong>{quote ? formatImpact(quote.priceImpact) : "—"}</strong></div><div className="quote-detail"><span>Total trading fee</span><strong>{quote ? `${formatNumber(quote.fee, 6)} ${c.quoteToken}` : "—"}</strong></div><div className="quote-detail"><span>Minimum received</span><strong>{quote ? `${formatNumber(quote.minimumOut, 4)} ${quote.outputToken}` : "—"}</strong></div><div className="quote-detail"><span>Progress after trade</span><strong>{quote ? `${formatNumber(quote.nextProgress, 2)}%` : "—"}</strong></div></div></div></Panel>
        <Panel title="Compare on equal terms" subtitle="Same supply, quote budget, starting price, nominal graduation price and fees."><div className="table-scroll"><table className="summary-table"><thead><tr><th>Modeled measure</th><th>Selected curve</th><th>Uniform-liquidity baseline</th></tr></thead><tbody><tr><td>Worst sampled buy impact</td><td>{formatImpact(s.worstBuyImpact)}</td><td>{formatImpact(design.baseline.worstBuyImpact)}</td></tr><tr><td>Worst sampled sell impact</td><td>{formatImpact(s.worstSellImpact)}</td><td>{formatImpact(design.baseline.worstSellImpact)}</td></tr><tr><td>Distributed through DBC</td><td>{formatNumber(s.curveTokens / c.totalSupply * 100)}%</td><td>{formatNumber(design.baseline.curveTokens / c.totalSupply * 100)}%</td></tr><tr><td>Leftover creator allocation</td><td>{formatNumber(s.leftoverTokens / c.totalSupply * 100)}%</td><td>{formatNumber(design.baseline.leftoverTokens / c.totalSupply * 100)}%</td></tr><tr><td>SDK supply validation</td><td>{s.sdkValid ? "Passed" : "Failed"}</td><td>{design.baseline.sdkValid ? "Passed" : "Failed"}</td></tr></tbody></table></div><p className="depth-caption" style={{ paddingTop: 14 }}>Curve shape changes token distribution. The baseline is a reference configuration, not a competing product or a market benchmark.</p></Panel>
        {design.warnings.length > 0 && <Notice tone="warn">{design.warnings.join(" ")}</Notice>}
        <div className="workspace-next"><p><CheckCheck size={17} />Your curve is one part of the launch.</p><Button className="secondary-button" onClick={() => setTab("graduation")}>Review graduation<ArrowRight size={15} /></Button></div>
      </div></div></TabsContent>
      <TabsContent value="graduation" forceMount><GraduationPanel design={design} /></TabsContent>
      <TabsContent value="chain" forceMount><ChainPanel key={receipt?.pool ?? "inspector"} impactTarget={c.impactTargetPercent} initialAddress={receipt?.pool} initialNetwork={receipt?.network} /></TabsContent>
      <TabsContent value="launch" forceMount><LaunchPanel design={design} stale={stale} fingerprint={fingerprint} walletAddress={walletAddress} provider={provider} connectWallet={() => setWalletOpen(true)} inspectReceipt={next => { setReceipt(next); setTab("chain"); }} /></TabsContent>
      <TabsContent value="report" forceMount><ReportPanel design={design} fingerprint={fingerprint} /></TabsContent></Tabs>
      <footer className="app-footer"><span>CurveGuard Launch · Meteora DBC SDK {design.sdkVersion} · Studio values are modeled</span><div className="footer-links"><a href="/downloads/curveguard-launch-source.zip" download>Download full source</a><a href="https://github.com/MeteoraAg/dynamic-bonding-curve-sdk" target="_blank" rel="noreferrer">DBC SDK</a><a href="https://docs.meteora.ag/developer-guides/damm-v2/overview" target="_blank" rel="noreferrer">DAMM v2 docs</a></div></footer>
    </main>
    <Dialog open={walletOpen} onOpenChange={setWalletOpen}><DialogContent className="dialog-surface"><DialogTitle>{walletAddress ? "Your connected wallet" : "Connect a Solana wallet"}</DialogTitle><DialogDescription>{walletAddress ? "Your wallet controls signatures and permissions. Disconnecting does not change confirmed on-chain accounts." : "Explore the studio without a wallet. Connect when you are ready to create a launch."}</DialogDescription>{walletAddress ? <><div className="address">{walletAddress}</div><Button className="secondary-button" onClick={() => void disconnect()}>Disconnect wallet</Button></> : <div className="stack" style={{ gap: 10 }}>{(["Phantom", "Solflare"] as const).map(name => <Button className="wallet-choice" key={name} onClick={() => void connect(name)} disabled={walletBusy}><span><span className="wallet-symbol">{name === "Phantom" ? "P" : "S"}</span>{name}</span>{walletBusy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}</Button>)}<p className="field-hint">Install a supported wallet extension, or open this site in a supported wallet browser.</p></div>}{walletError && <p className="inline-error" role="alert">{walletError}</p>}</DialogContent></Dialog>
  </>;
}
