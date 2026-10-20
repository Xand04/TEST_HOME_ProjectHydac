"use client";

import { useEffect, useMemo, useState } from "react";
import type { Company, SalesData } from "../lib/types";
import { attention, euro, trend } from "../lib/format";
import { Icon } from "./Icon";
import "./compare.css";

type View = "matrix" | "list";
type Sort = "name" | "revenue" | "trend" | "sales";
type Entry = {
  company: Company;
  externalTrend: number | null;
  internalTrend: number | null;
  latestSales: { jahr: number; umsatz: number } | null;
  sales: SalesData | null;
};

const percentage = (value: number) => new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 1, signDisplay: "exceptZero",
}).format(value) + " %";
const direction = (value: number) => value > 0 ? "↗" : value < 0 ? "↘" : "→";
const quadrants = [
  { id: "defend", title: "Position stärken", description: "Markt rückläufig · unser Geschäft stabil / steigend", externalUp: false, internalUp: true },
  { id: "grow", title: "Gemeinsam wachsen", description: "Markt und unser Geschäft stabil / steigend", externalUp: true, internalUp: true },
  { id: "review", title: "Risiken klären", description: "Markt und unser Geschäft rückläufig", externalUp: false, internalUp: false },
  { id: "catch-up", title: "Anschluss finden", description: "Markt stabil / steigend · unser Geschäft rückläufig", externalUp: true, internalUp: false },
];

function salesFacts(sales?: SalesData) {
  if (sales?.status !== "connected") return { latestSales: null, internalTrend: null };
  const years = [...sales.umsatzJeJahr]
    .filter((point) => Number.isFinite(point.jahr) && Number.isFinite(point.umsatz))
    .sort((a, b) => a.jahr - b.jahr);
  const latestSales = years.at(-1) ?? null;
  const previous = years.at(-2);
  return {
    latestSales,
    internalTrend: latestSales && previous && previous.umsatz > 0
      ? (latestSales.umsatz / previous.umsatz - 1) * 100 : null,
  };
}

