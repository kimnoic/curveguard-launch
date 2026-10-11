"use client";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/launch-types";

export function Panel({ title, subtitle, index, children, className = "", action }: { title: string; subtitle?: string; index?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action ?? (index && <span className="section-index">{index}</span>)}</div>{children}</section>;
}
export function NumberField({ label, value, onChange, unit, hint, min = 0, max, step = "any", id }: { label: string; value: number; onChange: (n: number) => void; unit?: string; hint?: string; min?: number; max?: number; step?: number | "any"; id: string }) {
  return <div className="field"><label className="form-label" htmlFor={id}>{label}</label><div className="input-unit"><Input id={id} className="field-input" type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ""} onChange={e => onChange(e.target.value === "" ? NaN : Number(e.target.value))} min={min} max={max} step={step} required />{unit && <span className="unit">{unit}</span>}</div>{hint && <p className="field-hint">{hint}</p>}</div>;
}
export function Metric({ label, value, unit, caption, tone, icon: Icon }: { label: string; value: string; unit?: string; caption?: string; tone?: "good" | "warn"; icon?: LucideIcon }) {
  return <div className="metric"><div className="metric-label">{Icon && <Icon size={14} />}{label}</div><div className="metric-value">{value}{unit && <small>{unit}</small>}</div>{caption && <div className={`metric-caption ${tone ?? ""}`}>{caption}</div>}</div>;
}
export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "warn" | "error" }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warn" || tone === "error" ? AlertCircle : Info;
  return <div className={`status-row ${tone === "warn" || tone === "error" ? tone : ""}`} role={tone === "error" ? "alert" : "status"}><Icon size={16} /><p>{children}</p></div>;
}
export function formatImpact(n: number | null) { return n !== null && n < 1000 && Number.isFinite(n) ? `${formatNumber(n, 2)}%` : "Not fillable"; }
