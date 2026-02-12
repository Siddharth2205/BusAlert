export type UpdatedBusesResponse = {
  count: number;
  buses: Array<{
    type: "Feature";
    properties: { b: number; r: number; line: string; dir: number; offset: number; speed: number };
    geometry: { type: "Point"; coordinates: [string, string] }; // [lon, lat]
  }>;
};

export async function getUpdatedBuses(API_BASE: string) {
  const r = await fetch(`${API_BASE}/api/buses/updated`);
  if (!r.ok) throw new Error(`updated buses failed: ${r.status}`);
  return (await r.json()) as UpdatedBusesResponse;
}
