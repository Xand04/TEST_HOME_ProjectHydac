import { getNorthDataStatus } from "@/services/northDataService";
import { getSapStatus } from "@/services/sapService";
import { getAIStatus } from "@/services/aiService";

export async function GET() {
  return Response.json({
    providers: [
      { name: "Web", status: "ready", message: "Öffentliche Nachrichtensuche ist eingerichtet. Die Erreichbarkeit wird bei jeder Recherche geprüft." },
      getNorthDataStatus(),
      getSapStatus(),
      getAIStatus(),
    ],
    method: "rules",
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
