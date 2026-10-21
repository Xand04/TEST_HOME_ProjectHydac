import { analyzeCompany } from "@/services/companyService";
import { validateQuery } from "@/services/webService";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 20_000) {
      return Response.json({ error: "Die Suchanfrage ist zu groß." }, { status: 413 });
    }
    const text = await request.text();
    if (text.length > 20_000) return Response.json({ error: "Die Suchanfrage ist zu groß." }, { status: 413 });
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      body = parsed as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Bitte eine gültige JSON-Suchanfrage senden." }, { status: 400 });
    }
    let query: string;
    try {
      query = validateQuery(body.query);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Ungültiger Firmenname." }, { status: 400 });
    }
    // Never accept asserted facts or SAP data from an untrusted request body.
    const result = await analyzeCompany(query, body.force === true);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Die Recherche konnte nicht abgeschlossen werden. Bitte erneut versuchen." }, { status: 502 });
  }
}
