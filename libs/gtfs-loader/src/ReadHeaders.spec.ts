import {describe, it, expect} from "vitest";
import {zipSync, strToU8} from "fflate";
import {readHeaders} from "./ReadHeaders.js";

describe("readHeaders", () => {

  it("gives the header of each feed file, and nothing for the files it does not read", async () => {
    const zip = zipSync({
      "stops.txt": strToU8("stop_id,stop_name,platform_code\r\ns1,One,2\n"),
      "transfers.txt": strToU8("from_stop_id,to_stop_id,transfer_type,min_transfer_time,mode\n"),
      "fare_rules.txt": strToU8("fare_id,route_id\n")
    });

    expect(await readHeaders(zip)).to.deep.equal({
      "stops.txt": ["stop_id", "stop_name", "platform_code"],
      "transfers.txt": ["from_stop_id", "to_stop_id", "transfer_type", "min_transfer_time", "mode"]
    });
  });

  it("reads a header written without a line after it, with a byte order mark and quoted names", async () => {
    const zip = zipSync({"agency.txt": strToU8("﻿\"agency_id\",agency_name")});

    expect((await readHeaders(zip))["agency.txt"]).to.deep.equal(["agency_id", "agency_name"]);
  });

  it("stops at the header of a file far larger than one chunk", async () => {
    const rows = Array.from({length: 200_000}, (_, i) => `t${i},10:00:00,10:00:00,s${i},${i}`).join("\n");
    const zip = zipSync({
      "stop_times.txt": strToU8(`trip_id,arrival_time,departure_time,stop_id,stop_sequence\n${rows}\n`),
      "trips.txt": strToU8("route_id,service_id,trip_id\n")
    });

    expect(await readHeaders(zip)).to.deep.equal({
      "stop_times.txt": ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
      "trips.txt": ["route_id", "service_id", "trip_id"]
    });
  });

});
