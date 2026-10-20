"use client";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import type { AnalysisResponse, Company } from "../lib/types";
const Portfolio = lazy(() => import("./Portfolio"));
const Dossier = lazy(() => import("./Dossier"));
const Compare = lazy(() => import("./Compare"));
type Tab = "portfolio" | "dossier" | "vergleich";
const storageKey = "kundenmarkt-scout-v1";
const tabs = [{ id: "portfolio" as Tab, label: "Portfolio", icon: "building" }, { id: "dossier" as Tab, label: "Dossier", icon: "briefcase" }, { id: "vergleich" as Tab, label: "Vergleich", icon: "chart" }];
export default function Scout() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("portfolio");
  const [ready, setReady] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [online, setOnline] = useState(true), [toast, setToast] = useState("");
  const [sheet, setSheet] = useState<"new" | "settings" | "delete" | null>(null);
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<AnalysisResponse["providers"]>([]);
  const [installEvent, setInstallEvent] = useState<any>(null), [updateReady, setUpdateReady] = useState(false);
  const touchStart = useRef<{ x: number; y: number; blocked: boolean } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const company = selected ? companies.find(c => c.id === selected) : companies[0];
  const notify = useCallback((message: string) => setToast(message), []);
  const open = useCallback((c: Company) => { setSelected(c.id); setTab("dossier"); window.scrollTo({ top: 0 }); }, []);
  useEffect(() => {
    let disposed = false, cached = false;
    try { const value = JSON.parse(localStorage.getItem(storageKey) || "null"); if (value?.companies && Array.isArray(value.companies)) { setCompanies(value.companies); setSelected(value.selected); cached = true; } } catch {}
    const readHash = () => { const p = new URLSearchParams(location.hash.slice(1)); const next = p.get("tab") as Tab; if (tabs.some(t => t.id === next)) setTab(next); if (p.get("kunde")) setSelected(p.get("kunde")); if (p.get("firma")) setQuery(p.get("firma")!.slice(0,120)); };
    readHash(); setReady(true);
    const controller = new AbortController();
    fetch("/api/companies", { signal: controller.signal }).then(r => { if (!r.ok) throw new Error("Quellenbestand konnte nicht geladen werden."); return r.json() as Promise<{ companies: Company[] }>; }).then(data => { if (!disposed && !cached) setCompanies(data.companies ?? []); }).catch(e => { if (!disposed && e.name === "TypeError") setOnline(false); if (!disposed && !cached) setError(e.message); }).finally(() => { if (!disposed) setLoading(false); });
    const connection = () => setOnline(navigator.onLine); connection();
    const install = (e: Event) => { e.preventDefault(); setInstallEvent(e); };
    const clearPrivate = (e: MessageEvent) => { if (e.data?.type === "CLEAR_PRIVATE_DATA") { try { localStorage.removeItem(storageKey); } catch {} setCompanies([]); setSelected(null); setTab("portfolio"); } };
    navigator.serviceWorker?.addEventListener("message", clearPrivate);
    addEventListener("online", connection); addEventListener("offline", connection); addEventListener("beforeinstallprompt", install); addEventListener("hashchange", readHash);
    if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(reg => { reg.update().catch(() => {}); if (reg.waiting) setUpdateReady(true); reg.addEventListener("updatefound", () => { reg.installing?.addEventListener("statechange", () => { if (reg.waiting && navigator.serviceWorker.controller) setUpdateReady(true); }); }); }).catch(() => {});
    }
    return () => { disposed = true; controller.abort(); removeEventListener("online", connection); removeEventListener("offline", connection); removeEventListener("beforeinstallprompt", install); removeEventListener("hashchange", readHash); navigator.serviceWorker?.removeEventListener("message", clearPrivate); };
  }, []);
  useEffect(() => { if (!ready || loading || error) return; try { localStorage.setItem(storageKey, JSON.stringify({ companies, selected })); } catch { notify("Gerätespeicher voll oder gesperrt. Dossiers können nicht offline gespeichert werden."); } }, [companies, selected, ready, loading, error, notify]);
  useEffect(() => { if (!ready) return; const p = new URLSearchParams({ tab }); if (selected) p.set("kunde", selected); if (company && tab === "dossier") p.set("firma", company.name); history.replaceState(null, "", `#${p}`); }, [tab, selected, ready, company]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 5500); return () => clearTimeout(timer); }, [toast]);
  const analyze = async (name: string, existing?: Company) => {
    if (busy || !name.trim()) return;
    if (!online) { notify("Du bist offline. Gespeicherte Dossiers bleiben verfügbar."); return; }
    setBusy(true); setProviders([]); setError(""); setSheet(null);
    const controller = new AbortController(); abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: name.trim(), force: !!existing }), signal: controller.signal });
      const data = await response.json() as AnalysisResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Recherche nicht erreichbar. Bitte erneut versuchen.");
      if (!data.company?.id) throw new Error("Die Recherche lieferte kein gültiges Dossier.");
      const prior = existing ?? companies.find(c => c.id === data.company.id);
      const webFailed = data.providers[0]?.status === "error";
      const updated = webFailed && prior ? { ...prior, researchStatus: data.providers[0].message } : { ...data.company, signals: data.signals ?? data.company.signals, lastResearchAt: data.fetchedAt };
      setCompanies(prev => prev.some(c => c.id === updated.id) ? prev.map(c => c.id === updated.id ? updated : c) : [...prev, updated]);
      setProviders(data.providers); open(updated);
      notify(webFailed ? "Webquellen derzeit nicht erreichbar. Der letzte gespeicherte Recherchestand bleibt erhalten." : data.signals.some(s => s.origin === "live") ? "Recherche aktualisiert. Neue Treffer bitte an der Originalquelle prüfen." : "Recherche abgeschlossen. Quellenstatus im Dossier beachten.");
    } catch (e: any) { const message = e.name === "AbortError" ? "Recherche abgebrochen oder Zeitlimit erreicht. Gespeicherte Daten bleiben erhalten." : e.message; notify(message); setError(message); }
    finally { clearTimeout(timeout); setBusy(false); abort.current = null; }
  };
  const switchTab = (next: Tab) => { setTab(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const doInstall = async () => { if (installEvent) { await installEvent.prompt(); setInstallEvent(null); } else notify("iPhone: In Safari auf Teilen → Zum Home-Bildschirm. Android: Browsermenü → App installieren."); };
  return <div className="app-shell">
    <header className="app-header"><a className="brand" href="#tab=portfolio" onClick={() => switchTab("portfolio")} aria-label="Kundenmarkt-Scout Vertriebsintelligenz Startseite"><span className="brand-mark"><Icon name="radar" size={26} /></span><span>Kundenmarkt<span className="brand-light">-Scout</span><small>VERTRIEBSINTELLIGENZ</small></span></a><div className="header-right"><span className="hydac">HYDAC<span>FLUIDTECHNIK</span></span><span className="header-divider" /><button className="avatar" aria-label="Verbindungen und App-Einstellungen" onClick={() => setSheet("settings")}><Icon name="settings" /></button></div></header>
    {!online && <div className="connection-banner" role="status"><Icon name="wifiOff" size={18} /> Offline · Du siehst den letzten gespeicherten Stand.</div>}
    {updateReady && <button className="update-banner" onClick={async () => { const reg = await navigator.serviceWorker.getRegistration(); navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true }); reg?.waiting?.postMessage({ type: "SKIP_WAITING" }); }}>Neue App-Version verfügbar <span>Jetzt aktualisieren ↗</span></button>}
    <main id="main-content" onTouchStart={e => { const target = e.target as HTMLElement; touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, blocked: !!target.closest("input,button,a,.filter-rail,.chart-zoom,select") }; }} onTouchEnd={e => { const start = touchStart.current; touchStart.current = null; if (!start || start.blocked || e.changedTouches.length !== 1) return; const dx = e.changedTouches[0].clientX - start.x, dy = e.changedTouches[0].clientY - start.y; if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 2) { const i = tabs.findIndex(t => t.id === tab); switchTab(tabs[Math.max(0, Math.min(2, i + (dx < 0 ? 1 : -1)))].id); } }}>
      <Suspense fallback={<div className="page-loading"><span className="spinner" /> Ansicht wird geladen …</div>}>
        {tab === "portfolio" && <Portfolio companies={companies} loading={loading} error={error} onOpen={open} onNew={() => { setQuery(""); setSheet("new"); }} onAnalyze={name => analyze(name)} onToast={notify} />}
        {tab === "dossier" && (company ? <Dossier company={company} onRefresh={() => analyze(company.name, company)} onDelete={() => setSheet("delete")} onToast={notify} refreshing={busy} /> : <div className="empty-state"><Icon name="briefcase" size={40} /><h1>{selected && query ? `Dossier für ${query}` : "Dein nächstes Kundengespräch beginnt hier."}</h1><p>{selected ? "Dieses Dossier ist auf diesem Gerät noch nicht gespeichert. Rufe die aktuellen öffentlichen Quellen ab, um es hier zu öffnen." : "Wähle ein Unternehmen im Portfolio oder starte eine Recherche."}</p><button className="primary-button" onClick={() => selected && query ? analyze(query) : setSheet("new")}>{selected && query ? "Quellen abrufen und Dossier öffnen" : "Unternehmen recherchieren"}</button></div>)}
        {tab === "vergleich" && <Compare companies={companies} onOpen={open} />}
      </Suspense>
      {tab === "dossier" && providers.length > 0 && <div className="provider-results">{providers.map(p => <p key={p.name}><strong>{p.name}:</strong> {p.message}</p>)}</div>}
    </main>
    <footer className="desktop-footer"><span>Öffentliche Quellen. Klarer Blick auf deine Kunden.</span><button onClick={() => setSheet("settings")}><span className={`connection-dot ${online ? "" : "offline"}`} />{online ? "Online" : "Offline"}<span className="footer-separator">/</span>SAP-Anbindung vorbereitet<Icon name="settings" size={17} /></button></footer>
    <nav className="tab-bar" aria-label="Hauptnavigation">{tabs.map(t => <button key={t.id} className={tab === t.id ? "active" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => switchTab(t.id)}><Icon name={t.icon} size={22} /><span>{t.label}</span>{tab === t.id && <span className="tab-dot" />}</button>)}</nav>
    {toast && <div className="toast" role="status"><Icon name="info" size={20} /><span>{toast}</span><button aria-label="Hinweis schließen" onClick={() => setToast("")}><Icon name="close" size={18} /></button></div>}
    {sheet === "new" && <Modal title="Ein Unternehmen. Alle Signale." onClose={() => setSheet(null)}><p className="muted">Recherchiere aktuelle Meldungen und lege ein Dossier mit verlinkten Quellen an.</p><form onSubmit={e => { e.preventDefault(); analyze(query); }}><label className="field-label" htmlFor="analysis-query">Unternehmensname</label><div className="search-field"><Icon name="search" /><input id="analysis-query" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="z. B. CLAAS oder ein Firmenname" minLength={2} maxLength={120} required autoComplete="organization" enterKeyHint="search" list="company-suggestions" /></div><datalist id="company-suggestions">{companies.map(c => <option key={c.id} value={c.name} />)}</datalist><div className="small-note"><Icon name="globe" size={20} /><span>Öffentliche Webquellen · Ergebnisse mit Quellenangaben<br />Interne Vertriebsdaten folgen nach der SAP-Anbindung.</span></div><button className="primary-button full-width" type="submit" disabled={query.trim().length < 2}><Icon name="sparkles" /> Recherche starten <Icon name="arrowRight" size={18} /></button></form></Modal>}
    {busy && <Modal title="Der Markt wird durchsuchbar." onClose={() => abort.current?.abort()}><p className="muted">Aktuelle Quellen werden für dein Dossier abgerufen.</p><div className="progress-stage"><span className="spinner" /><strong>Webquellen werden abgerufen …</strong></div><div className="progress-stage muted"><Icon name="link" /><span>North Data · Schnittstelle vorbereitet</span></div><div className="progress-stage muted"><Icon name="database" /><span>SAP · noch nicht verbunden</span></div><div className="indeterminate"><span /></div><button className="text-button full-width" onClick={() => abort.current?.abort()}>Recherche abbrechen</button></Modal>}
    {sheet === "delete" && company && <Modal title="Dossier entfernen?" onClose={() => setSheet(null)}><p>„{company.name}“ wird aus deinem lokalen Portfolio und dem Offline-Speicher dieses Geräts entfernt.</p><button className="danger-button full-width" onClick={() => { setCompanies(prev => prev.filter(c => c.id !== company.id)); setSelected(null); setSheet(null); setTab("portfolio"); notify("Dossier wurde von diesem Gerät entfernt."); }}>Dossier entfernen</button><button className="text-button full-width" onClick={() => setSheet(null)}>Behalten</button></Modal>}
    {sheet === "settings" && <Modal title="Bereit für unterwegs." onClose={() => setSheet(null)}><div className="setting-row"><Icon name="globe" /><div><strong>Externe Recherche</strong><p>Öffentliche Nachrichten und belegte Unternehmensquellen. „Aktualisieren“ ruft neue Treffer ab.</p></div></div><div className="setting-row"><Icon name="database" /><div><strong>SAP-Vertrieb</strong><p>OData-Service vorbereitet. Zugang und Kundenzuordnung werden serverseitig hinterlegt.</p></div></div><div className="setting-row"><Icon name="building" /><div><strong>North Data</strong><p>Adapter vorbereitet. Erfordert einen lizenzierten API-Zugang.</p></div></div><div className="setting-row"><Icon name="cloud" /><div><strong>Auf diesem Gerät gespeichert</strong><p>{companies.length} Dossiers. Letzter Stand auch ohne Empfang verfügbar, nachdem die App einmal vollständig geladen wurde.</p></div></div><div className="small-note"><Icon name="info" /><span>Mit konfiguriertem Modellzugang ergänzt die KI ein Quellenbriefing. Andernfalls werden Gesprächsansätze regelbasiert abgeleitet. Der Startbestand enthält recherchierte Unternehmen; Kundenbeziehungen sind unbestätigt.</span></div><button className="primary-button full-width" onClick={doInstall}><Icon name="download" /> Zum Home-Bildschirm hinzufügen</button></Modal>}
  </div>;
}
