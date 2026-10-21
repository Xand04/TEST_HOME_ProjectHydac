import { useEffect, useMemo, useState } from "react";
import type { Company, SalesData } from "../lib/types";

type AnnualSales = { jahr: number; umsatz: number };
export type SalesSnapshot = {
  status: SalesData["status"] | "loading";
  source: string;
  latest: AnnualSales | null;
  previous: AnnualSales | null;
  trend: number | null;
};
const empty = (status: SalesSnapshot["status"]): SalesSnapshot => ({
  status, source: "SAP", latest: null, previous: null, trend: null,
});
const keyFor = (company: Company) => JSON.stringify([company.kundenNr, company.lastResearchAt ?? ""]);

/** Component memory only: SAP responses never enter localStorage or a browser cache. */
export function useSalesData(companies: Company[]): Record<string, SalesSnapshot> {
  const [responses, setResponses] = useState<Record<string, SalesSnapshot>>({});
  const requestList = JSON.stringify([...new Map(companies.filter((company) => company.kundenNr)
    .map((company) => [keyFor(company), { key: keyFor(company), kundenNr: company.kundenNr! }])).values()]);

  useEffect(() => {
    const requests = JSON.parse(requestList) as { key: string; kundenNr: string }[];
    if (!requests.length) return;
    const controller = new AbortController();
    let cursor = 0;
    const worker = async () => {
      while (cursor < requests.length && !controller.signal.aborted) {
        const { key, kundenNr } = requests[cursor++];
        let snapshot: SalesSnapshot;
        try {
          const response = await fetch(`/api/sap/${encodeURIComponent(kundenNr)}`, {
            cache: "no-store", signal: controller.signal,
          });
          if (!response.ok) throw new Error("SAP nicht erreichbar");
          const data = await response.json() as Partial<SalesData>;
          if (!["connected", "not_configured", "error"].includes(data.status || "")) throw new Error("Ungültige SAP-Antwort");
          snapshot = empty(data.status as SalesData["status"]);
          if (data.status === "connected") {
            if (!Array.isArray(data.umsatzJeJahr)) throw new Error("Ungültige SAP-Umsätze");
            const years = data.umsatzJeJahr.filter((row) => row && Number.isInteger(row.jahr)
              && row.jahr >= 1990 && row.jahr <= new Date().getFullYear() + 1
              && typeof row.umsatz === "number" && Number.isFinite(row.umsatz) && row.umsatz >= 0)
              .sort((a, b) => a.jahr - b.jahr);
            const latest = years.at(-1) ?? null;
            const previous = years.filter((row) => row.jahr < (latest?.jahr ?? 0)).at(-1) ?? null;
            snapshot = {
              status: "connected", source: typeof data.source === "string" ? data.source.slice(0, 60) : "SAP",
              latest, previous,
              trend: latest && previous && previous.umsatz > 0 ? (latest.umsatz / previous.umsatz - 1) * 100 : null,
            };
          }
        } catch {
          if (controller.signal.aborted) return;
          snapshot = empty("error");
        }
        if (!controller.signal.aborted) setResponses((previous) => ({ ...previous, [key]: snapshot }));
      }
    };
    // Keep large portfolios from starting unbounded parallel OData requests.
    void Promise.all(Array.from({ length: Math.min(4, requests.length) }, () => worker()));
    return () => controller.abort();
  }, [requestList]);

  return useMemo(() => Object.fromEntries(companies.map((company) => [
    company.id, company.kundenNr ? responses[keyFor(company)] ?? empty("loading") : empty("not_configured"),
  ])), [companies, responses]);
}
