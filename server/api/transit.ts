import { fetchJson } from "./client";

export type StopTimePrediction = {
  pred_time: string;
  intersection: string;
  bus_id: number;
  stop_id: string;
  route_id: number;
  stop_time_id: number;
  line_name: string;
  last_stop: string;
  end_time: string;
};

export function getStopTimes(baseUrl: string, stopId: string, lim = 40) {
  const url = `${baseUrl}/api/stop_times?stop=${encodeURIComponent(stopId)}&lim=${encodeURIComponent(
    String(lim),
  )}`;
  return fetchJson<StopTimePrediction[]>(url);
}
