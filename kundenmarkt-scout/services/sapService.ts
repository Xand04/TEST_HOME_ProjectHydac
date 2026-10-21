import type { SalesData } from "../lib/types";

type SapCustomer = { kundenNr: string; name: string };
type CustomerList = {
  status: SalesData["status"];
  source: string;
  message?: string;
  kunden: SapCustomer[];
};
type JsonRecord = Record<string, unknown>;

const SOURCE = "SAP OData";
const MAX_RESPONSE = 4_000_000;
const asRecord = (value: unknown): JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : {};
const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const asText = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

function blank(status: SalesData["status"], message: string): SalesData {
  return { status, source: SOURCE, message, umsatzJeJahr: [], produktgruppenMix: [], artikelImStamm: null, historie: [] };
}

/** Accept OData V4 collections, OData V2 collections and expanded navigation collections. */
function collection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (Array.isArray(record.value)) return record.value;
  if (Array.isArray(record.results)) return record.results;
  return [];
}

function unwrap(value: unknown): unknown {
  const record = asRecord(value);
  return record.d ?? value;
}

function configuration(path: "customers" | "sales"): { base: URL; path: string } | undefined {
  const baseValue = process.env.SAP_ODATA_BASE_URL;
  const configuredPath = path === "customers" ? process.env.SAP_ODATA_CUSTOMERS_PATH : process.env.SAP_ODATA_SALES_PATH;
  if (!baseValue || !configuredPath) return;
  const base = new URL(baseValue.endsWith("/") ? baseValue : `${baseValue}/`);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) {
    throw new Error("SAP_ODATA_BASE_URL muss HTTPS verwenden.");
  }
  return { base, path: configuredPath };
}

export function getSapStatus() {
  const configured = Boolean(process.env.SAP_ODATA_BASE_URL && process.env.SAP_ODATA_SALES_PATH);
  return {
    name: "SAP",
    status: configured ? "configured" : "not_configured",
    message: configured
      ? "SAP OData konfiguriert; Verbindungsprüfung erfolgt beim Datenabruf."
      : "Noch nicht verbunden. Umsätze, Produktmix und Artikelzahlen werden erst aus SAP übernommen.",
  };
}

async function request(path: "customers" | "sales", kundenNr?: string): Promise<unknown | undefined> {
  const config = configuration(path);
  if (!config) return;
  let pathValue = config.path;
  if (kundenNr) {
    if (!/^[\p{L}\p{N}_-]{1,40}$/u.test(kundenNr)) throw new Error("Ungültige SAP-Kundennummer.");
    if (!pathValue.includes("{kundenNr}")) throw new Error("SAP_ODATA_SALES_PATH benötigt den Platzhalter {kundenNr}.");
    pathValue = pathValue.replaceAll("{kundenNr}", encodeURIComponent(kundenNr));
  }
  const url = new URL(pathValue, config.base);
  if (url.origin !== config.base.origin) throw new Error("SAP-Endpunkte müssen zum konfigurierten SAP-System gehören.");
  url.searchParams.set("$format", "json");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.SAP_BEARER_TOKEN) headers.Authorization = `Bearer ${process.env.SAP_BEARER_TOKEN}`;
  else if (process.env.SAP_USERNAME && process.env.SAP_PASSWORD) {
    headers.Authorization = `Basic ${Buffer.from(`${process.env.SAP_USERNAME}:${process.env.SAP_PASSWORD}`).toString("base64")}`;
  }
  if (process.env.SAP_CLIENT) headers["sap-client"] = process.env.SAP_CLIENT;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`SAP-Abruf fehlgeschlagen (HTTP ${response.status}).`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_RESPONSE) throw new Error("Die SAP-Antwort überschreitet die erlaubte Größe.");
  const body = await response.text();
  if (body.length > MAX_RESPONSE) throw new Error("Die SAP-Antwort überschreitet die erlaubte Größe.");
  try {
    return unwrap(JSON.parse(body));
  } catch {
    throw new Error("SAP liefert keine gültige JSON-Antwort.");
  }
}

