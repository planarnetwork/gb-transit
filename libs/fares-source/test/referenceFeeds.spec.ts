import * as fs from "node:fs";
import * as path from "node:path";
import {describe, expect, it} from "vitest";
import {loadFares} from "../src/loadFares";

const repository = path.resolve(__dirname, "../../..");
const feeds = path.join(repository, "data/feeds");
const snapshot = path.join(repository, "data/snapshots/db-all-feeds/tables.tsv");
const available = fs.existsSync(snapshot) && fs.existsSync(feeds) && fs.readdirSync(feeds).some(f => /^RJFAF/i.test(f));

/**
 * The reference feeds are not committed. Where they have been downloaded, loading them has to give the same rows the
 * database import does.
 */
describe.skipIf(!available)("reference fares feeds", () => {
  it("loads the same number of rows as the database import", async () => {
    const rows = Object.fromEntries(
      fs.readFileSync(snapshot, "utf8").trim().split("\n").slice(1).map(line => line.split("\t")).map(([t, n]) => [t, +n])
    );
    const data = await loadFares(feeds);

    expect({
      flow: data.flows.length,
      fare: data.fares.length,
      location_group: data.locationGroups.length,
      location_group_member: data.locationGroups.reduce((n, g) => n + g.members.length, 0),
      station_cluster: data.stationClusters.length,
      ticket_type: data.ticketTypes.length,
      non_derivable_fare_override: data.nonDerivableFares.length
    }).toEqual({
      flow: rows.flow,
      fare: rows.fare,
      location_group: rows.location_group,
      location_group_member: rows.location_group_member,
      station_cluster: rows.station_cluster,
      ticket_type: rows.ticket_type,
      non_derivable_fare_override: rows.non_derivable_fare_override
    });
  }, 60_000);
});
