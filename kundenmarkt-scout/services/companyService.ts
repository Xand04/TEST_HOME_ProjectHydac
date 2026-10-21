import companiesData from "../data/verified-companies.json";
import type { AnalysisResponse, Company } from "../lib/types";
import { getNorthDataStatus } from "./northDataService";
import { getSapStatus } from "./sapService";
import { searchCompany, stableId, validateQuery } from "./webService";
import { generateBriefing } from "./aiService";

export function getVerifiedCompanies(): Company[] {
  return companiesData.map(company => ({ ...company, signals: company.signals.map(signal => ({ ...signal, origin: "verified" })) })) as Company[];
}

export function findCompany(query: string): Company | undefined {
  const term = query.trim().toLocaleLowerCase("de");
  return getVerifiedCompanies().find((company) =>
    [company.id, company.name, ...(company.aliases || [])].some((name) => name.toLocaleLowerCase("de") === term));
}

export async function analyzeCompany(queryInput: unknown, force = false): Promise<AnalysisResponse> {
  const query = validateQuery(queryInput);
  const known = findCompany(query);
  const research = await searchCompany(known?.aliases?.[0] || known?.name || query, known?.aliases || [], force);
  const base: Company = known || {
    id: `company-${stableId(query.toLocaleLowerCase("de"))}`,
    name: query,
    signals: [],
    verifiedAt: "",
    researchStatus: "Firmenidentität und Kennzahlen noch nicht verifiziert.",
  };
  // Keep independently verified source facts alongside explicitly unverified news.
  const verified = base.signals.filter((signal) => signal.origin !== "live");
  const urls = new Set(verified.map((signal) => signal.source.url));
  const signals = [...verified, ...research.signals.filter((signal) => !urls.has(signal.source.url))]
    .sort((a, b) => b.date.localeCompare(a.date));
  const company: Company = {
    ...base, signals, lastResearchAt: research.fetchedAt,
    researchStatus: known ? research.message : `Firmenidentität noch nicht verifiziert. ${research.message}`,
  };
  const briefing = await generateBriefing(company);
  company.analysisSummary = briefing.summary;
  company.analysisMethod = briefing.method;
  return {
    company,
    signals,
    fetchedAt: research.fetchedAt,
    providers: [
      { name: research.provider, status: research.status, message: `${research.message}${research.cached ? " Aus dem Suchcache (maximal 5 Minuten)." : ""}` },
      getNorthDataStatus(),
      getSapStatus(),
      briefing.providerStatus,
    ],
    summary: briefing.summary,
    method: briefing.method,
  };
}
