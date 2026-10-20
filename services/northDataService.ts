/** North Data requires a licensed API integration; no website scraping or fake data. */
export function getNorthDataStatus() {
  return {
    name: "North Data",
    status: "not_configured",
    message: "Lizenzierte North-Data-Schnittstelle noch nicht angebunden.",
  };
}

export async function getUnternehmensdaten(query: string) {
  return { ...getNorthDataStatus(), query, company: null };
}
