"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Company, SalesData, Signal, Source } from "../lib/types";
import { Icon } from "./Icon";
import "./dossier.css";

const Charts = lazy(() => import("./Charts"));
const money = (value: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 2 }).format(value);
const number = (value: number) => new Intl.NumberFormat("de-DE").format(value);
const date = (value?: string) => {
  if (!value) return "Datum nicht angegeben";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const isSafeUrl = (value: string) => /^https?:\/\//i.test(value);

function SourceLine({ source, year }: { source: Source; year?: number }) {
  return (
    <span className="ds-source">
      {isSafeUrl(source.url) ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<Icon name="arrowUpRight" size={16} /></a> : source.label}
      {year ? ` · ${year}` : source.publishedAt ? ` · ${date(source.publishedAt)}` : ""}
    </span>
  );
}

function SignalCard({ signal, referenceNumber }: { signal: Signal; referenceNumber?: number }) {
  const label = signal.impact === "risk" ? "Risiko" : signal.impact === "opportunity" ? "Chance" : "Einordnung";
  return (
    <article className={`ds-signal ds-signal-${signal.impact}`}>
      <div className="ds-signal-meta">
        <span className={`ds-impact ds-impact-${signal.impact}`}>{signal.impact === "risk" ? "!" : signal.impact === "opportunity" ? "↗" : "•"} {label}</span>
        <span>{signal.type}</span><time dateTime={signal.date}>{date(signal.date)}</time>
      </div>
      <h3>{signal.title}</h3>
      <p>{signal.summary}</p>
      <div className="ds-signal-footer">{referenceNumber && <span className="ds-source">[{referenceNumber}]</span>}<SourceLine source={signal.source} /><span className="ds-priority">Priorität {signal.priority}</span></div>
      {signal.origin === "live" && <p className="ds-live-note">Aktueller Suchtreffer · Relevanz und Inhalt vor dem Gespräch an der Quelle prüfen.</p>}
    </article>
  );
}

function getScrollTop(element: HTMLElement) {
  let parent = element.parentElement;
  while (parent) {
    if (/(auto|scroll)/.test(window.getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent.scrollTop;
    parent = parent.parentElement;
  }
  return window.scrollY || document.documentElement.scrollTop;
}

type Props = {
  company: Company;
  onRefresh: () => void;
  onDelete: () => void;
  onToast: (message: string) => void;
  refreshing: boolean;
};

export default function Dossier({ company, onRefresh, onDelete, onToast, refreshing }: Props) {
  const [salesResponse, setSalesResponse] = useState<{ key: string; data: SalesData | null; error: boolean } | null>(null);
  const [pull, setPull] = useState(0);
  const [showCharts, setShowCharts] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const chartsAnchor = useRef<HTMLDivElement>(null);
  const requestKey = [company.id, company.kundenNr, company.lastResearchAt].join(":");
  const sales = salesResponse?.key === requestKey ? salesResponse.data : null;
  const salesLoading = Boolean(company.kundenNr) && salesResponse?.key !== requestKey;
  const salesError = salesResponse?.key === requestKey && salesResponse.error;

  useEffect(() => {
    if (!company.kundenNr) return;
    const controller = new AbortController();
    fetch(`/api/sap/${encodeURIComponent(company.kundenNr)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Vertriebsdaten nicht erreichbar");
        return response.json();
      })
      .then((value) => {
        const data = value as SalesData;
        if (!data || !["connected", "not_configured", "error"].includes(data.status) || !Array.isArray(data.umsatzJeJahr) || !Array.isArray(data.produktgruppenMix) || !Array.isArray(data.historie)) throw new Error("Ungültige SAP-Antwort");
        setSalesResponse({ key: requestKey, data, error: false });
      })
      .catch((error) => { if (error.name !== "AbortError") setSalesResponse({ key: requestKey, data: null, error: true }); });
    return () => controller.abort();
  }, [company.kundenNr, requestKey]);

  useEffect(() => {
    const element = chartsAnchor.current;
    if (!element || sales?.status !== "connected") return;
    if (typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setShowCharts(true));
      return () => window.cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setShowCharts(true); observer.disconnect(); }
    }, { rootMargin: "250px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [sales]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let start: { x: number; y: number } | null = null;
    let distance = 0;
    const onStart = (event: TouchEvent) => {
      if (event.touches.length === 1 && getScrollTop(element) <= 3 && !refreshing) start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const dy = event.touches[0].clientY - start.y;
      const dx = event.touches[0].clientX - start.x;
      if (Math.abs(dx) > Math.abs(dy) || dy < 0) { start = null; return; }
      distance = dy;
      if (dy > 12) {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        setPull(Math.min(84, dy * 0.5));
      }
    };
    const onEnd = () => {
      if (start && distance >= 125) onRefresh();
      start = null; distance = 0; setPull(0);
    };
    const onCancel = () => { start = null; distance = 0; setPull(0); };
    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd);
    element.addEventListener("touchcancel", onCancel);
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onCancel);
    };
  }, [onRefresh, refreshing]);

  const connected = sales?.status === "connected";
  const hasAiBriefing = company.analysisMethod === "ai" && Boolean(company.analysisSummary?.trim());
  const printSignalLimit = hasAiBriefing ? 2 : 3;
  const orderedSales = connected ? [...sales.umsatzJeJahr].sort((a, b) => a.jahr - b.jahr) : [];
  const latestSales = orderedSales.at(-1);
  const opportunities = company.signals.filter((signal) => signal.impact === "opportunity");
  const risks = company.signals.filter((signal) => signal.impact === "risk");
  const verifiedSignals = company.signals.filter((signal) => signal.origin !== "live");
  const hasVerifiedRisk = verifiedSignals.some((signal) => signal.impact === "risk");
  const hasVerifiedOpportunity = verifiedSignals.some((signal) => signal.impact === "opportunity");
  const attention = hasVerifiedRisk && risks.some((signal) => signal.priority === "hoch" && signal.origin !== "live")
    ? { tone: "red", symbol: "✗", label: "Handlungsbedarf", detail: "Mindestens ein bestätigtes externes Risiko mit hoher Priorität. Interne Entwicklung und Auswirkungen im Gespräch prüfen." }
    : hasVerifiedOpportunity && !hasVerifiedRisk
      ? { tone: "green", symbol: "✓", label: "Chance prüfen", detail: "Bestätigte externe Chancen und keine bestätigten Risiken in den vorliegenden Quellen. Die interne Entwicklung ist separat zu prüfen." }
      : { tone: "amber", symbol: "!", label: "Im Blick behalten", detail: "Die externen Quellen ergeben ein gemischtes oder unvollständiges Bild. Fehlende Signale bedeuten keine Entwarnung." };
  const history = [...(company.revenueHistory ?? [])].sort((a, b) => a.year - b.year);
  const last = history.at(-1);
  const previous = history.at(-2);
  const change = last && previous && previous.value > 0 ? (last.value / previous.value - 1) * 100 : null;
  const trendSymbol = change === null ? "—" : change > 1 ? "↗" : change < -1 ? "↘" : "→";
  const trend = change === null ? "Noch offen" : `${change > 0 ? "+" : ""}${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(change)} %`;
  const identityUnverified = !company.website || (!company.revenue && !company.employees && verifiedSignals.length === 0);
  const prioritySignals = [...company.signals].sort((a, b) => ({ hoch: 0, mittel: 1, niedrig: 2 }[a.priority] - { hoch: 0, mittel: 1, niedrig: 2 }[b.priority]));
  const firstOpportunity = opportunities.find((signal) => signal.origin !== "live") ?? opportunities[0];
  const firstRisk = risks.find((signal) => signal.origin !== "live") ?? risks[0];
  const steps: { title: string; text: string; source?: Source }[] = [
    ...(identityUnverified ? [{ title: "Unternehmen eindeutig zuordnen", text: "Firmierung, Standort und Website mit dem Ansprechpartner abgleichen, bevor Treffer diesem Kunden zugeordnet werden." }] : []),
    ...(firstRisk ? [{ title: "Risiko im Gespräch einordnen", text: `„${firstRisk.title}“: Auswirkungen auf Abrufe, Auslastung und geplante Projekte konkret erfragen.`, source: firstRisk.source }] : []),
    ...(firstOpportunity ? [{ title: "Konkreten Projektbedarf erfragen", text: `„${firstOpportunity.title}“ als Gesprächseinstieg nutzen. Bedarf an Hydraulik, Filtration, Speichertechnik und Sensorik mit dem Kunden prüfen.`, source: firstOpportunity.source }] : []),
    ...(!connected ? [{ title: "Internes Kundenbild ergänzen", text: "SAP-Kundennummer zuordnen und Vertriebsdaten anbinden. Erst danach Umsatztrend, Produktgruppen und mögliche Versorgungslücken bewerten." }] : []),
    ...(!firstRisk && !firstOpportunity ? [{ title: "Aktualität beim Kunden abgleichen", text: "Auslastung, Investitionsplanung und laufende Projekte ansprechen. Ohne belastbare Signale ist keine externe Wachstumsbewertung möglich." }] : []),
  ];
  const conversation = firstRisk
    ? `„Wie wirkt sich ${firstRisk.title.replace(/[.!]$/, "")} auf Ihre Planung aus – und wo können wir Sie unterstützen?“`
    : firstOpportunity
      ? `„Welche Anforderungen entstehen durch ${firstOpportunity.title.replace(/[.!]$/, "")} für Ihre Hydraulik- und Fluidtechnik?“`
      : "„Welche Projekte und Veränderungen beschäftigen Sie aktuell, und wo können wir Sie unterstützen?“";

  async function share() {
    const url = new URL(window.location.href);
    url.searchParams.delete("kunde");
    url.searchParams.delete("tab");
    url.hash = new URLSearchParams({ tab: "dossier", kunde: company.id, firma: company.name }).toString();
    try {
      if (navigator.share) await navigator.share({ title: `${company.name} · Kundenmarkt-Scout`, text: `Kundendossier für ${company.name}`, url: url.toString() });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url.toString()); onToast("Dossier-Link kopiert."); }
      else { window.prompt("Dossier-Link kopieren", url.toString()); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) onToast("Teilen nicht möglich. Den Link in der Adressleiste kopieren.");
    }
  }

  async function printDossier() {
    if (connected) await import("./Charts");
    setShowCharts(true);
    window.setTimeout(() => window.print(), 200);
  }

  return (
    <div className={`dossier${hasAiBriefing ? " ds-has-ai" : ""}`} ref={root}>
      {pull > 0 && <div className="ds-pull" style={{ height: pull }} aria-live="polite"><Icon name="refresh" size={18} />{pull >= 62 ? "Loslassen zum Aktualisieren" : "Zum Aktualisieren ziehen"}</div>}
      <header className="ds-heading">
        <div><p className="ds-eyebrow">KUNDENDOSSIER</p><h1>{company.name}</h1><p className="ds-company-detail">{[company.legalForm, company.location, company.industry].filter(Boolean).join(" · ") || "Stammdaten noch zu ergänzen"}</p>{company.profileSource && <SourceLine source={company.profileSource} />}</div>
        <div className="ds-heading-actions">
          <button type="button" className="ds-icon-button" onClick={share} aria-label={`Dossier ${company.name} teilen`}><Icon name="share" size={20} /></button>
          <button type="button" className={`ds-icon-button ${refreshing ? "ds-spinning" : ""}`} disabled={refreshing} onClick={onRefresh} aria-label="Dossier aktualisieren"><Icon name="refresh" size={20} /></button>
        </div>
      </header>
      <div className="ds-update"><span className={`ds-live-dot ${!company.verifiedAt && !company.lastResearchAt ? "ds-unverified-dot" : ""}`} aria-hidden="true" /><span>{company.lastResearchAt || company.verifiedAt ? `Recherchiert am ${date(company.lastResearchAt || company.verifiedAt)}` : "Noch nicht verifiziert"}</span><span className="ds-external-badge">Externe Quellen</span></div>
      <p className="ds-relationship"><Icon name="info" size={16} />{company.relationshipStatus || (company.kundenNr ? `SAP-Zuordnung: ${company.kundenNr}` : "Geschäftsbeziehung nicht geprüft")}</p>

      <section className="ds-kpis" aria-label="Kennzahlen">
        <article className="ds-kpi">
          <span className="ds-kpi-label">Kundenumsatz</span>
          <strong>{company.revenue ? money(company.revenue.value) : "Noch offen"}</strong>
          {company.scope && <span className="ds-source">{company.scope}</span>}
          {company.revenue ? <SourceLine source={company.revenue.source} year={company.revenue.year} /> : <span className="ds-source">Keine belastbare Quelle vorhanden</span>}
        </article>
        <article className="ds-kpi">
          <span className="ds-kpi-label">Unser Umsatz</span>
          <strong className={!latestSales ? "ds-muted-value" : ""}>{latestSales ? money(latestSales.umsatz) : "—"}</strong>
          <span className="ds-source">{latestSales ? `${sales?.source} · ${latestSales.jahr}` : salesLoading ? "SAP wird abgefragt …" : salesError || sales?.status === "error" ? "SAP nicht erreichbar" : connected ? "Kein Umsatzwert vorhanden" : "SAP noch nicht verbunden"}</span>
        </article>
        <article className="ds-kpi">
          <span className="ds-kpi-label">Externer Umsatztrend</span>
          <strong className={change !== null && change < -1 ? "ds-amber-text" : ""}><span aria-hidden="true">{trendSymbol}</span> {trend}</strong>
          {last && previous ? <><span className="ds-source">Berechnet: {previous.year} → {last.year}</span><SourceLine source={last.source} /></> : <span className="ds-source">Zwei Jahreswerte erforderlich</span>}
        </article>
        <button type="button" className={`ds-kpi ds-kpi-status ds-status-${attention.tone}`} onClick={() => onToast(attention.detail)} aria-label={`Vorläufige externe Ampel: ${attention.label}. Erläuterung anzeigen`}>
          <span className="ds-kpi-label">Externe Einschätzung</span>
          <strong><span className="ds-status-circle" aria-hidden="true">{attention.symbol}</span><span>{attention.label}</span></strong>
          <span className="ds-source">Vorläufig · regelbasiert <Icon name="info" size={16} /></span>
        </button>
      </section>

      {hasAiBriefing && <aside className="ds-ai-brief" aria-labelledby="ai-brief-title">
        <div><Icon name="sparkles" size={21} /><h2 id="ai-brief-title">KI-Gesprächsbriefing</h2><span>Quelleninterpretation</span></div>
        <p className="ds-screen-only">{company.analysisSummary}</p>
        <p className="ds-print-only">{company.analysisSummary!.length > 280 ? `${company.analysisSummary!.slice(0, 280).trimEnd()} …` : company.analysisSummary}</p>
        <span className="ds-source">Automatisch aus den vorliegenden Quellen zusammengefasst. Belege und Originalmeldungen unter „Externe Signale“ prüfen.</span>
      </aside>}

      <div className="ds-content-grid">
        <section className="ds-section ds-signals-section">
          <div className="ds-section-heading"><h2><Icon name="globe" size={21} />Externe Signale</h2><span className="ds-count">{company.signals.length}</span></div>
          <p className="ds-section-description">Was sich beim Kunden bewegt.</p>
          {prioritySignals.length ? <div className="ds-signals">{prioritySignals.map((signal) => <SignalCard key={signal.id} signal={signal} referenceNumber={hasAiBriefing ? company.signals.findIndex(s => s.id === signal.id) + 1 : undefined} />)}</div> : <div className="ds-empty"><Icon name="signal" size={28} /><h3>Noch keine belastbaren Signale</h3><p>Die Web-Recherche kann neue Quellen liefern. Fehlende Treffer erlauben keine Aussage zur Geschäftslage.</p><button type="button" className="ds-secondary-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" size={18} />Recherche aktualisieren</button></div>}
          {prioritySignals.length > printSignalLimit && <p className="ds-print-only ds-source">PDF-Auszug: die {printSignalLimit === 2 ? "zwei" : "drei"} höchstpriorisierten Signale. Das digitale Dossier enthält alle Signale und Quellen.</p>}
          {company.employees && <div className="ds-employee-fact"><span><strong>{number(company.employees.value)}</strong> Mitarbeitende</span><SourceLine source={company.employees.source} year={company.employees.year} /></div>}
        </section>

        <section className="ds-section ds-sales-section">
          <div className="ds-section-heading"><h2><Icon name="chart" size={21} />Unsere Entwicklung</h2>{connected && <span className="ds-connected">✓ SAP verbunden</span>}</div>
          <p className="ds-section-description">Unser Geschäft mit {company.name}.</p>
          {connected && sales ? (
            <div ref={chartsAnchor}>
              {showCharts ? <Suspense fallback={<p className="ds-source">Diagramme werden geladen …</p>}><Charts sales={sales} /></Suspense> : <div className="ds-chart-placeholder" aria-busy="true">Umsatz und Produktgruppen werden geladen …</div>}
              <div className="ds-sales-facts"><div><span>Artikel im Materialstamm</span><strong>{sales.artikelImStamm !== null ? number(sales.artikelImStamm) : "Nicht vorhanden"}</strong><span className="ds-source">{sales.source}</span></div><div><span>Letzter Bestelleintrag</span><strong>{sales.historie.length ? date([...sales.historie].sort((a, b) => b.datum.localeCompare(a.datum))[0].datum) : "Nicht vorhanden"}</strong><span className="ds-source">{sales.source}</span></div></div>
            </div>
          ) : (
            <div className="ds-sap-empty">
              <div className="ds-sap-icon"><Icon name="briefcase" size={24} /></div>
              <div><h3>{salesLoading ? "Vertriebsdaten werden abgefragt" : salesError || sales?.status === "error" ? "SAP derzeit nicht erreichbar" : "Das interne Bild fehlt noch"}</h3><p>{sales?.message || "Mit der SAP-Anbindung sehen Sie hier unseren Umsatz, den Produktgruppen-Mix und den Bestellverlauf."}</p><span className="ds-prepared"><span aria-hidden="true">○</span> Schnittstelle vorbereitet</span></div>
            </div>
          )}
          {!connected && <p className="ds-source ds-note">Interne Umsätze und Bestellungen werden erst mit echten SAP-Daten bewertet.</p>}
        </section>

        <section className="ds-section ds-assessment-section">
          <div className="ds-section-heading"><h2><Icon name="target" size={21} />Chancen &amp; Risiken</h2></div>
          <p className="ds-section-description">Aus den Quellen abgeleitet · keine Prognose.</p>
          <div className="ds-assessments">
            <div className="ds-assessment ds-assessment-chance"><h3><span aria-hidden="true">↗</span> Chancen</h3>{opportunities.length ? <ul>{opportunities.slice(0, 3).map((signal) => <li key={signal.id}><span>{signal.title}</span><SourceLine source={signal.source} /></li>)}</ul> : <p>Aus den vorliegenden Quellen noch keine konkrete Chance ableitbar.</p>}</div>
            <div className="ds-assessment ds-assessment-risk"><h3><span aria-hidden="true">!</span> Risiken</h3>{risks.length ? <ul>{risks.slice(0, 3).map((signal) => <li key={signal.id}><span>{signal.title}</span><SourceLine source={signal.source} /></li>)}</ul> : <p>Keine konkreten Risiken in den vorliegenden Quellen. Das ist keine Entwarnung.</p>}</div>
          </div>
          <div className="ds-conversation"><span className="ds-eyebrow">IHR GESPRÄCHSEINSTIEG</span><p>{conversation}</p><span className="ds-source">Formulierungsvorschlag aus den vorliegenden Signalen</span></div>
        </section>

        <section className="ds-section ds-steps-section">
          <div className="ds-section-heading"><h2><Icon name="check" size={21} />Nächste Schritte</h2></div>
          <p className="ds-section-description">Für Ihren nächsten Kundentermin.</p>
          <ol className="ds-steps">{steps.map((step, index) => <li key={step.title}><span className="ds-step-number" aria-hidden="true">{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p>{step.source ? <SourceLine source={step.source} /> : <span className="ds-source">Regelbasierte Empfehlung · Datenlage im Dossier</span>}</div></li>)}</ol>
        </section>
      </div>

      <footer className="ds-footer">
        <button type="button" className="ds-primary-button" onClick={printDossier}><Icon name="download" size={20} />Dossier als PDF exportieren</button>
        <button type="button" className="ds-secondary-button" onClick={share}><Icon name="share" size={20} />Dossier teilen</button>
        <p className="ds-source">Externe Recherche und regelbasierte Einordnung. Quellen vor einer geschäftlichen Entscheidung prüfen.</p>
        <button type="button" className="ds-delete-button" onClick={onDelete}><Icon name="trash" size={18} />Dossier entfernen</button>
      </footer>
    </div>
  );
}
