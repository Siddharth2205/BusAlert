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

  // match headsign
  const exact = routeTrips.find((t) => normUpper(t.trip_headsign) === headsignQ);
  const fuzzy = routeTrips.find((t) => normUpper(t.trip_headsign).includes(headsignQ));
  const trip = exact || fuzzy;
  if (!trip) return ok(res, []);

  const rows = GTFS.stopTimesByTripId.get(norm(trip.trip_id)) || [];
  if (!rows.length) return ok(res, []);

  const out = rows.map((st, index) => {
    const sid = norm(st.stop_id);
    const stopRow = GTFS.stops.find((s) => norm(s.stop_id) === sid);

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
