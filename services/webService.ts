import type { Signal } from "../lib/types";

export type ResearchResult = {
  signals: Signal[];
  provider: string;
  status: "connected" | "empty" | "error";
  message: string;
  fetchedAt: string;
  cached: boolean;
};

type FeedItem = { title: string; link: string; date: string; publisher: string };
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, ResearchResult>();

/**
 * These public feeds require no API key. Their terms restrict commercial reuse:
 * a production enterprise rollout needs an appropriate provider agreement.
 * WEB_RESEARCH_PROVIDER selects google (default) or bing, with the other as fallback.
 * Only headline metadata is retained; article bodies are never copied.
 */
export function cleanText(value: string): string {
  const entities: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  };
  let text = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  for (let pass = 0; pass < 2; pass++) {
    text = text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith("#")) {
        const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return entities[name] ?? entity;
    });
  }
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function validateQuery(value: unknown): string {
  if (typeof value !== "string") throw new Error("Bitte einen Firmennamen eingeben.");
  const query = cleanText(value).replace(/[“”"<>]/g, "").trim();
  if (query.length < 2 || query.length > 120) throw new Error("Der Firmenname muss 2 bis 120 Zeichen enthalten.");
  if (!/[\p{L}\p{N}]/u.test(query)) throw new Error("Bitte einen gültigen Firmennamen eingeben.");
  return query;
}

function xmlField(block: string, tag: string): string {
  return cleanText(block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] ?? "");
}

function safeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    // Bing's RSS URL wraps the original publisher URL. Keep the direct source.
    if (url.hostname === "www.bing.com" && url.pathname.includes("apiclick")) {
      const target = url.searchParams.get("url");
      if (target) return safeUrl(target);
    }
    return url.href;
  } catch {
    return;
  }
}

export function parseFeed(xml: string): FeedItem[] {
  if (!/<rss[\s>]/i.test(xml)) throw new Error("Die Nachrichtenquelle hat kein gültiges RSS geliefert.");
  const items: FeedItem[] = [];
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = xmlField(block, "title");
    const link = safeUrl(xmlField(block, "link"));
    const date = new Date(xmlField(block, "pubDate"));
    if (!title || !link || !Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 60_000) continue;
    const publisher = xmlField(block, "source") || xmlField(block, "News:Source") || new URL(link).hostname;
    items.push({ title: title.slice(0, 240), link, date: date.toISOString().slice(0, 10), publisher: publisher.slice(0, 90) });
  }
  return items;
}

