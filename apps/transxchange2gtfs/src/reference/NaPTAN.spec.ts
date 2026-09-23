import {describe, it, expect} from "vitest";
import {naptanIndexes} from "./NaPTAN";

const CSV = [
  "ATCOCode,NaptanCode,CommonName,Street,Indicator,Bearing,NptgLocalityCode,StopType,"
  + "LocalityName,ParentLocalityName,Longitude,Latitude",
  "stopA,naptanA,Name A,Street A,NE,N,E001,BCT,Town A,City A,-1.5,53.8",
  "stopB,naptanB,Name B,Street B,SW,S,E002,BCT,Town B,,-1.6,53.9"
].join("\n");

describe("naptanIndexes", () => {

  it("indexes NaPTAN rows by ATCO code, reading columns by name", () => {
    const [byCode] = naptanIndexes(CSV);

    // By name, not by position. The old reader sliced the national CSV at
    // [0,1,4,10,14,18,19,29,30] and would have put a street in the latitude if
    // the DfT ever reordered a column.
    expect(byCode["stopA"]).to.deep.equal({
      atcoCode: "stopA",
      naptanCode: "naptanA",
      name: "Name A",
      street: "Street A",
      indicator: "NE",
      locality: "Town A",
      parentLocality: "City A",
      localityCode: "E001",
      bearing: "N",
      stopType: "BCT",
      longitude: "-1.5",
      latitude: "53.8"
    });
  });

  it("indexes by the parent locality, falling back to the locality", () => {
    const [, byLocation] = naptanIndexes(CSV);

    expect(byLocation["City A"]).to.deep.equal(["stopA"]);
    expect(byLocation["Town B"]).to.deep.equal(["stopB"]);
  });

  it("trims what NaPTAN pads", () => {
    const [byCode] = naptanIndexes("ATCOCode,CommonName\nstopD, Sutton Court Farm ");

    expect(byCode["stopD"].name).to.equal("Sutton Court Farm");
  });

  it("projects the grid reference when there is no longitude and latitude", () => {
    // 37,210 of the 435,546 stops in the national file give an easting and a
    // northing and leave the other two columns empty.
    const [byCode] = naptanIndexes(
      "ATCOCode,Easting,Northing,Longitude,Latitude\n0590PGA721,511721,298789,,"
    );

    // Where the DfT's own feed puts this stop, which is the check that the
    // projection is the one NaPTAN's grid references are in.
    expect(Number(byCode["0590PGA721"].latitude)).to.be.closeTo(52.575453532, 0.00001);
    expect(Number(byCode["0590PGA721"].longitude)).to.be.closeTo(-0.352812181, 0.00001);
  });

  it("keeps the coordinates as text", () => {
    const [byCode] = naptanIndexes(
      "ATCOCode,Longitude,Latitude\nstopC,-1.50000,53.80000"
    );

    // Through a number, -1.50000 comes back as -1.5 and the feed loses two
    // digits of the precision NaPTAN published.
    expect(byCode["stopC"].longitude).to.equal("-1.50000");
  });

});