export default function Compare({ companies, onOpen }: {
  companies: Company[];
  onOpen: (company: Company) => void;
}) {
  const [view, setView] = useState<View>("matrix");
  const [sort, setSort] = useState<Sort>("name");
  const [descending, setDescending] = useState(false);
  const [salesByNumber, setSalesByNumber] = useState<Record<string, SalesData>>({});
  const [loading, setLoading] = useState(false);
  const customerNumbers = JSON.stringify([...new Set(companies.map((company) => company.kundenNr).filter(Boolean))].sort());

  useEffect(() => {
    const numbers = JSON.parse(customerNumbers) as string[];
    if (!numbers.length) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    Promise.allSettled(numbers.map(async (number) => {
      const response = await fetch(`/api/sap/${encodeURIComponent(number)}`, {
        cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error("SAP-Daten nicht erreichbar");
      const data = await response.json() as SalesData;
      if (!Array.isArray(data.umsatzJeJahr)) throw new Error("SAP-Daten unvollständig");
      return { number, data };
    })).then((results) => {
      if (!active) return;
      const next: Record<string, SalesData> = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") next[result.value.number] = result.value.data;
        else next[numbers[index]] = {
          status: "error", source: "SAP", message: "SAP-Daten derzeit nicht erreichbar.",
          umsatzJeJahr: [], produktgruppenMix: [], artikelImStamm: null, historie: [],
        };
      });
      setSalesByNumber(next);
      setLoading(false);
    });
    return () => { active = false; controller.abort(); };
  }, [customerNumbers]);

  const entries = useMemo<Entry[]>(() => companies.map((company) => {
    const sales = company.kundenNr ? salesByNumber[company.kundenNr] : undefined;
    return { company, externalTrend: trend(company), ...salesFacts(sales), sales: sales ?? null };
  }), [companies, salesByNumber]);
  const positioned = entries.filter((entry) => entry.externalTrend !== null && entry.internalTrend !== null);
  const pending = entries.filter((entry) => entry.externalTrend === null || entry.internalTrend === null);
  const maximumSales = Math.max(...positioned.map((entry) => entry.latestSales?.umsatz ?? 0), 1);
  const sorted = useMemo(() => [...entries].sort((a, b) => {
    if (sort === "name") return a.company.name.localeCompare(b.company.name, "de") * (descending ? -1 : 1);
    const left = sort === "revenue" ? a.company.revenue?.value : sort === "trend" ? a.externalTrend : a.latestSales?.umsatz;
    const right = sort === "revenue" ? b.company.revenue?.value : sort === "trend" ? b.externalTrend : b.latestSales?.umsatz;
    if (left == null && right == null) return a.company.name.localeCompare(b.company.name, "de");
    if (left == null) return 1;
    if (right == null) return -1;
    return (left - right) * (descending ? -1 : 1);
  }), [entries, sort, descending]);

  const companyCard = (entry: Entry, showReason = false) => {
    const { company, externalTrend, latestSales, sales } = entry;
    const status = attention(company);
    const history = [...(company.revenueHistory ?? [])].sort((a, b) => a.year - b.year);
    return (
      <li key={company.id} className="cmp-company">
        <button type="button" className="cmp-company-button" onClick={() => onOpen(company)} aria-label={`${company.name}: Dossier öffnen`}>
          <span className="cmp-company-top">
            <span className="cmp-company-name">{company.name}<span>{company.industry || "Branche noch offen"}</span></span>
            <span className={`cmp-status cmp-${status.color}`}><span aria-hidden="true">{status.symbol}</span>{status.short}</span>
            <Icon name="chevronRight" size={20} />
          </span>
          <span className="cmp-company-facts">
            <span><span className="cmp-label">Kundenumsatz {company.revenue?.year ?? ""}</span><strong>{company.revenue ? euro(company.revenue.value) : "Nicht belegt"}</strong></span>
            <span><span className="cmp-label">Externer Trend</span><strong className={externalTrend !== null && externalTrend < 0 ? "cmp-negative" : ""}>{externalTrend === null ? "Noch offen" : `${direction(externalTrend)} ${percentage(externalTrend)}`}</strong></span>
            <span><span className="cmp-label">Unser Umsatz {latestSales?.jahr ?? ""}</span><strong>{latestSales ? euro(latestSales.umsatz) : "Noch offen"}</strong></span>
          </span>
          {showReason && <span className="cmp-pending-reason"><Icon name="info" size={16} />{
            sales?.status === "error" ? "SAP gerade nicht erreichbar" :
              !company.kundenNr ? "SAP-Kundennummer noch nicht zugeordnet" :
                entry.internalTrend === null ? "Zwei interne Umsatzjahre fehlen" : "Externer Umsatzverlauf fehlt"
          }</span>}
        </button>
        <div className="cmp-company-source">
          {company.revenue && <span>Quelle: <a href={company.revenue.source.url} target="_blank" rel="noreferrer">{company.revenue.source.label}<Icon name="arrowUpRight" size={15} /></a></span>}
          {externalTrend !== null && <span>Trend berechnet: {history.at(-2)?.year} → {history.at(-1)?.year}</span>}
          {latestSales && <span>Unser Umsatz: {sales?.source}</span>}
        </div>
      </li>
    );
  };

  return (
    <section className="cmp-page" aria-labelledby="compare-heading">
      <div className="cmp-heading">
        <div><p className="cmp-eyebrow">PORTFOLIO-PERSPEKTIVE</p><h1 id="compare-heading">Wo lohnt sich der nächste Schritt?</h1><p>Marktsignale und unser Geschäft im Zusammenhang.</p></div>
        <div className="cmp-view-switch" role="group" aria-label="Vergleichsansicht">
          <button type="button" aria-pressed={view === "matrix"} onClick={() => setView("matrix")}><Icon name="grid" size={19} />Matrix</button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}><Icon name="list" size={19} />Liste</button>
        </div>
      </div>

      {companies.length === 0 ? (
        <div className="cmp-empty"><Icon name="building" size={36} /><h2>Noch keine Unternehmen im Vergleich</h2><p>Starte im Portfolio eine Recherche. Deine Unternehmen erscheinen anschließend hier.</p></div>
      ) : view === "matrix" ? (
        <>
          <div className="cmp-matrix-card">
            <div className="cmp-matrix-intro"><div><h2>Wachstumsmatrix</h2><p>Externer Umsatztrend × unser Umsatztrend</p></div><span className="cmp-legend"><span />Größe = unser Umsatz</span></div>
            <p className="cmp-y-axis"><Icon name="chart" size={17} />Unser Geschäft <span>oben stabil / steigend · unten rückläufig</span></p>
            <div className="cmp-quadrants" aria-label="Vier Quadranten für externe und interne Umsatzentwicklung">
              {quadrants.map((quadrant) => {
                const members = positioned.filter((entry) => (entry.externalTrend! >= 0) === quadrant.externalUp && (entry.internalTrend! >= 0) === quadrant.internalUp);
                return <section key={quadrant.id} className={`cmp-quadrant cmp-quadrant-${quadrant.id}`} aria-label={`${quadrant.title}: ${quadrant.description}`}>
                  <h3>{quadrant.title}</h3><p className="cmp-quadrant-description">{quadrant.description}</p>
                  <div className="cmp-points">
                    {members.map((entry) => {
                      const state = attention(entry.company);
                      const size = Math.max(30, Math.min(82, 82 * Math.sqrt(Math.max(0, entry.latestSales?.umsatz ?? 0) / maximumSales)));
                      return <button key={entry.company.id} type="button" className={`cmp-point cmp-${state.color}`} onClick={() => onOpen(entry.company)} aria-label={`${entry.company.name}, ${state.label}. Unser Umsatz ${euro(entry.latestSales!.umsatz)}. Externer Trend ${percentage(entry.externalTrend!)}, interner Trend ${percentage(entry.internalTrend!)}. Dossier öffnen.`}>
                        <span className="cmp-point-circle" style={{ width: size, height: size }} aria-hidden="true">{state.symbol}</span>
                        <span>{entry.company.name}</span>
                        <span className="cmp-point-sales">{euro(entry.latestSales!.umsatz)}</span>
                        <span className="cmp-point-source">{entry.sales?.source} · {entry.latestSales!.jahr}</span>
                      </button>;
                    })}
                    {!members.length && <span className="cmp-quadrant-empty" aria-label="Keine zugeordneten Unternehmen">—</span>}
                  </div>
                </section>;
              })}
            </div>
            <div className="cmp-x-axis"><span>← Rückläufig</span><strong>Externer Umsatztrend</strong><span>Stabil / steigend →</span></div>
            <p className="cmp-matrix-footnote">Trends vergleichen die jeweils letzten zwei verfügbaren Umsatzjahre. Die Bezugsjahre können je Unternehmen und Quelle abweichen. Kleine Punkte haben eine Mindestgröße für die Bedienbarkeit.</p>
          </div>
          {pending.length > 0 && <section className="cmp-unassigned" aria-labelledby="pending-heading">
            <div className="cmp-pending-notice"><span className="cmp-pending-icon"><Icon name="database" size={24} /></span><div><h2 id="pending-heading">Noch nicht einzuordnen</h2><p>{positioned.length === 0 ? "Für die Positionierung fehlen interne Umsätze. SAP verbinden." : "Für diese Unternehmen fehlen vergleichbare Umsatzverläufe."}</p>{loading && <span role="status">SAP-Daten werden geladen …</span>}</div></div>
            <ul className="cmp-company-list">{pending.map((entry) => companyCard(entry, true))}</ul>
          </section>}
        </>
      ) : (
        <section className="cmp-list-view" aria-label="Sortierbarer Unternehmensvergleich">
          <div className="cmp-sort-row"><label htmlFor="compare-sort">Sortieren nach</label><select id="compare-sort" value={sort} onChange={(event) => { const next = event.target.value as Sort; setSort(next); setDescending(next !== "name"); }}><option value="name">Unternehmensname</option><option value="revenue">Kundenumsatz</option><option value="trend">Externer Trend</option><option value="sales">Unser Umsatz</option></select><button type="button" className="cmp-sort-direction" onClick={() => setDescending((value) => !value)} aria-label={descending ? "Aufsteigend sortieren" : "Absteigend sortieren"}><span aria-hidden="true">{descending ? "↓" : "↑"}</span><span>{descending ? "Absteigend" : "Aufsteigend"}</span></button></div>
          <ul className="cmp-company-list">{sorted.map((entry) => companyCard(entry))}</ul>
          <p className="cmp-list-note"><Icon name="info" size={18} />Fehlende Daten stehen am Ende. Die Ampel bewertet die verfügbaren externen Signale.</p>
        </section>
      )}
    </section>
  );
}
