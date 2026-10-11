"use client";
import { LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Slider } from "@/components/ui/slider";
import { DEFAULT_INPUTS, type LaunchInputs } from "@/lib/launch-types";
import { Panel, NumberField } from "./shared";

export function InputPanel({ value: c, onChange, onGenerate, busy, error, preset, setPreset }: { value: LaunchInputs; onChange: (c: LaunchInputs) => void; onGenerate: () => void; busy: boolean; error: string | null; preset: string; setPreset: (p: string) => void }) {
  const update = (k: keyof LaunchInputs, v: number) => { onChange({ ...c, [k]: v }); setPreset(""); };
  function applyPreset(name: string) {
    const examples: Record<string, LaunchInputs> = {
      Community: DEFAULT_INPUTS,
      "AI tools": { ...DEFAULT_INPUTS, initialMarketCap: 40000, migrationMarketCap: 320000, targetQuoteReserve: 55000, orderSize: 500, compoundingPercent: 80 },
      "SOL launch": { ...DEFAULT_INPUTS, quoteToken: "SOL", initialMarketCap: 5, migrationMarketCap: 50, targetQuoteReserve: 10, orderSize: .1 },
    };
    onChange({ ...examples[name] }); setPreset(name);
  }
  return <Panel title="Design your launch" subtitle="Set a trading goal. Explore the trade-offs." index="01" className="input-panel">
    <form className="panel-body" onSubmit={e => { e.preventDefault(); onGenerate(); }}>
      <div className="presets" aria-label="Example settings">{["Community", "AI tools", "SOL launch"].map(name => <Button key={name} type="button" variant="outline" className={`preset-button ${preset === name ? "selected" : ""}`} onClick={() => applyPreset(name)}>{name}</Button>)}</div>
      <div className="field"><label className="form-label" htmlFor="quote-token">Quote asset</label><NativeSelect id="quote-token" className="select-input" value={c.quoteToken} onChange={e => { onChange({ ...c, quoteToken: e.target.value as "USDC" | "SOL" }); setPreset(""); }}><NativeSelectOption value="USDC">USDC · 6 decimals</NativeSelectOption><NativeSelectOption value="SOL">SOL · 9 decimals</NativeSelectOption></NativeSelect></div>
      <NumberField id="reserve" label="Graduation reserve" value={c.targetQuoteReserve} onChange={v => update("targetQuoteReserve", v)} unit={c.quoteToken} min={.001} max={100000000} hint="Net quote reserves required to complete DBC." />
      <NumberField id="typical-order-size" label="Typical order size" value={c.orderSize} onChange={v => update("orderSize", v)} unit={c.quoteToken} min={.000001} max={10000000} hint="Buy input, or the pre-trade value of a sell order." />
      <div className="field"><label className="form-label" htmlFor="impact-target">Target price impact<span className="slider-number">{c.impactTargetPercent}%</span></label><Slider id="impact-target" aria-label="Target price impact" className="slim-slider" value={[c.impactTargetPercent]} min={.1} max={5} step={.1} onValueChange={v => update("impactTargetPercent", v[0])} /><div className="slider-labels"><span>0.1% · lower impact</span><span>5%</span></div><p className="field-hint">Checked for buys and sells at 20–80% progress. Trading fees are additional.</p></div>
      <div className="field-divider" />
      <div className="advanced-parameters"><Accordion type="single" collapsible defaultValue="economics"><AccordionItem value="economics" className="advanced-item"><AccordionTrigger className="advanced-trigger">Token economics & fees</AccordionTrigger><AccordionContent>
        <NumberField id="supply" label="Total token supply" value={c.totalSupply} onChange={v => update("totalSupply", v)} unit="TOKEN" min={1000} max={10000000000} step={1} />
        <div className="two-fields"><NumberField id="initial-fdv" label="Initial FDV" value={c.initialMarketCap} onChange={v => update("initialMarketCap", v)} unit={c.quoteToken} min={.01} /><NumberField id="graduation-fdv" label="Graduation FDV" value={c.migrationMarketCap} onChange={v => update("migrationMarketCap", v)} unit={c.quoteToken} min={.02} /></div>
        <div className="two-fields"><NumberField id="dbc-fee" label="DBC fee" value={c.feeBps / 100} onChange={v => update("feeBps", Math.round(v * 100))} unit="%" min={.25} max={10} step={.05} /><NumberField id="damm-fee" label="DAMM v2 fee" value={c.graduatedFeeBps / 100} onChange={v => update("graduatedFeeBps", Math.round(v * 100))} unit="%" min={.1} max={10} step={.05} /></div>
        <div className="field"><label className="form-label" htmlFor="compound">LP fee reinvestment<span className="slider-number">{c.compoundingPercent}%</span></label><Slider id="compound" aria-label="LP fee reinvestment percentage" className="slim-slider" value={[c.compoundingPercent]} min={0} max={100} step={5} onValueChange={v => update("compoundingPercent", v[0])} /><p className="field-hint">Share of LP fees reinvested after protocol fees, once the pool graduates.</p></div>
        <div className="field"><label className="form-label" htmlFor="locked-lp">Permanently locked LP<span className="slider-number">{c.lockedLiquidityPercent}%</span></label><Slider id="locked-lp" aria-label="Permanently locked LP percentage" className="slim-slider" value={[c.lockedLiquidityPercent]} min={10} max={100} step={5} onValueChange={v => update("lockedLiquidityPercent", v[0])} /><p className="field-hint">The launching wallet controls the unlocked share.</p></div>
      </AccordionContent></AccordionItem></Accordion></div>
      <Button className="primary-button full-width" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{busy ? "Finding a curve…" : "Generate curve"}</Button>
      <div className="form-message">{error && <p className="inline-error" role="alert">{error}</p>}<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 15 }}><span className="field-hint" style={{ margin: 0 }}>No wallet needed to explore.</span><Button className="text-button" type="button" onClick={() => applyPreset("Community")} aria-label="Reset to community settings"><RotateCcw size={13} />Reset</Button></div></div>
    </form>
  </Panel>;
}
