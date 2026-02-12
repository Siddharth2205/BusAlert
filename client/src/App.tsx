import { useEffect, useMemo, useRef, useState } from "react";

/** ---------------- Types ---------------- */
type ApiResp<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; details?: any };

type StopTimePrediction = {
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

type GtfsStop = {
  index: number;
  stop_id: string;
  stop_name: string;
  stop_lat: number | null;
  stop_lon: number | null;
};

type UpdatedBusFeature = {
  type: "Feature";
  properties: {
    b: number; // bus id
    r: number; // route short? (TransitLive uses route number)
    line: string; // line name
    dir: number;
    offset: number;
    speed: number;
  };
  geometry: {
    type: "Point";
    coordinates: [string, string]; // [lon, lat] as strings
  };
};

/** ---------------- Config ---------------- */
const API_BASE = "http://localhost:3001";
const ANCHOR_STOP_ID = "0261"; // internal stop

/** ---------------- Helpers ---------------- */
function log(...args: any[]) {
  console.log("[BUS-ALERT]", ...args);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Non-JSON response from ${url} (status ${res.status}): ${text.slice(0, 120)}...`,
    );
  }

  // Supports both shapes:
  // - { ok:true, data: ... }  (your server)
  // - raw JSON (if you ever return raw)
  if (parsed && typeof parsed === "object" && "ok" in parsed) {
    const payload = parsed as ApiResp<T>;
    if (!payload.ok) throw new Error(payload.error || "Request failed");
    return payload.data;
  }

  return parsed as T;
}

function normalizeLineName(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function routeKey(routeId: number, lineName: string) {
  return `${routeId}|${lineName}`;
}

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

// Haversine distance (meters)
function distMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestStop(stops: GtfsStop[], busLat: number, busLon: number) {
  let best: { stop: GtfsStop; d: number } | null = null;

  for (const s of stops) {
    if (s.stop_lat == null || s.stop_lon == null) continue;
    const d = distMeters(busLat, busLon, s.stop_lat, s.stop_lon);
    if (!best || d < best.d) best = { stop: s, d };
  }
  return best; // {stop, d} | null
}

/** ---------------- App ---------------- */
export default function App() {
  const alarmRef = useRef<HTMLAudioElement | null>(null);
  // selections
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [selectedBusId, setSelectedBusId] = useState("");
  const [selectedDestinationStopId, setSelectedDestinationStopId] =
    useState("");

  // data
  const [anchorPreds, setAnchorPreds] = useState<StopTimePrediction[]>([]);
  const [destinations, setDestinations] = useState<GtfsStop[]>([]);
  const [destPreds, setDestPreds] = useState<StopTimePrediction[]>([]);
  const [updatedBuses, setUpdatedBuses] = useState<UpdatedBusFeature[]>([]);

  // ui
  const [error, setError] = useState<string | null>(null);
  const [loadingAnchor, setLoadingAnchor] = useState(false);
  const [loadingStops, setLoadingStops] = useState(false);
  const [loadingEta, setLoadingEta] = useState(false);

  // alert state (on-screen only)
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const [alertOnScreen, setAlertOnScreen] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");

  // debug / baseline
  const [lastPollAt, setLastPollAt] = useState("—");
  const [nearestStopText, setNearestStopText] = useState("—");
  const [triggerStopText, setTriggerStopText] = useState("—");
  const lastNearestStopIdRef = useRef<string | null>(null);

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  /** -------- Loaders -------- */
  async function loadAnchor() {
    setLoadingAnchor(true);
    setError(null);
    try {
      const url = `${API_BASE}/api/stop_times?stop=${encodeURIComponent(ANCHOR_STOP_ID)}&lim=60`;
      const data = await fetchJson<StopTimePrediction[]>(url);
      setAnchorPreds(data);
      log("anchor stop_times loaded", {
        count: data.length,
        anchor: ANCHOR_STOP_ID,
      });
    } catch (e: any) {
      setError(String(e?.message || e));
      setAnchorPreds([]);
    } finally {
      setLoadingAnchor(false);
    }
  }

  async function loadStopsForRouteDirection(
    routeShort: string,
    headsign: string,
  ) {
    setLoadingStops(true);
    setError(null);
    try {
      const url =
        `${API_BASE}/api/gtfs/stops?route_short=${encodeURIComponent(routeShort)}` +
        `&headsign=${encodeURIComponent(headsign)}`;
      const stops = await fetchJson<GtfsStop[]>(url);
      setDestinations(stops);
      log("gtfs stops loaded", { routeShort, headsign, count: stops.length });
    } catch (e: any) {
      setError(String(e?.message || e));
      setDestinations([]);
    } finally {
      setLoadingStops(false);
    }
  }

  async function loadDestinationEta(stopId: string) {
    setLoadingEta(true);
    setError(null);
    try {
      const url = `${API_BASE}/api/stop_times?stop=${encodeURIComponent(stopId)}&lim=60`;
      const data = await fetchJson<StopTimePrediction[]>(url);
      setDestPreds(data);
      log("destination stop_times loaded", { stopId, count: data.length });
    } catch (e: any) {
      setError(String(e?.message || e));
      setDestPreds([]);
    } finally {
      setLoadingEta(false);
    }
  }

  async function loadUpdatedBuses() {
    const url = `${API_BASE}/api/buses/updated`;
    const payload = await fetchJson<{
      count: number;
      buses: UpdatedBusFeature[];
    }>(url);
    setUpdatedBuses(payload.buses || []);
    return payload.buses || [];
  }

  /** -------- Startup -------- */
  useEffect(() => {
    loadAnchor();
  }, []);

  /** -------- Route options from anchor predictions -------- */
  const routeOptions = useMemo(() => {
    const map = new Map<string, { route_id: number; line_name: string }>();
    for (const p of anchorPreds) {
      const cleanName = normalizeLineName(p.line_name);
      const key = routeKey(p.route_id, cleanName);
      if (!map.has(key))
        map.set(key, { route_id: p.route_id, line_name: cleanName });
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({
        key,
        label: `Route ${v.route_id} — ${v.line_name}`,
        route_id: v.route_id,
        line_name: v.line_name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [anchorPreds]);

  /** -------- Bus options for selected route+direction -------- */
  const busOptions = useMemo(() => {
    if (!selectedRouteKey) return [];
    const [ridStr, lineNameRaw] = selectedRouteKey.split("|");
    const rid = Number(ridStr);
    const lineName = normalizeLineName(lineNameRaw);

    const filtered = anchorPreds
      .filter(
        (p) =>
          p.route_id === rid && normalizeLineName(p.line_name) === lineName,
      )
      .sort((a, b) => a.pred_time.localeCompare(b.pred_time));

    const seen = new Set<number>();
    const out: { value: string; label: string }[] = [];
    for (const p of filtered) {
      if (seen.has(p.bus_id)) continue;
      seen.add(p.bus_id);
      out.push({
        value: String(p.bus_id),
        label: `Bus ${p.bus_id} · at anchor ${p.pred_time}`,
      });
    }
    return out;
  }, [anchorPreds, selectedRouteKey]);

  /** -------- Trigger stop (i-1) -------- */
  const triggerStop = useMemo(() => {
    if (!selectedDestinationStopId) return null;
    const idx = destinations.findIndex(
      (s) => s.stop_id === selectedDestinationStopId,
    );
    if (idx <= 0) return null;
    return destinations[idx - 1];
  }, [destinations, selectedDestinationStopId]);

  useEffect(() => {
    setTriggerStopText(
      triggerStop ? `${triggerStop.stop_name} (${triggerStop.stop_id})` : "—",
    );
  }, [triggerStop]);

  /** -------- Destination ETA -------- */
  const destinationEtaText = useMemo(() => {
    if (!selectedBusId || !selectedDestinationStopId) return "—";
    const match = destPreds.find(
      (p) => String(p.bus_id) === String(selectedBusId),
    );
    if (!match) return "No ETA yet for this bus at that stop.";
    return `ETA: ${match.pred_time}`;
  }, [destPreds, selectedBusId, selectedDestinationStopId]);

  /** -------- Reset baseline helper -------- */
  function resetBaseline(reason: string) {
    log("reset baseline:", reason);
    lastNearestStopIdRef.current = null;
    setAlertOnScreen(false);
    setAlertMsg("");
    stopAlarm();
    setNearestStopText("—");
    setLastPollAt("—");
  }
  function playAlarm() {
    try {
      if (!alarmRef.current) {
        const audio = new Audio("/alarm.mp3"); // from public/
        audio.loop = true;
        alarmRef.current = audio;
      }
      alarmRef.current.currentTime = 0;
      alarmRef.current.play();
    } catch (e) {
      console.warn("[BUS-ALERT] audio play failed", e);
    }
  }

  function stopAlarm() {
    if (alarmRef.current) {
      alarmRef.current.pause();
      alarmRef.current.currentTime = 0;
    }
  }

  /** -------- Selection change effects -------- */
  useEffect(() => {
    // route changed
    resetBaseline("route changed");
    setSelectedBusId("");
    setSelectedDestinationStopId("");
    setDestinations([]);
    setDestPreds([]);
    setArmed(false);

    if (!selectedRouteKey) return;

    const [ridStr, lineNameRaw] = selectedRouteKey.split("|");
    const routeShort = ridStr.trim();
    const headsign = normalizeLineName(lineNameRaw).toUpperCase();
    loadStopsForRouteDirection(routeShort, headsign);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteKey]);

  useEffect(() => {
    // bus changed
    resetBaseline("bus changed");
    setSelectedDestinationStopId("");
    setDestPreds([]);
    setArmed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBusId]);

  useEffect(() => {
    // destination changed
    resetBaseline("destination changed");
    setArmed(false);

    if (!selectedDestinationStopId) return;
    loadDestinationEta(selectedDestinationStopId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDestinationStopId]);

  /** -------- Polling: every 3s when armed -------- */
  useEffect(() => {
    if (!armed) return;
    if (!selectedBusId) return;
    if (!triggerStop) return;
    if (!destinations.length) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const pollStamp = new Date().toLocaleTimeString();
        setLastPollAt(pollStamp);

        const buses = await loadUpdatedBuses();
        if (cancelled) return;
        if (!armedRef.current) return; // guard after await

        // find selected bus in updated feed
        const bus = buses.find(
          (x) => String(x.properties.b) === String(selectedBusId),
        );
        if (!bus) {
          log("poll", {
            time: pollStamp,
            selectedBusId,
            note: "bus not found in updated feed",
          });
          return;
        }

        const [lonStr, latStr] = bus.geometry.coordinates;
        const busLon = Number(lonStr);
        const busLat = Number(latStr);

        const near = nearestStop(destinations, busLat, busLon);
        if (!near) {
          log("poll", {
            time: pollStamp,
            selectedBusId,
            note: "no stops with lat/lon",
          });
          return;
        }

        setNearestStopText(
          `${near.stop.stop_name} (${near.stop.stop_id}) ~${Math.round(near.d)}m`,
        );
        log("poll", {
          time: pollStamp,
          selectedBusId,
          busPos: { lat: busLat, lon: busLon },
          nearestStopId: near.stop.stop_id,
          nearestStopName: near.stop.stop_name,
          nearestDistM: Math.round(near.d),
          triggerStopId: triggerStop.stop_id,
          triggerStopName: triggerStop.stop_name,
          lastNearestStopId: lastNearestStopIdRef.current,
        });
        // fire only on transition into trigger stop (not baseline)
        if (
          lastNearestStopIdRef.current !== triggerStop.stop_id &&
          near.stop.stop_id === triggerStop.stop_id
        ) {
          const msg = `🚨 Bus ${selectedBusId} is ONE STOP away (nearest: ${triggerStop.stop_name}).`;
          setAlertOnScreen(true);
          setAlertMsg(msg);

          playAlarm(); // 🔊 ADD THIS

          log("TRIGGERED!", { msg });

          // optional: disarm after trigger
          setArmed(false);
          return;
        }

        lastNearestStopIdRef.current = near.stop.stop_id;
      } catch (e: any) {
        log("poll error", e);
        setError(String(e?.message || e));
      }
    };

    // initial tick + interval
    tick();
    const id = setInterval(tick, 3000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [armed, selectedBusId, triggerStop, destinations]);

  const canArm = Boolean(
    selectedRouteKey &&
    selectedBusId &&
    selectedDestinationStopId &&
    triggerStop,
  );

  /** -------- UI -------- */
  return (
    <div style={S.page}>
      <div style={S.shell}>
        <header style={S.header}>
          <div>
            <div style={S.title}>Regina Bus Alert</div>
            <div style={S.subTitle}>
              Route → Bus → Destination → On-screen alert (1 stop before)
            </div>
          </div>
          <button
            onClick={loadAnchor}
            style={S.btnPrimary}
            disabled={loadingAnchor}
          >
            {loadingAnchor ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        {error && <div style={S.error}>Error: {error}</div>}

        {alertOnScreen && (
          <div style={S.alertBanner}>
            <div style={{ fontWeight: 900 }}>Alert</div>
            <div style={{ marginTop: 4 }}>{alertMsg}</div>
          </div>
        )}

        <div style={S.form}>
          <Field label="Route">
            <select
              value={selectedRouteKey}
              onChange={(e) => setSelectedRouteKey(e.target.value)}
              style={S.select}
              disabled={loadingAnchor || routeOptions.length === 0}
            >
              <option value="">Select a route…</option>
              {routeOptions.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Bus">
            <select
              value={selectedBusId}
              onChange={(e) => setSelectedBusId(e.target.value)}
              style={S.select}
              disabled={!selectedRouteKey || busOptions.length === 0}
            >
              <option value="">
                {selectedRouteKey ? "Select a bus…" : "Select route first…"}
              </option>
              {busOptions.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Destination">
            <select
              value={selectedDestinationStopId}
              onChange={(e) => setSelectedDestinationStopId(e.target.value)}
              style={S.select}
              disabled={
                !selectedRouteKey ||
                !selectedBusId ||
                loadingStops ||
                destinations.length === 0
              }
            >
              <option value="">
                {!selectedBusId
                  ? "Select a bus first…"
                  : loadingStops
                    ? "Loading destinations…"
                    : "Select a destination…"}
              </option>
              {destinations.map((d) => (
                <option key={d.stop_id} value={d.stop_id}>
                  {d.stop_name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div style={S.result}>
          <div style={S.resultHeader}>Status</div>

          <Row
            k="Destination ETA"
            v={loadingEta ? "Loading…" : destinationEtaText}
          />
          <Row k="Trigger stop (i-1)" v={triggerStopText} />
          <Row k="Nearest stop to bus" v={nearestStopText} />

          <div style={S.debugBox}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Debug</div>
            <div style={S.muted}>
              Polling: {armed ? "ON (every 3s)" : "OFF"}
            </div>
            <div style={S.muted}>Last poll: {lastPollAt}</div>
            <div style={S.muted}>
              lastNearestStopId: {lastNearestStopIdRef.current ?? "—"}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            <button
              style={S.btnPrimary}
              disabled={!canArm || armed}
              onClick={() => {
                resetBaseline("armed button clicked");
                setError(null);
                setArmed(true);
                log("ARMED", {
                  route: selectedRouteKey,
                  bus: selectedBusId,
                  destination: selectedDestinationStopId,
                  trigger: triggerStop?.stop_id,
                });
              }}
            >
              {armed ? "Armed…" : "Arm alert (1 stop before)"}
            </button>

            <button
              style={S.btnSecondary}
              disabled={!armed && !alertOnScreen}
              onClick={() => {
                setArmed(false);
                resetBaseline("disarm clicked");
                log("DISARMED");
              }}
            >
              Disarm / Clear
            </button>
          </div>
        </div>

        <div style={S.footer}>
          Anchor stop (internal): <b>{ANCHOR_STOP_ID}</b>
        </div>
      </div>
    </div>
  );
}

/** ---------- Small UI components ---------- */
function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ fontWeight: 900, fontSize: 13 }}>{props.label}</label>
      {props.children}
    </div>
  );
}

function Row(props: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 0",
      }}
    >
      <span style={{ color: "#64748b", fontWeight: 800 }}>{props.k}</span>
      <span style={{ fontWeight: 900, textAlign: "right" }}>{props.v}</span>
    </div>
  );
}

/** ---------- Styles ---------- */
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f4f6fb",
    padding: 24,
    color: "#0f172a",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },
  shell: {
    width: "min(820px, 96vw)",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  title: { fontSize: 22, fontWeight: 900, letterSpacing: -0.2 },
  subTitle: { marginTop: 6, fontSize: 13, color: "#475569" },

  form: {
    border: "1px solid #e5e7eb",
    background: "#fbfcfe",
    borderRadius: 14,
    padding: 14,
    display: "grid",
    gap: 14,
  },
  select: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    fontSize: 14,
    outline: "none",
  },

  result: {
    marginTop: 14,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 14,
    background: "#fff",
  },
  resultHeader: { fontWeight: 900, marginBottom: 10 },

  btnPrimary: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #0f172a",
    background: "#0f172a",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  btnSecondary: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 900,
    cursor: "pointer",
  },

  alertBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    border: "1px solid #86efac",
    background: "#dcfce7",
    color: "#14532d",
  },

  debugBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fafafa",
  },
  muted: { fontSize: 12, color: "#64748b", lineHeight: 1.5 },

  error: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 12,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#991b1b",
    fontWeight: 800,
  },
  footer: { marginTop: 12, fontSize: 12, color: "#64748b" },
};
