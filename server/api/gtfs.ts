import { fetchJson } from "./client";

export type GtfsStop = {
  index: number;
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
};

export function getStopsForRouteDirection(
  baseUrl: string,
  routeShort: string,
  headsign: string,
) {
  const url = `${baseUrl}/api/gtfs/stops?route_short=${encodeURIComponent(
    routeShort,
  )}&headsign=${encodeURIComponent(headsign)}`;
  return fetchJson<GtfsStop[]>(url);
}
