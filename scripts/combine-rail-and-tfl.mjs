import * as fs from "node:fs";
import * as path from "node:path";
import {readFeed} from "@gb-transit/gtfs-loader";
import {deliverFeed, field, workingDirectory} from "@gb-transit/gtfs-output";
import {readHeaders} from "gtfsmerge";

/**
 * The National Rail only feed and TfL's tube, DLR, tram, river and cable car, as one feed.
 *
 * Usage: combine-rail-and-tfl.mjs RAIL TFL OUT [INTERCHANGE]
 *
 * RAIL is cif2gtfs built without the tube's fixed links (`exclude.links: [TUBE]`), since the tube's
 * own timetable is here instead. TFL is transxchange2gtfs --supersede-by-line over the
 * `LULDLRTRAMRIVERCABLE` part of TfL's Journey Planner Timetables, which puts each platform under the
 * station NaPTAN numbers it after. OUT is a zip or a directory.
 *
 * **A TfL station inside a rail station is one of its platforms.** Its platforms become children of
 * the rail station, so the rail station's connection time is the interchange for every change there:
 * train to tube, tube to train, and tube to tube. The rail feed charges a station's connection time
 * on every arrival, whatever comes next, so a station of its own with a walk to it would charge both
 * stations' times on every change between them.
 *
 * Which rail station a TfL station is inside: the nearest with trains, or a placeholder the CIF
 * keeps for a tube station (BAKER STREET UND), that is within FOLD_METRES, or within
 * NAMED_FOLD_METRES and has the same name. The name is what separates Victoria, 186m from the tube
 * station's platforms, from Tower Hill, 171m from Tower Gateway. A rail station takes at most one
 * TfL station of each mode, the nearest, so Aldgate does not become part of Aldgate East. Piers are
 * never folded: a pier is a walk from the station above it.
 *
 * **Every other TfL station has a three character code**, because that is what the transfer
 * pattern planner names a station by. They are numbered from `100`, which no CRS code can be, in the
 * order of the stations' ids, so a station added to the network renumbers the ones after it: fine for
 * a feed and its patterns built together, not for a code anybody keeps.
 *
 * Interchange at a station of its own is INTERCHANGE, or DEFAULT_INTERCHANGE; walks between TfL
 * stations and between a TfL station and a rail station are timed by distance.
 */
const FOLD_METRES = 100;
const NAMED_FOLD_METRES = 250;
const RAIL_WALK_METRES = 400;
const TFL_WALK_METRES = 250;
const DEFAULT_INTERCHANGE = 120;
const WALK_SECONDS_PER_METRE = 1.2;
/** Street to platform, for a walk between two TfL stations. */
const WALK_BASE = 180;
const TUBE_NAME = /\b(UND|UNDERGROUND|LT|LRT|DLR)\b/i;
const NOISE = new Set(["london", "underground", "station", "dlr", "tram", "stop", "und", "lt", "lrt", "elizabeth", "line", "rail"]);

const HELD = ["agency.txt", "routes.txt", "trips.txt", "calendar.txt", "calendar_dates.txt", "stops.txt", "transfers.txt"];
/** What the rail feed has and TfL's has nothing to add to. */
const COPIED = ["feed_info.txt", "areas.txt", "stop_areas.txt"];

/**
 * TfL's lines, by the code TfL's timetables file them under - `BAK` in `1-BAK-_-y05-635201`. Each is
 * published as a file per timetable, a base one and one per engineering works, so a line is a route
 * per file until they are put back together here, under an id that does not change when TfL issues
 * the next file.
 *
 * The colours are the RGB references of TfL's Colour Standard, Issue 11: the Underground's line
 * colours, and the mode colours of the DLR, London Trams, London Cable Car and London River Services.
 */
