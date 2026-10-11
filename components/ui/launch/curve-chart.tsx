"use client";
import { useState } from "react";
import { CheckCircle2, FlaskConical } from "lucide-react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatPrice, formatNumber, type DesignResult } from "@/lib/launch-types";

export function CurveChart({ design: d }: { design: DesignResult }) {
  const [hover, setHover] = useState<number | null>(null);
  const [scale, setScale] = useState("price");
  const width = 760, left = 76, right = 728, top = 30, bottom = 225;
  const series = [d.selected, d.baseline];
  const pmin = Math.min(...series.flatMap(s => s.chart.map(p => p.price)));
  const pmax = Math.max(...series.flatMap(s => s.chart.map(p => p.price))) * 1.08;
  const val = (p: number) => scale === "log" ? Math.log(p) : p;
  const ymin = scale === "log" ? Math.log(pmin) * 1 - (Math.log(pmax) - Math.log(pmin)) * .08 : 0;
  const ymax = val(pmax);
  const x = (v: number) => left + (right - left) * v / 100;
  const y = (v: number) => bottom - (val(v) - ymin) / (ymax - ymin) * (bottom - top);
  const path = (s: typeof d.selected) => s.chart.map((p, i) => `${i ? "L" : "M"}${x(p.progress).toFixed(2)},${y(p.price).toFixed(2)}`).join(" ");
  const point = hover === null ? null : d.selected.chart[hover];
  return <section className="curve-panel" aria-label="Modeled DBC price curves">
    <div className="curve-header"><div><h2>Price discovery, by design.</h2><p>{d.input.quoteToken} per token · modeled reserve progress</p></div><div className="curve-badge">{d.selected.sdkValid ? <CheckCircle2 size={13} /> : <FlaskConical size={13} />}{d.selected.sdkValid ? "SDK validated" : "Model only"}</div></div>
    <div className="chart-legend"><span className="legend-item"><i className="legend-line" />Selected curve</span><span className="legend-item"><i className="legend-line baseline" />Standard curve</span><div style={{ marginLeft: "auto" }}><NativeSelect aria-label="Chart scale" className="chart-control" value={scale} onChange={e => setScale(e.target.value)}><NativeSelectOption value="price">Linear scale</NativeSelectOption><NativeSelectOption value="log">Log scale</NativeSelectOption></NativeSelect></div></div>
    <svg className="curve-chart" viewBox={`0 0 ${width} 265`} role="img" aria-label="Selected and standard curves at the same quote reserve threshold" onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); const p = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width * width - left) / (right - left) * 100)); setHover(Math.round(p / 1.25)); }} onPointerLeave={() => setHover(null)}>
      <defs><linearGradient id="curve-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#aaf0c5" stopOpacity=".16" /><stop offset="100%" stopColor="#aaf0c5" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3].map(i => { const yy = top + (bottom - top) * i / 3; const vv = ymin + (ymax - ymin) * (1 - i / 3); return <g key={i}><line x1={left} x2={right} y1={yy} y2={yy} stroke="#354057" strokeWidth="1" strokeDasharray="3 5" /><text x={left - 12} y={yy + 4} textAnchor="end" fill="#8b9ab3" fontSize="13" fontFamily="monospace">{formatPrice(scale === "log" ? Math.exp(vv) : vv)}</text></g>; })}
      {[0, 20, 40, 60, 80, 100].map(p => <text key={p} x={x(p)} y={249} textAnchor="middle" fill="#8b9ab3" fontSize="13" fontFamily="monospace">{p}%</text>)}
      <rect x={x(20)} width={x(80) - x(20)} y={top} height={bottom - top} fill="#aaf0c5" opacity=".035" /><text x={x(50)} y={top + 16} textAnchor="middle" fontSize="12" fill="#81948f">TARGET WINDOW</text>
      <path d={`${path(d.selected)} L${right},${bottom} L${left},${bottom} Z`} fill="url(#curve-fill)" />
      <path d={path(d.baseline)} fill="none" stroke="#a599d6" strokeWidth="2" strokeDasharray="5 6" />
      <path d={path(d.selected)} fill="none" stroke="#aaf0c5" strokeWidth="3" strokeLinecap="round" />
      <circle cx={right} cy={y(d.selected.chart[80].price)} r="4" fill="#aaf0c5" />
      {point && <g><line x1={x(point.progress)} x2={x(point.progress)} y1={top} y2={bottom} stroke="#aaf0c5" opacity=".35" /><circle cx={x(point.progress)} cy={y(point.price)} r="5" fill="#aaf0c5" stroke="#192136" strokeWidth="2" /></g>}
    </svg>
    <div className="curve-foot"><span>{point ? <><strong>{formatNumber(point.progress)}% progress</strong> · {formatPrice(point.price)} {d.input.quoteToken}/token</> : <>Same budget. Same nominal price endpoints.</>}</span><span>Graduates at <strong>{formatNumber(d.input.targetQuoteReserve, 2)} {d.input.quoteToken}</strong></span></div>
  </section>;
}
