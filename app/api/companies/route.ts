import { getVerifiedCompanies } from "@/services/companyService";

export async function GET() {
  return Response.json({ companies: getVerifiedCompanies() }, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
