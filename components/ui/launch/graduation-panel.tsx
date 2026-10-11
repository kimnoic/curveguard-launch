"use client";
import { useState } from "react";
import { LockKeyhole, RefreshCw, Waves } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { formatNumber, compactNumber, formatPrice, type DesignResult } from "@/lib/launch-types";
import { Panel, Metric, Notice, NumberField, formatImpact } from "./shared";

export function GraduationPanel({ design: d }: { design: DesignResult }) {
  const [dailyVolume, setDailyVolume] = useState(10000);
  const [days, setDays] = useState(30);
  const [protocolShare, setProtocolShare] = useState(20);
  const c = d.input, g = d.graduation;
  const dailyFees = (Number.isFinite(dailyVolume) ? Math.max(0, dailyVolume) : 0) * c.graduatedFeeBps / 10000;
  const lpFee = dailyFees * (1 - protocolShare / 100);
  const dailyReinvest = lpFee * c.compoundingPercent / 100;
  const reinvest = dailyReinvest * days;
  const endY = reinvest > 0 ? 35 : 150;
  const claims = lpFee * (1 - c.compoundingPercent / 100) * days;
  const colors = ["#6c51df", "#a998ed", "#d9d3ed"];
  const allocations = [d.selected.curveTokens, d.selected.migrationTokens, d.selected.leftoverTokens];
  return <div className="wide-grid"><div className="stack">
    <div className="metric-grid"><Metric label="Modeled quote liquidity" value={compactNumber(g.quoteReserve)} unit={c.quoteToken} caption="After protocol migration fee" icon={Waves} /><Metric label="Permanently locked" value={`${c.lockedLiquidityPercent}%`} caption={`${100 - c.lockedLiquidityPercent}% withdrawable by creator`} icon={LockKeyhole} /><Metric label="LP fees reinvested" value={`${c.compoundingPercent}%`} caption="After protocol fees" icon={RefreshCw} /></div>
    <Panel title="The handoff matters" subtitle="A matching opening price does not guarantee matching depth." index="02"><div className="panel-body">
      <div className="stat-list"><div><span>Modeled DAMM v2 opening price</span><strong>{formatPrice(g.price)} {c.quoteToken}</strong></div><div><span>Typical buy · price impact</span><strong>{formatImpact(g.buyImpact)}</strong></div><div><span>Typical sell · price impact</span><strong>{formatImpact(g.sellImpact)}</strong></div><div className="divider" /><div><span>Buy capacity at {c.impactTargetPercent}% impact</span><strong>{formatNumber(g.buyCapacity)} {c.quoteToken}</strong></div><div><span>Sell capacity at {c.impactTargetPercent}% impact</span><strong>{formatNumber(g.sellCapacity)} {c.quoteToken}</strong></div><div><span>Protocol migration fee</span><strong>{formatNumber(g.protocolMigrationQuoteFee)} {c.quoteToken} + {compactNumber(g.protocolMigrationBaseFee)} TOKEN</strong></div></div>
      <div style={{ marginTop: 20 }}><Notice tone={g.targetMet ? "success" : "warn"}>{g.targetMet ? "The modeled graduated pool meets this typical-order target." : `To meet this target after graduation, the model needs about ${formatNumber(g.suggestedQuoteReserve)} ${c.quoteToken} at the DBC threshold. Recheck token supply before increasing the budget.`}</Notice></div>
      <p className="field-hint">Full-range model. Actual migration balances, rent, rounding and dead liquidity can differ. Price impact excludes trading fees.</p>
    </div></Panel>
    <Panel title="Know where the tokens go" subtitle="Modeled allocations, before protocol migration fees."><div className="panel-body"><div className="allocation-bar">{allocations.map((a, i) => <span key={i} style={{ width: `${a / c.totalSupply * 100}%`, background: colors[i] }} />)}</div><div className="allocation-key">{["Distributed through DBC", "Allocated for graduation", "Leftover to launching wallet"].map((name, i) => <div key={name}><span><i className="swatch" style={{ background: colors[i] }} />{name}</span><strong>{formatNumber(allocations[i] / c.totalSupply * 100)}% · {compactNumber(allocations[i])}</strong></div>)}</div><p className="field-hint" style={{ marginTop: 17 }}>Leftover becomes available after the graduated pool is created. It is a creator allocation, not locked liquidity.</p></div></Panel>
  </div><div className="stack"><Panel title="Let trading fees support liquidity" subtitle="An editable scenario, not a volume or return forecast." index="03"><div className="panel-body">
    <div className="projection-controls"><NumberField id="daily-volume" label="Assumed daily volume" value={dailyVolume} onChange={setDailyVolume} unit={c.quoteToken} min={0} max={1000000000} /><NumberField id="projection-days" label="Scenario duration" value={days} onChange={v => setDays(Math.max(1, Math.min(365, Math.round(v || 1))))} unit="days" min={1} max={365} step={1} /></div>
    <label className="form-label" htmlFor="protocol-share">Assumed protocol fee share<span className="slider-number">{protocolShare}%</span></label><Slider id="protocol-share" aria-label="Assumed protocol fee share" value={[protocolShare]} min={0} max={50} step={1} onValueChange={v => setProtocolShare(v[0])} className="slim-slider" /><p className="field-hint">20% is the documented default. Check the actual graduated pool.</p>
    <svg className="fee-chart" viewBox="0 0 460 190" role="img" aria-label="Cumulative quote fees reinvested under the stated volume scenario"><defs><linearGradient id="fee-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6c51df" stopOpacity=".15" /><stop offset="1" stopColor="#6c51df" stopOpacity="0" /></linearGradient></defs>{[45, 90, 135].map(y => <line key={y} x1="25" x2="435" y1={y} y2={y} stroke="#e7eaf3" strokeDasharray="3 5" />)}<path d={`M25 150 L435 ${endY} L435 150 Z`} fill="url(#fee-fill)" /><path d={`M25 150 L435 ${endY}`} stroke="#795de4" strokeWidth="2.5" fill="none" /><circle cx="435" cy={endY} r="4" fill="#795de4" /><text x="25" y="174" fontSize="13" fill="#9ba4b5">Day 0</text><text x="435" y="174" fontSize="13" textAnchor="end" fill="#9ba4b5">Day {days}</text><text x="428" y="24" fontSize="14" textAnchor="end" fill="#795de4">{formatNumber(reinvest)} {c.quoteToken}</text></svg>
    <div className="stat-list"><div><span>Total trading fees</span><strong>{formatNumber(dailyFees * days)} {c.quoteToken}</strong></div><div><span>Assumed protocol fees</span><strong>{formatNumber(dailyFees * days * protocolShare / 100)} {c.quoteToken}</strong></div><div><span>Reinvested into quote reserves</span><strong className="big">{formatNumber(reinvest)} {c.quoteToken}</strong></div><div><span>Claimable LP fees</span><strong>{formatNumber(claims)} {c.quoteToken}</strong></div></div>
    <p className="field-hint" style={{ marginTop: 18 }}>DAMM v2 compounds fees in token B. This sum counts reinvested quote fees only; it does not simulate market-driven reserve changes or future liquidity value.</p>
  </div></Panel><div className="info-card"><strong>Native Meteora compounding.</strong><br />A share of LP fees is added to the pool's token B reserves. DBC-phase fees stay separate and do not count toward graduation. No additional CurveGuard fee or custodial vault is used.</div></div></div>;
}
