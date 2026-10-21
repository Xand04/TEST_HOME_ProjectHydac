import type { Company } from "./types";
export const euro = (value: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 2 }).format(value);
export const date = (value: string) => { const d = new Date(value); return Number.isNaN(d.valueOf()) ? "Datum offen" : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }); };
export function trend(c: Company) { const h = [...(c.revenueHistory || [])].sort((a, b) => a.year - b.year); if (h.length < 2 || h.at(-2)!.value <= 0) return null; return (h.at(-1)!.value / h.at(-2)!.value - 1) * 100; }
export function attention(c: Company) {
  const risks = c.signals.filter(s => s.impact === "risk").length, opportunities = c.signals.filter(s => s.impact === "opportunity").length;
  return risks > 0 && opportunities === 0 ? { color: "red", symbol: "✗", label: "Risiken prüfen", short: "Prüfen" } : opportunities > 0 && risks === 0 ? { color: "green", symbol: "✓", label: "Chancen prüfen", short: "Chancen" } : { color: "amber", symbol: "!", label: risks ? "Im Blick behalten" : "Daten prüfen", short: "Beobachten" };
}
