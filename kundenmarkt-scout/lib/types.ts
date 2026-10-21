export type Source = { label: string; url: string; publishedAt?: string };
export type Fact = { value: number; year: number; source: Source };
export type Signal = { id: string; type: string; title: string; summary: string; date: string; source: Source; impact: "opportunity" | "risk" | "neutral"; priority: "hoch" | "mittel" | "niedrig"; origin?: "verified" | "live" };
export type Company = {
  id: string; name: string; legalForm?: string; location?: string; industry?: string;
  website?: string; aliases?: string[]; employees?: Fact; revenue?: Fact;
  scope?: string; relationshipStatus?: string; profileSource?: Source;
  revenueHistory?: Fact[]; signals: Signal[]; verifiedAt: string;
  kundenNr?: string; lastResearchAt?: string; researchStatus?: string;
  analysisSummary?: string; analysisMethod?: "rules" | "ai";
};
export type SalesData = {
  status: "connected" | "not_configured" | "error";
  source: string; message?: string;
  umsatzJeJahr: { jahr: number; umsatz: number }[];
  produktgruppenMix: { name: string; prozent: number }[];
  artikelImStamm: number | null;
  historie: { datum: string; bestellungen: number; umsatz?: number }[];
};
export type AnalysisResponse = {
  company: Company; signals: Signal[]; fetchedAt: string;
  providers: { name: string; status: string; message: string }[];
  summary?: string; method: "rules" | "ai";
};
