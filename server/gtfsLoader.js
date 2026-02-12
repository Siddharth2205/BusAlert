const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { parse: parseStream } = require("csv-parse");

const GTFS_DIR = path.join(__dirname, "gtfs");

function mustExist(filename) {
  const p = path.join(GTFS_DIR, filename);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${filename} in ${GTFS_DIR}`);
  }
  return p;
}

function readSmallCsv(filename) {
  const p = mustExist(filename);
  const text = fs.readFileSync(p, "utf8");
  return parse(text, { columns: true, skip_empty_lines: true });
}

async function loadGtfs() {
  const routes = readSmallCsv("routes.txt");
  const trips = readSmallCsv("trips.txt");
  const stops = readSmallCsv("stops.txt");

  // Map: route_short_name ("4") -> route_id ("123")
  const routeIdByShortName = new Map();
  for (const r of routes) {
    if (r.route_short_name && r.route_id) {
      routeIdByShortName.set(String(r.route_short_name).trim(), String(r.route_id).trim());
    }
  }

  // Map: stop_id -> stop_name
  const stopNameById = new Map();
  for (const s of stops) {
    stopNameById.set(String(s.stop_id).trim(), String(s.stop_name || s.stop_id).trim());
  }

  // Map: `${route_id}|${trip_headsign}` -> [trip_id...]
  const tripIdsByRouteAndHeadsign = new Map();
  for (const t of trips) {
    const route_id = String(t.route_id || "").trim();
    const trip_id = String(t.trip_id || "").trim();
    const headsign = String(t.trip_headsign || "").trim();

    if (!route_id || !trip_id || !headsign) continue;

    const key = `${route_id}|${headsign}`;
    if (!tripIdsByRouteAndHeadsign.has(key)) tripIdsByRouteAndHeadsign.set(key, []);
    tripIdsByRouteAndHeadsign.get(key).push(trip_id);
  }

  // stop_times is huge -> stream and build: trip_id -> [{seq, stop_id}...]
  const stopTimesPath = mustExist("stop_times.txt");
  const tripStops = new Map();

  await new Promise((resolve, reject) => {
    fs.createReadStream(stopTimesPath)
      .pipe(parseStream({ columns: true, skip_empty_lines: true }))
      .on("data", (row) => {
        const trip_id = String(row.trip_id || "").trim();
        const stop_id = String(row.stop_id || "").trim();
        const seq = Number(row.stop_sequence);

        if (!trip_id || !stop_id || Number.isNaN(seq)) return;

        if (!tripStops.has(trip_id)) tripStops.set(trip_id, []);
        tripStops.get(trip_id).push({ seq, stop_id });
      })
      .on("end", resolve)
      .on("error", reject);
  });

  // sort each trip once
  for (const [trip_id, arr] of tripStops.entries()) {
    arr.sort((a, b) => a.seq - b.seq);
    tripStops.set(trip_id, arr);
  }

  return {
    routeIdByShortName,
    stopNameById,
    tripIdsByRouteAndHeadsign,
    tripStops,
  };
}

module.exports = { loadGtfs };
