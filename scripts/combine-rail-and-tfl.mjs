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
 * A script rather than a tool, for now. The rail feed charges a station's minimum connection time on
 * every arrival, whatever comes next, and that is what the rules below are working around: the way
 * to stop working around it is footpaths between platforms, with the TOC specific interchange times
 * from the TSI file, and this goes when that arrives.
 *
 * **A TfL station inside a rail station is one of its platforms.** Its platforms become children of
 * the rail station, so the rail station's connection time is the interchange for every change there:
 * train to tube, tube to train, and tube to tube. The alternative - a station of its own, a walk to
 * it, and an interchange time of its own - charges both stations' times on every change between
 * them, because each is charged on arrival. Measured over 19 journeys across London planned every
 * half hour, folding arrives earlier than the fixed links on 320 queries and later on 53.
 *
 * Which rail station a TfL station is inside: the nearest with trains, or a placeholder the CIF
 * keeps for a tube station (BAKER STREET UND), that is within FOLD_METRES, or within
 * NAMED_FOLD_METRES and has the same name. The name is what separates Victoria, 186m from the tube
 * station's platforms, from Tower Hill, 171m from Tower Gateway. A rail station takes at most one
 * TfL station of each mode, the nearest, so Aldgate does not become part of Aldgate East. Piers are
 * never folded: a pier is a walk from the station above it.
 *
 * **Every other TfL station needs a three character code**, because that is what the transfer
 * pattern planner names a station by. One close to a placeholder for it takes the placeholder's
 * code, and the placeholder's fixed links with it. The rest are numbered from `100`, which no CRS
 * code can be. The numbering follows the stations' ids in order, so a station added to the network
 * renumbers the ones after it: fine for a feed and its patterns built together, not for a code
 * anybody keeps.
 *
 * Interchange at a station of its own is INTERCHANGE, or DEFAULT_INTERCHANGE; walks between TfL
 * stations and between a TfL station and a rail station are timed by distance.
 */
const FOLD_METRES = 100;
const NAMED_FOLD_METRES = 250;
const PLACEHOLDER_METRES = 200;
const RAIL_WALK_METRES = 400;
const TFL_WALK_METRES = 250;
const DEFAULT_INTERCHANGE = 120;
const WALK_SECONDS_PER_METRE = 1.2;
/** Street to platform, for a walk between two TfL stations. */
const WALK_BASE = 180;
const TUBE_NAME = /\b(UND|UNDERGROUND|LT|LRT|DLR)\b/i;
const NOISE = new Set(["london", "underground", "station", "dlr", "tram", "stop", "und", "lt", "lrt", "elizabeth", "line", "rail"]);

const FILES = ["agency.txt", "routes.txt", "trips.txt", "calendar.txt", "calendar_dates.txt", "stops.txt", "transfers.txt", "stop_times.txt"];
const COPIED = ["feed_info.txt", "shapes.txt", "attributions.txt", "areas.txt", "stop_areas.txt"];

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

const small = FILES.filter(f => f !== "stop_times.txt");
const [rail, tfl] = await Promise.all([read(railPath, railHeaders, small), read(tflPath, tflHeaders, small)]);

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

// the rail stations with something calling at them, from a pass over the calls
const railParent = new Map(rail["stops.txt"].map(s => [s.stop_id, s.parent_station || s.stop_id]));
const served = new Set();

await readFeed(source(railPath), {"stop_times.txt": row => served.add(railParent.get(row.stop_id) ?? row.stop_id)});

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

// codes for the stations of their own
// each placeholder to the station nearest it, the closest pairs first, and a station takes one code.
// Not one a TfL station was folded into: that placeholder is a station now, with platforms.
const parents = new Set([...folded.values()].map(r => r.stop_id));
const adopted = new Map();
const pairs = railStations
  .filter(r => !served.has(r.stop_id) && TUBE_NAME.test(r.stop_name) && !parents.has(r.stop_id))
  .flatMap(placeholder => ownStations
    .map(station => ({placeholder, station, distance: metres(placeholder, station)}))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 1))
  .filter(({distance}) => distance <= PLACEHOLDER_METRES)
  .sort((a, b) => a.distance - b.distance);