const TFL_LINES = {
  BAK: {colour: "B26300", url: "https://tfl.gov.uk/tube/route/bakerloo/"},
  CEN: {colour: "DC241F", url: "https://tfl.gov.uk/tube/route/central/"},
  CIR: {colour: "FFC80A", url: "https://tfl.gov.uk/tube/route/circle/"},
  DIS: {colour: "007D32", url: "https://tfl.gov.uk/tube/route/district/"},
  HAM: {colour: "F589A6", url: "https://tfl.gov.uk/tube/route/hammersmith-city/"},
  JUB: {colour: "838D93", url: "https://tfl.gov.uk/tube/route/jubilee/"},
  MET: {colour: "9B0058", url: "https://tfl.gov.uk/tube/route/metropolitan/"},
  NTN: {colour: "000000", url: "https://tfl.gov.uk/tube/route/northern/"},
  PIC: {colour: "0019A8", url: "https://tfl.gov.uk/tube/route/piccadilly/"},
  VIC: {colour: "039BE5", url: "https://tfl.gov.uk/tube/route/victoria/"},
  WAC: {colour: "76D0BD", url: "https://tfl.gov.uk/tube/route/waterloo-city/"},
  DLR: {colour: "00AFAD", url: "https://tfl.gov.uk/dlr/route/dlr/"},
  TR: {colour: "5FB526", url: "https://tfl.gov.uk/tram/route/tram/"},
  // An aerial lift, which TfL's timetables call rail
  CAB: {colour: "DC241F", url: "https://tfl.gov.uk/cable-car/route/london-cable-car/", type: 6},
  RB1: {colour: "039BE5", url: "https://tfl.gov.uk/river-bus/route/rb1/"},
  RB4: {colour: "039BE5", url: "https://tfl.gov.uk/river-bus/route/rb4/"},
  B6C: {colour: "039BE5", url: "https://tfl.gov.uk/river-bus/route/rb6/"},
  WFF: {colour: "039BE5", url: "https://tfl.gov.uk/river-bus/route/woolwich-ferry/"}
};

/**
 * TfL's operators, by National Operator Code. TransXChange names an operator and gives nothing
 * else - no website, no phone - and Thames Clippers still under a sponsor it has not had since 2020.
 */
const TFL_AGENCIES = {
  LUL: {agency_name: "London Underground", agency_url: "https://tfl.gov.uk/modes/tube/", agency_phone: "0343 222 1234"},
  DLR: {agency_name: "Docklands Light Railway", agency_url: "https://tfl.gov.uk/modes/dlr/", agency_phone: "0343 222 1234"},
  TCL: {agency_name: "London Trams", agency_url: "https://tfl.gov.uk/modes/trams/", agency_phone: "0343 222 1234"},
  CAB: {agency_name: "London Cable Car", agency_url: "https://tfl.gov.uk/cable-car/route/london-cable-car/", agency_phone: "0343 222 1234"},
  WFF: {agency_name: "Woolwich Ferry", agency_url: "https://tfl.gov.uk/river-bus/route/woolwich-ferry/", agency_phone: "0343 222 1234"},
  CV: {agency_name: "Uber Boat by Thames Clippers", agency_url: "https://www.thamesclippers.com/"}
};

/** The lines a complete download always has: the Underground's, the DLR and the trams. */
const REQUIRED = /^(BAK|CEN|CIR|DIS|HAM|JUB|MET|NTN|PIC|VIC|WAC|DLR|TR)$/;

/** The line code of a TfL route: `1-BAK-_-y05-635201|1-BAK-_-y05-635201` is `BAK`. */
const lineOf = routeId => routeId.split("-")[1];

