"use strict";

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Optional logging
try {
  const morgan = require("morgan");
  app.use(morgan("dev"));
} catch {}

/** -------------------- Config -------------------- **/
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const GTFS_DIR = path.join(__dirname, "gtfs");

/** -------------------- Helpers -------------------- **/
function ok(res, data) {
  return res.status(200).json({ ok: true, data });
}

function bad(res, message, details) {
  return res.status(400).json({ ok: false, error: message, details: details ?? null });
}

function fail(res, message, details) {
  return res.status(500).json({ ok: false, error: message, details: details ?? null });
}

function readGtfsFile(filename) {
  const p = path.join(GTFS_DIR, filename);
  if (!fs.existsSync(p)) throw new Error(`Missing GTFS file: ${filename} in ${GTFS_DIR}`);
  const csv = fs.readFileSync(p, "utf8");
  return parse(csv, { columns: true, skip_empty_lines: true });
}

function norm(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function normUpper(s) {
  return norm(s).toUpperCase();
}

/** -------------------- GTFS Cache -------------------- **/
const GTFS = {
  routes: [],
  trips: [],
  stopTimes: [],
  stops: [],
  routeByShort: new Map(),        // route_short_name -> route row
  stopNameById: new Map(),        // stop_id -> stop_name
  tripsByRouteId: new Map(),      // route_id -> trips[]
  stopTimesByTripId: new Map(),   // trip_id -> stop_times[]
};

function buildIndexes() {
  GTFS.routeByShort.clear();
  GTFS.stopNameById.clear();
  GTFS.tripsByRouteId.clear();
  GTFS.stopTimesByTripId.clear();

  for (const r of GTFS.routes) {
    GTFS.routeByShort.set(norm(r.route_short_name), r);
  }

  for (const s of GTFS.stops) {
    GTFS.stopNameById.set(norm(s.stop_id), norm(s.stop_name));
  }

  for (const t of GTFS.trips) {
    const rid = norm(t.route_id);
    if (!GTFS.tripsByRouteId.has(rid)) GTFS.tripsByRouteId.set(rid, []);
    GTFS.tripsByRouteId.get(rid).push(t);
  }

  for (const st of GTFS.stopTimes) {
    const tid = norm(st.trip_id);
    if (!GTFS.stopTimesByTripId.has(tid)) GTFS.stopTimesByTripId.set(tid, []);
    GTFS.stopTimesByTripId.get(tid).push(st);
  }

  // Sort each trip's stop_times by stop_sequence once
  for (const [tid, rows] of GTFS.stopTimesByTripId.entries()) {
    rows.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  }
}

function loadGtfs() {
  GTFS.routes = readGtfsFile("routes.txt");
  GTFS.trips = readGtfsFile("trips.txt");
  GTFS.stopTimes = readGtfsFile("stop_times.txt");
  GTFS.stops = readGtfsFile("stops.txt");
  buildIndexes();

  console.log("[GTFS] loaded", {
    routes: GTFS.routes.length,
    trips: GTFS.trips.length,
    stop_times: GTFS.stopTimes.length,
    stops: GTFS.stops.length,
  });
}

// Load GTFS at startup
try {
  loadGtfs();
} catch (e) {
  console.error("[GTFS] FAILED TO LOAD:", e);
  // Server still starts, but GTFS endpoints will return errors
}

/** -------------------- Routes -------------------- **/

app.get("/", (req, res) => {
  ok(res, { message: "BusAlert server running ✅", gtfsLoaded: GTFS.routes.length > 0 });
});

/**
 * TransitLive proxy
 * GET /api/stop_times?stop=0261&lim=40
 * Always returns JSON (never HTML).
 */
app.get("/api/stop_times", async (req, res) => {
  const stop = norm(req.query.stop);
  const lim = norm(req.query.lim || "5");

  if (!stop) return bad(res, "Missing stop (e.g. ?stop=0261)");

  const url =
    `https://transitlive.com/ajax/livemap.php?action=stop_times&stop=${encodeURIComponent(stop)}` +
    `&routes=all&lim=${encodeURIComponent(lim)}&skip=0&ws=0`;

  try {
    const r = await fetch(url, { headers: { "User-Agent": "busalert/1.0" } });
    const text = await r.text();

    // TransitLive usually returns JSON text. If it doesn't, we still respond with JSON.
    try {
      const data = JSON.parse(text);
      return ok(res, data);
    } catch {
      return fail(res, "TransitLive returned non-JSON response", {
        status: r.status,
        preview: text.slice(0, 200),
      });
    }
  } catch (e) {
    return fail(res, "TransitLive fetch failed", String(e));
  }
});

/**
 * GTFS directions
 * GET /api/gtfs/directions?route_short=4
 */
app.get("/api/gtfs/directions", (req, res) => {
  const routeShort = norm(req.query.route_short);
  if (!routeShort) return bad(res, "Missing route_short (e.g. ?route_short=4)");

  const route = GTFS.routeByShort.get(routeShort);
  if (!route) return ok(res, []);

  const routeId = norm(route.route_id);
  const routeTrips = GTFS.tripsByRouteId.get(routeId) || [];

  const heads = new Set();
  for (const t of routeTrips) {
    const hs = normUpper(t.trip_headsign);
    if (hs) heads.add(hs);
  }

  return ok(res, Array.from(heads).sort());
});

app.get("/api/gtfs/stops", (req, res) => {
  const routeShort = norm(req.query.route_short);
  const headsignQ = normUpper(req.query.headsign);

  if (!routeShort) return bad(res, "Missing route_short");
  if (!headsignQ) return bad(res, "Missing headsign");
  if (!GTFS.routes.length) return fail(res, "GTFS not loaded");

  const route = GTFS.routeByShort.get(routeShort);
  if (!route) return ok(res, []);

  const routeId = norm(route.route_id);
  const routeTrips = GTFS.tripsByRouteId.get(routeId) || [];
  if (!routeTrips.length) return ok(res, []);

  const exact = routeTrips.find(
    (t) => normUpper(t.trip_headsign) === headsignQ
  );
  const fuzzy = routeTrips.find(
    (t) => normUpper(t.trip_headsign).includes(headsignQ)
  );
  const trip = exact || fuzzy;
  if (!trip) return ok(res, []);

  const rows = GTFS.stopTimesByTripId.get(norm(trip.trip_id)) || [];
  if (!rows.length) return ok(res, []);

  const out = rows.map((st, index) => {
    const sid = norm(st.stop_id);
    const stopRow = GTFS.stops.find(
      (s) => norm(s.stop_id) === sid
    );

    return {
      index,
      stop_id: sid,
      stop_name: GTFS.stopNameById.get(sid) || sid,
      stop_lat: stopRow ? Number(stopRow.stop_lat) : null,
      stop_lon: stopRow ? Number(stopRow.stop_lon) : null,
    };
  });

  return ok(res, out);
});


/**
 * GTFS ordered stops for a route + headsign
 * GET /api/gtfs/stops?route_short=4&headsign=WALSH%20ACRES
 *
 * Robust matching:
 * - tries exact uppercase match
 * - then tries "includes" match (if GTFS has extra words)
 */
app.get("/api/buses/updated", async (req, res) => {
  const url = `https://transitlive.com/json/updatedBuses.js?_=${Date.now()}`;

  try {
    const r = await fetch(url, { headers: { "User-Agent": "busalert/1.0" } });
    const text = await r.text();

    // updatedBuses.js is often JS, not pure JSON. Extract the array safely.
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) {
      return res.status(500).json({ error: "Could not parse updatedBuses.js" });
    }

    const jsonStr = text.slice(start, end + 1);
    const data = JSON.parse(jsonStr);

    return res.json({ count: data.length, buses: data });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch updated buses", details: String(e) });
  }
});




/** -------------------- 404 + Error Handler -------------------- **/

// JSON 404 (no HTML)
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
    path: req.originalUrl,
    hint: "Try /api/stop_times or /api/gtfs/directions or /api/gtfs/stops",
  });
});

// JSON error handler (no HTML)
app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err);
  res.status(500).json({
    ok: false,
    error: "Internal server error",
    details: String(err?.message || err),
  });
});




/** -------------------- Start -------------------- **/
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