function normalized(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** A quoted query alone is not sufficient: reject unrelated feed results locally. */
export function isRelevant(title: string, query: string, aliases: string[] = []): boolean {
  const headline = ` ${normalized(title)} `;
  return [query, ...aliases].some((candidate) => {
    const terms = normalized(candidate).split(" ").filter((word) =>
      !["gmbh", "co", "kg", "kgaa", "ag", "mbh", "se", "ltd", "inc", "the"].includes(word));
    return terms.length > 0 && terms.every((term) => headline.includes(` ${term} `));
  });
}

export function classifyHeadline(title: string): Pick<Signal, "type" | "impact" | "priority"> {
  const text = title.toLowerCase();
  // Conservative headline rules, not a financial or credit assessment.
  if (/\b(kein|keine|keinen|nicht)\b/.test(text)) return { type: "Meldung", impact: "neutral", priority: "niedrig" };
  if (/kurzarbeit/.test(text)) return { type: "Kurzarbeit", impact: "risk", priority: "hoch" };
  if (/insolven|stellenabbau|entlass|werksschließ|werkschließ|umsatzrückgang|gewinnwarnung/.test(text))
    return { type: "Marktrisiko", impact: "risk", priority: "hoch" };
  if (/investier|investition|millionen.{0,30}(werk|fabrik)|neues? werk|werk.{0,25}(ausbau|erweiter)|forschungszentrum/.test(text))
    return { type: "Investition", impact: "opportunity", priority: "mittel" };
  if (/förder|subvention/.test(text)) return { type: "Förderung", impact: "opportunity", priority: "mittel" };
  if (/patent/.test(text)) return { type: "Patent", impact: "opportunity", priority: "mittel" };
  if (/wachstum|umsatzplus|umsatz.{0,12}(steigt|gestiegen)|rekordumsatz/.test(text))
    return { type: "Wachstum", impact: "opportunity", priority: "mittel" };
  return { type: "Meldung", impact: "neutral", priority: "niedrig" };
}

export function stableId(value: string): string {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

async function fetchFeed(provider: "google" | "bing", query: string): Promise<FeedItem[]> {
  const url = provider === "google"
    ? new URL("https://news.google.com/rss/search")
    : new URL("https://www.bing.com/news/search");
  url.searchParams.set("q", `"${query}"`);
  if (provider === "google") {
    url.searchParams.set("hl", "de");
    url.searchParams.set("gl", "DE");
    url.searchParams.set("ceid", "DE:de");
  } else {
    url.searchParams.set("format", "rss");
    url.searchParams.set("mkt", "de-DE");
  }
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8500),
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Nachrichtenquelle antwortet mit HTTP ${response.status}.`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 2_000_000) throw new Error("Antwort der Nachrichtenquelle ist zu groß.");
  const xml = await response.text();
  if (xml.length > 2_000_000) throw new Error("Antwort der Nachrichtenquelle ist zu groß.");
  return parseFeed(xml);
}

export async function searchCompany(queryInput: unknown, aliases: string[] = [], force = false): Promise<ResearchResult> {
  const query = validateQuery(queryInput);
  const key = `${normalized(query)}|${aliases.map(normalized).sort().join("|")}`;
  const previous = cache.get(key);
  if (!force && previous && Date.now() - new Date(previous.fetchedAt).getTime() < CACHE_MS) {
    return { ...previous, cached: true };
  }
  const preferred = process.env.WEB_RESEARCH_PROVIDER === "bing" ? "bing" : "google";
  const providers: ("google" | "bing")[] = [preferred, preferred === "google" ? "bing" : "google"];
  let reachedProvider = "";
  let found: FeedItem[] = [];
  let succeeded = false;
  for (const provider of providers) {
    try {
      const results = await fetchFeed(provider, query);
      succeeded = true;
      reachedProvider = provider === "google" ? "Google News RSS" : "Bing News RSS";
      found = results.filter((item) => isRelevant(item.title, query, aliases));
      if (found.length) break;
    } catch {
      // Try the second independent public source; failures are surfaced below.
    }
  }
  const unique = new Map<string, FeedItem>();
  for (const item of found.sort((a, b) => b.date.localeCompare(a.date))) {
    const canonicalTitle = normalized(item.title.replace(/\s[-–|]\s[^–|]+$/, ""));
    if (!unique.has(canonicalTitle)) unique.set(canonicalTitle, item);
  }
  const signals: Signal[] = [...unique.values()].slice(0, 12).map((item) => ({
    id: `web-${stableId(item.link)}`,
    ...classifyHeadline(item.title),
    title: item.title,
    summary: "Suchtreffer, nicht verifiziert. Die Einordnung folgt Schlagworten der Überschrift. Bitte den verlinkten Artikel prüfen.",
    date: item.date,
    source: { label: item.publisher, url: item.link, publishedAt: item.date },
    origin: "live",
  }));
  const result: ResearchResult = {
    signals,
    provider: reachedProvider || "Öffentliche Nachrichtensuche",
    status: !succeeded ? "error" : signals.length ? "connected" : "empty",
    message: !succeeded
      ? "Die Nachrichtenquellen sind derzeit nicht erreichbar. Gespeicherte Quellen bleiben verfügbar."
      : signals.length
        ? `${signals.length} passende Nachrichten gefunden. Überschriften sind noch nicht inhaltlich verifiziert.`
        : "Keine eindeutig passenden Nachrichten gefunden. Das belegt weder Stabilität noch das Fehlen von Risiken.",
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
  if (succeeded) {
    if (cache.size >= 150) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
  }
  return result;
}