/** Black or white, whichever reads better on a line's colour - black on the Circle's yellow. */
function textOn(colour) {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(colour.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? "000000" : "FFFFFF";
}

/**
 * TfL's open data licence makes this statement a condition of using the timetables, and
 * attributions.txt is where a feed says who it is built from. One row per agency TfL's timetables
 * describe, because a row naming no agency, route or trip is about the whole feed - and TfL is not
 * the producer of the National Rail half, nor the authority for it. TfL produces these timetables
 * and is the authority the operators run under; it is not the operator of all of them.
 */
const tflAttribution = agencyId => ({
  agency_id: agencyId,
  organization_name: "Transport for London",
  is_producer: 1,
  is_operator: 0,
  is_authority: 1,
  attribution_url: "https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service",
  attribution_licence: "Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016 " +
    "and Geomni UK Map data © and database rights [2019]"
});

const [railPath, tflPath, outPath, interchangePath = path.join(import.meta.dirname, "tfl-interchange.csv")] = process.argv.slice(2);

if (outPath === undefined) {
  console.error("Usage: combine-rail-and-tfl.mjs RAIL TFL OUT [INTERCHANGE]");
  process.exit(1);
}

const source = file => fs.createReadStream(file);
// every column of both feeds is carried through, the ones the loader does not know included
const [railHeaders, tflHeaders] = await Promise.all([readHeaders(railPath), readHeaders(tflPath)]);

async function read(file, headers, files) {
  const result = Object.fromEntries(files.map(f => [f, []]));

  await readFeed(source(file), Object.fromEntries(files.map(f => [f, row => result[f].push({...row})])),
    {extraColumns: headers});

  return result;
}

const [rail, tfl] = await Promise.all([
  read(railPath, railHeaders, [...HELD, ...COPIED, "attributions.txt"]),
  read(tflPath, tflHeaders, HELD)
]);

const work = workingDirectory(outPath);

fs.rmSync(work, {recursive: true, force: true});
fs.mkdirSync(work, {recursive: true});

const columnsOf = file => [...new Set([...railHeaders[file] ?? [], ...tflHeaders[file] ?? []])];

function open(file, columns) {
  const fd = fs.openSync(path.join(work, file), "w");
  let buffer = columns.join(",") + "\n";

  return {
    write(row) {
      buffer += columns.map(c => field(row[c])).join(",") + "\n";

      if (buffer.length > 1 << 20) {
        fs.writeSync(fd, buffer);
        buffer = "";
      }
    },
    end() {
      fs.writeSync(fd, buffer);
      fs.closeSync(fd);
    }
  };
}

// The calls and the shapes of both feeds, written as they are read. Which rail stations have trains is
// worked out from the same pass, since the calls are the only place that says.
const railParent = new Map(rail["stops.txt"].map(s => [s.stop_id, s.parent_station || s.stop_id]));
const served = new Set();
const stopTimes = open("stop_times.txt", columnsOf("stop_times.txt"));
const shapes = columnsOf("shapes.txt").length === 0 ? undefined : open("shapes.txt", columnsOf("shapes.txt"));
// A TfL journey none of whose stops can be placed is named a shape that has no points, and a trip
// pointing at a shape that is not there fails validation, so only the ones written are kept.
const drawn = new Set();

await readFeed(source(railPath), {
  "stop_times.txt": row => {
    served.add(railParent.get(row.stop_id) ?? row.stop_id);
    stopTimes.write(row);
  },
  "shapes.txt": row => shapes?.write(row)
}, {extraColumns: railHeaders});
await readFeed(source(tflPath), {
  "stop_times.txt": row => stopTimes.write({...row, trip_id: "tfl_" + row.trip_id}),
  "shapes.txt": row => {
    drawn.add(row.shape_id);
    shapes?.write({...row, shape_id: "tfl_" + row.shape_id});
  }
}, {extraColumns: tflHeaders});
stopTimes.end();
shapes?.end();

const metres = (a, b) => {
  const lat = (Number(a.stop_lat) + Number(b.stop_lat)) / 2 * Math.PI / 180;
  return Math.hypot((Number(a.stop_lon) - Number(b.stop_lon)) * 111320 * Math.cos(lat), (Number(a.stop_lat) - Number(b.stop_lat)) * 110540);
};

const words = name => new Set(name.toLowerCase().replace(/&/g, " and ").replace(/'/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\brd\b/g, "road").split(/\s+/).filter(w => w !== "" && !NOISE.has(w)));
const subset = (a, b) => [...a].every(w => b.has(w));
const sameName = (a, b) => {
  const [x, y] = [words(a), words(b)];
  return x.size > 0 && y.size > 0 && (subset(x, y) || subset(y, x));
};

const railStations = rail["stops.txt"].filter(s => s.stop_id.startsWith("910G") && s.stop_lat);
const tflStations = tfl["stops.txt"].filter(s => Number(s.location_type) === 1);

// which TfL stations are inside a rail station
const candidates = railStations.filter(r => served.has(r.stop_id) || TUBE_NAME.test(r.stop_name));
const claims = new Map();

for (const station of tflStations.filter(s => s.stop_id.startsWith("940G"))) {
  const inside = candidates
    .map(r => ({rail: r, distance: metres(station, r)}))
    .sort((a, b) => Number(served.has(b.rail.stop_id)) - Number(served.has(a.rail.stop_id)) || a.distance - b.distance)
    .find(({rail, distance}) => distance <= FOLD_METRES
      || (distance <= NAMED_FOLD_METRES && sameName(station.stop_name, rail.stop_name)));

  if (inside !== undefined) {
    const key = `${inside.rail.stop_id}|${station.stop_id.slice(0, 8)}`;
    const held = claims.get(key);

    if (held === undefined || inside.distance < held.distance) {
      claims.set(key, {...inside, station});
    }
  }
}

const folded = new Map([...claims.values()].map(({station, rail}) => [station.stop_id, rail]));
const ownStations = tflStations.filter(s => !folded.has(s.stop_id));

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

for (const [n, station] of [...ownStations].sort((a, b) => a.stop_id < b.stop_id ? -1 : 1).entries()) {
  station.stop_code = "123456789"[Math.floor(n / 1296)] + ALPHABET[Math.floor(n / 36) % 36] + ALPHABET[n % 36];
}

// interchange and walks
const interchange = new Map(fs.readFileSync(interchangePath, "utf8").trim().split("\n").slice(1)
  .map(line => line.split(",")).map(([id, , minutes]) => [id, Number(minutes) * 60]));

for (const id of interchange.keys()) {
  if (!ownStations.some(s => s.stop_id === id)) {
    console.warn(`${path.basename(interchangePath)}: ${id} is not a TfL station of its own in this feed, so its time does nothing`);
  }
}

const transfers = ownStations.map(s => ({
  from_stop_id: s.stop_id, to_stop_id: s.stop_id, transfer_type: 2,
  min_transfer_time: interchange.get(s.stop_id) ?? DEFAULT_INTERCHANGE
}));

const walk = (a, b, seconds) => transfers.push(
  {from_stop_id: a, to_stop_id: b, transfer_type: 2, min_transfer_time: seconds, mode: "WALK"},
  {from_stop_id: b, to_stop_id: a, transfer_type: 2, min_transfer_time: seconds, mode: "WALK"}
);
const minutes = seconds => Math.max(60, Math.round(seconds / 60) * 60);

for (const [i, a] of ownStations.entries()) {
  for (const b of ownStations.slice(i + 1)) {
    const distance = metres(a, b);

    if (distance <= TFL_WALK_METRES) {
      walk(a.stop_id, b.stop_id, minutes(WALK_BASE + distance * WALK_SECONDS_PER_METRE));
    }
  }
}

// each end's own interchange covers getting to its platforms, so a walk between a rail station and a
// TfL station is the street between them
for (const r of railStations) {
  for (const s of ownStations) {
    const distance = metres(r, s);

    if (distance <= RAIL_WALK_METRES) {
      walk(r.stop_id, s.stop_id, minutes(distance * WALK_SECONDS_PER_METRE));
    }
  }
}

// out
const prefix = (rows, ...columns) => rows.map(row => {
  const out = {...row};

  for (const column of columns) {
    if (out[column] !== undefined && out[column] !== "") {
      out[column] = "tfl_" + out[column];
    }
  }

  return out;
});

const tflStops = tfl["stops.txt"]
  .filter(s => !folded.has(s.stop_id))
  .map(s => folded.has(s.parent_station) ? {...s, parent_station: folded.get(s.parent_station).stop_id} : s);

// A route per line rather than per file, named for the base timetable: the file whose trips run on
// the most days. Not the one with the most trips, which a week of engineering works can have.
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const ymd = date => date.toISOString().slice(0, 10).replace(/-/g, "");
const daysOf = new Map();

for (const calendar of tfl["calendar.txt"]) {
  const days = new Set();
  const end = String(calendar.end_date);

  for (let date = new Date(`${String(calendar.start_date).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}T00:00:00Z`);
    ymd(date) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (Number(calendar[DAYS[(date.getUTCDay() + 6) % 7]]) === 1) {
      days.add(ymd(date));
    }
  }

  daysOf.set(calendar.service_id, days);
}

for (const change of tfl["calendar_dates.txt"]) {
  const days = daysOf.get(change.service_id) ?? daysOf.set(change.service_id, new Set()).get(change.service_id);

  if (Number(change.exception_type) === 1) {
    days.add(String(change.date));
  }
  else {
    days.delete(String(change.date));
  }
}

const runsOn = new Map();

for (const trip of tfl["trips.txt"]) {
  runsOn.set(trip.route_id, (runsOn.get(trip.route_id) ?? 0) + (daysOf.get(trip.service_id)?.size ?? 0));
}

const lines = new Map();

for (const route of [...tfl["routes.txt"]].sort((a, b) => (runsOn.get(b.route_id) ?? 0) - (runsOn.get(a.route_id) ?? 0))) {
  const line = lineOf(route.route_id);

  if (!lines.has(line)) {
    const known = TFL_LINES[line];

    if (known === undefined) {
      console.warn(`TfL line ${line} (${route.route_short_name}) has no colour or page here`);
    }

    lines.set(line, {
      ...route,
      route_id: "tfl_" + line,
      route_type: known?.type ?? route.route_type,
      route_color: known?.colour ?? route.route_color,
      route_text_color: known === undefined ? route.route_text_color : textOn(known.colour),
      route_url: known?.url ?? route.route_url,
      // transxchange2gtfs writes the service's description as both, and it is the long name
      route_desc: undefined
    });
  }
}

const tflAgencies = tfl["agency.txt"].map(agency => ({...agency, ...TFL_AGENCIES[agency.agency_id]}));
const tflTrips = prefix(tfl["trips.txt"], "trip_id", "service_id")
  .map(trip => ({
    ...trip,
    route_id: "tfl_" + lineOf(trip.route_id),
    shape_id: drawn.has(trip.shape_id) ? "tfl_" + trip.shape_id : undefined
  }));

// A download that came back short is a feed missing a line, which nothing downstream can tell from a
// quiet night on it. Every tube line, the DLR and the trams run every day.
const running = new Set(tflTrips.map(trip => trip.route_id));
const missing = Object.keys(TFL_LINES).filter(line => REQUIRED.test(line) && !running.has("tfl_" + line));

if (missing.length > 0) {
  console.error(`TfL's timetables have no trips on ${missing.join(", ")}, so the download is incomplete.`);
  process.exit(1);
}

const combined = {
  "agency.txt": [rail["agency.txt"], tflAgencies],
  "routes.txt": [rail["routes.txt"], [...lines.values()]],
  "trips.txt": [rail["trips.txt"], tflTrips],
  "calendar.txt": [rail["calendar.txt"], prefix(tfl["calendar.txt"], "service_id")],
  "calendar_dates.txt": [rail["calendar_dates.txt"], prefix(tfl["calendar_dates.txt"], "service_id")],
  "stops.txt": [rail["stops.txt"], tflStops],
  "transfers.txt": [rail["transfers.txt"], transfers],
  "attributions.txt": [rail["attributions.txt"], tfl["agency.txt"].map(agency => tflAttribution(agency.agency_id))],
  ...Object.fromEntries(COPIED.filter(file => railHeaders[file] !== undefined).map(file => [file, [rail[file]]]))
};

/** Columns the script writes whether or not either feed had them. */
const WRITTEN = {"transfers.txt": ["mode"], "attributions.txt": Object.keys(tflAttribution(""))};

for (const [file, parts] of Object.entries(combined)) {
  const columns = [...new Set([...columnsOf(file), ...WRITTEN[file] ?? []])];
  const out = open(file, columns);

  for (const part of parts) {
    for (const row of part) {
      out.write(row);
    }
  }

  out.end();
}

await deliverFeed(work, outPath);

console.log(
  `${folded.size} TfL stations are platforms of a rail station, ${ownStations.length} are stations of their own. ` +
  `${transfers.filter(t => t.mode === "WALK").length / 2} walks.`
);