/**
 * The two paths are deliberate integration seams: expose canonical projections via
 * a customer-owned CDS/OData service or adapt normalizeSales to the SAP schema.
 * No assumptions about an enterprise's custom S/4HANA sales model are fabricated.
 */
export function normalizeSales(raw: unknown): SalesData {
  const rows = collection(raw);
  if (rows.length > 1) return blank("error", "Die SAP-Antwort enthält mehrere Kunden. Bitte die OData-Projektion auf die Kundennummer begrenzen.");
  const record = asRecord(rows.length ? rows[0] : raw);
  if (!("umsatzJeJahr" in record) && !("produktgruppenMix" in record) && !("historie" in record) && !("artikelImStamm" in record)) {
    return blank("error", "Das SAP-Antwortschema passt noch nicht. Bitte die OData-Projektion im sapService zuordnen.");
  }
  const umsatzJeJahr = collection(record.umsatzJeJahr).flatMap((value) => {
    const item = asRecord(value);
    const jahr = asNumber(item.jahr);
    const umsatz = asNumber(item.umsatz);
    return jahr !== null && Number.isInteger(jahr) && jahr >= 1990 && jahr <= new Date().getFullYear() + 1 && umsatz !== null
      ? [{ jahr, umsatz }] : [];
  }).sort((a, b) => a.jahr - b.jahr);
  const produktgruppenMix = collection(record.produktgruppenMix).flatMap((value) => {
    const item = asRecord(value);
    const name = asText(item.name).slice(0, 80);
    const prozent = asNumber(item.prozent);
    return name && prozent !== null && prozent <= 100 ? [{ name, prozent }] : [];
  });
  const historie = collection(record.historie).flatMap((value) => {
    const item = asRecord(value);
    const datum = asText(item.datum);
    const bestellungen = asNumber(item.bestellungen);
    const umsatz = asNumber(item.umsatz);
    return /^\d{4}-\d{2}-\d{2}$/.test(datum) && Number.isFinite(Date.parse(datum)) && bestellungen !== null
      ? [{ datum, bestellungen, ...(umsatz !== null ? { umsatz } : {}) }] : [];
  }).sort((a, b) => a.datum.localeCompare(b.datum));
  const artikel = asNumber(record.artikelImStamm);
  if (produktgruppenMix.reduce((sum, item) => sum + item.prozent, 0) > 100.1) {
    return blank("error", "Die SAP-Produktgruppen ergeben mehr als 100 Prozent. Bitte die Zuordnung im sapService prüfen.");
  }
  return {
    status: "connected", source: SOURCE, umsatzJeJahr, produktgruppenMix,
    artikelImStamm: artikel !== null && Number.isInteger(artikel) ? artikel : null,
    historie,
  };
}

export async function getKundenliste(): Promise<CustomerList> {
  try {
    const raw = await request("customers");
    if (raw === undefined) return { status: "not_configured", source: SOURCE, message: "SAP-Kundenliste noch nicht angebunden.", kunden: [] };
    const kunden = collection(raw).flatMap((value) => {
      const row = asRecord(value);
      const kundenNr = asText(row[process.env.SAP_CUSTOMER_ID_FIELD || "kundenNr"]);
      const name = asText(row[process.env.SAP_CUSTOMER_NAME_FIELD || "name"]);
      return kundenNr && name ? [{ kundenNr, name }] : [];
    });
    return { status: "connected", source: SOURCE, kunden };
  } catch (error) {
    return { status: "error", source: SOURCE, message: safeError(error), kunden: [] };
  }
}

function safeError(error: unknown): string {
  if (error instanceof Error && /^(SAP-|SAP |Die SAP|Ungültige SAP)/.test(error.message)) return error.message;
  return "SAP ist derzeit nicht erreichbar. Zugangsdaten, Netzwerk und OData-Endpunkte prüfen.";
}

export async function getVertriebZuKunde(kundenNr: string): Promise<SalesData> {
  try {
    const raw = await request("sales", kundenNr);
    if (raw === undefined) return blank("not_configured", getSapStatus().message);
    return normalizeSales(raw);
  } catch (error) {
    return blank("error", safeError(error));
  }
}
