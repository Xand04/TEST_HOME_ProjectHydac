import { getVertriebZuKunde } from "@/services/sapService";

export async function GET(_request: Request, context: { params: Promise<{ kundenNr: string }> }) {
  const { kundenNr } = await context.params;
  if (!/^[\p{L}\p{N}_-]{1,40}$/u.test(kundenNr)) {
    return Response.json({ error: "Ungültige SAP-Kundennummer." }, { status: 400 });
  }
  const result = await getVertriebZuKunde(kundenNr);
  return Response.json(result, {
    status: result.status === "error" ? 502 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
