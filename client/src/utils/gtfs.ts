export type GtfsStop = {
  index: number;
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
};

export function normalizeLineName(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

export function routeKey(route_id: number, line_name: string) {
  return `${route_id}|${line_name}`;
}

export function getTriggerStop(destinations: GtfsStop[], destinationStopId: string) {
  const idx = destinations.findIndex((d) => d.stop_id === destinationStopId);
  if (idx <= 0) return null;
  return destinations[idx - 1]; // i-1
}
