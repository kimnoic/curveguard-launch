"use client";
import { Download, FileJson, Printer, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { formatNumber, formatPrice, type DesignResult } from "@/lib/launch-types";
import { downloadText, reportMarkdown } from "@/lib/launch-report";
import { Notice, formatImpact } from "./shared";

export function ReportPanel({ design: d, fingerprint }: { design: DesignResult; fingerprint: string }) {
  const c = d.input, s = d.selected;
  return <section className="panel"><div className="report-head"><div><span className="eyebrow">Issuance specification</span><h2>Your launch, made inspectable.</h2><p className="section-copy" style={{ margin: 0 }}>Export the configuration, assumptions and modeled trading behavior.</p></div><div className="report-actions"><Button className="secondary-button" onClick={() => downloadText("curveguard-launch-report.md", reportMarkdown(d, fingerprint), "text/markdown")}><Download size={15} />Report</Button><Button className="secondary-button" onClick={() => downloadText("curveguard-launch-config.json", JSON.stringify({ input: c, weights: s.weights, fingerprint, sdkVersion: d.sdkVersion, sdkConfig: s.sdkConfig }, null, 2), "application/json")}><FileJson size={15} />Config</Button><Button className="secondary-button" aria-label="Print issuance specification" onClick={() => window.print()}><Printer size={15} /></Button></div></div>
    <div className="report-body"><Notice tone={s.sdkValid ? "success" : "error"}><strong>{s.sdkValid ? "Configuration passes SDK validation." : "Configuration is not deployable."}</strong> This is a modeled specification; it does not certify a project or predict market demand.</Notice>
      <div className="report-section"><h3>Configuration fingerprint</h3><div className="address">{fingerprint || "Calculating SHA-256…"}</div><p className="field-hint">SHA-256 identifies the serialized SDK parameters. Wallet recipients, token metadata, network and account addresses are set separately at launch.</p></div>
      <div className="report-section"><h3>Issuance settings</h3><div className="table-scroll"><table className="summary-table"><tbody>{[
        ["Quote token / token precision", `${c.quoteToken} / SPL token, 6 decimals`],
        ["Total token supply", `${formatNumber(c.totalSupply)} TOKEN`],
        ["Initial / nominal graduation FDV", `${formatNumber(c.initialMarketCap)} / ${formatNumber(c.migrationMarketCap)} ${c.quoteToken}`],
        ["Graduation quote reserve", `${formatNumber(c.targetQuoteReserve)} ${c.quoteToken}`],
        ["Typical order / impact target", `${formatNumber(c.orderSize)} ${c.quoteToken} / ${c.impactTargetPercent}%`],
        ["DBC / DAMM v2 trading fees", `${c.feeBps / 100}% / ${c.graduatedFeeBps / 100}%`],
        ["LP fee reinvestment", `${c.compoundingPercent}% after protocol fees`],
        ["Creator LP ownership", `${c.lockedLiquidityPercent}% permanently locked / ${100 - c.lockedLiquidityPercent}% withdrawable`],
        ["Curve / graduation / leftover allocation", `${formatNumber(s.curveTokens / c.totalSupply * 100)}% / ${formatNumber(s.migrationTokens / c.totalSupply * 100)}% / ${formatNumber(s.leftoverTokens / c.totalSupply * 100)}%`],
        ["Expected leftover recipient", "Launching wallet, available after graduation"],
        ["DBC non-protocol fee recipient", "Launching wallet (100%)"],
        ["CurveGuard creation / migration fee", "0"],
      ].map(([label, value]) => <tr key={label}><td>{label}</td><td>{value}</td></tr>)}</tbody></table></div></div>
      <div className="report-section"><h3>Verified model samples · buys and sells</h3><div className="table-scroll"><table className="summary-table"><thead><tr><th>Progress</th><th>Spot price</th><th>Buy impact</th><th>Sell impact</th><th>Buy capacity</th><th>Sell capacity</th></tr></thead><tbody>{s.depth.map(p => <tr key={p.progress}><td>{p.progress}%</td><td>{formatPrice(p.price)}</td><td>{formatImpact(p.buyImpact)}</td><td>{formatImpact(p.sellImpact)}</td><td>{formatNumber(p.buyCapacity)} {c.quoteToken}</td><td>{formatNumber(p.sellCapacity)} {c.quoteToken}</td></tr>)}</tbody></table></div><p className="field-hint">Capacity is quoted at the configured price-impact target. Fees are additional. Sell input is valued at the pre-trade spot price.</p></div>
      <div className="report-section"><h3>Screening notes</h3><ul className="report-note">{(d.warnings.length ? d.warnings : ["No configured screening warnings."]).map(note => <li key={note}>{note}</li>)}</ul></div>
      <div className="report-section"><h3>Modeling boundaries</h3><ul className="report-note">{d.limitations.map(note => <li key={note}>{note}</li>)}</ul></div>
      <div className="report-section"><Accordion type="single" collapsible><AccordionItem value="config" className="advanced-item"><AccordionTrigger className="advanced-trigger"><span style={{ display: "flex", gap: 8, alignItems: "center" }}><ShieldCheck size={16} />Inspect the exact SDK configuration</span></AccordionTrigger><AccordionContent><pre className="config-code">{JSON.stringify(s.sdkConfig, null, 2)}</pre></AccordionContent></AccordionItem></Accordion></div>
    </div>
  </section>;
}
