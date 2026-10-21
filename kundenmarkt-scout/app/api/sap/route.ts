import { getKundenliste } from "@/services/sapService";

export async function GET() {
  const result = await getKundenliste();
  return Response.json(result, {
    status: result.status === "error" ? 502 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