for (const {placeholder, station} of pairs) {
  if (station.stop_code === undefined) {
    station.stop_code = placeholder.stop_code;
    adopted.set(placeholder.stop_id, station);
  }
}

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
let numbered = 0;

for (const station of [...ownStations].sort((a, b) => a.stop_id < b.stop_id ? -1 : 1)) {
  if (station.stop_code === undefined) {
    station.stop_code = "123456789"[Math.floor(numbered / 1296)] + ALPHABET[Math.floor(numbered / 36) % 36] + ALPHABET[numbered % 36];
    numbered++;
  }
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
for (const r of railStations.filter(r => !adopted.has(r.stop_id))) {
  for (const s of ownStations) {
    const distance = metres(r, s);

    if (distance <= RAIL_WALK_METRES) {
      walk(r.stop_id, s.stop_id, minutes(distance * WALK_SECONDS_PER_METRE));
    }
  }
}

// the rail feed's transfers, a placeholder's links moved onto the station that replaced it - but not
// its interchange with itself, which is the station's own now
const railTransfers = rail["transfers.txt"]
  .filter(t => !(t.from_stop_id === t.to_stop_id && adopted.has(t.from_stop_id) && !t.from_trip_id))
  .map(t => ({
    ...t,
    from_stop_id: adopted.get(t.from_stop_id)?.stop_id ?? t.from_stop_id,
    to_stop_id: adopted.get(t.to_stop_id)?.stop_id ?? t.to_stop_id
  }));

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

const combined = {
  "agency.txt": [rail["agency.txt"], tfl["agency.txt"]],
  "routes.txt": [rail["routes.txt"], prefix(tfl["routes.txt"], "route_id")],
  // TfL's shapes are not carried: transxchange2gtfs names a shape for a trip whose route links have
  // no track, and writes none, so a shape_id would point at nothing
  "trips.txt": [rail["trips.txt"], prefix(tfl["trips.txt"], "trip_id", "route_id", "service_id").map(t => ({...t, shape_id: undefined}))],
  "calendar.txt": [rail["calendar.txt"], prefix(tfl["calendar.txt"], "service_id")],
  "calendar_dates.txt": [rail["calendar_dates.txt"], prefix(tfl["calendar_dates.txt"], "service_id")],
  "stops.txt": [rail["stops.txt"].filter(s => !adopted.has(s.stop_id)), tflStops],
  "transfers.txt": [railTransfers, transfers]
};

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

for (const [file, parts] of Object.entries(combined)) {
  const columns = [...new Set([...columnsOf(file), ...(file === "transfers.txt" ? ["mode"] : [])])];
  const out = open(file, columns);

  for (const part of parts) {
    for (const row of part) {
      out.write(row);
    }
  }

  out.end();
}

const stopTimes = open("stop_times.txt", columnsOf("stop_times.txt"));

await readFeed(source(railPath), {"stop_times.txt": row => stopTimes.write(row)}, {extraColumns: railHeaders});
await readFeed(source(tflPath), {"stop_times.txt": row => stopTimes.write({...row, trip_id: "tfl_" + row.trip_id})},
  {extraColumns: tflHeaders});
stopTimes.end();

// what the rail feed has and TfL's has nothing to add to
for (const file of COPIED) {
  const copied = await read(railPath, railHeaders, [file]);

  if (railHeaders[file] !== undefined) {
    const out = open(file, railHeaders[file]);

    for (const row of copied[file]) {
      out.write(row);
    }

    out.end();
  }
}

await deliverFeed(work, outPath);

console.log(
  `${folded.size} TfL stations are platforms of a rail station, ${ownStations.length} are stations of their own: ` +
  `${adopted.size} with a placeholder's code, ${numbered} numbered. ` +
  `${transfers.filter(t => t.mode === "WALK").length / 2} walks.`
);
