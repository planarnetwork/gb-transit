import {describe, it, expect} from "vitest";
import {naptanIndexes} from "./NaPTAN";
import {stopAreas} from "./StopAreas";

const HEADER = "ATCOCode,CommonName,Indicator,Bearing,NptgLocalityCode,StopType,"
  + "LocalityName,ParentLocalityName,Longitude,Latitude";

function areas(...rows: string[]) {
  const [byCode] = naptanIndexes([HEADER, ...rows].join("\n"));

  return stopAreas(byCode);
}

describe("stopAreas", () => {

  it("puts the two sides of a street under one station", () => {
    const grouped = areas(
      "stopA,Market Square,adj,N,E001,BCT,Amersham,,-0.60000,51.67000",
      "stopB,Market Square,opp,S,E001,BCT,Amersham,,-0.60040,51.67010"
    );

    expect(grouped["stopA"].id).to.equal("gp:stopA");
    expect(grouped["stopB"].id).to.equal("gp:stopA");
    expect(grouped["stopA"].name).to.equal("Market Square, Amersham");
  });

  it("stands the station between its stops", () => {
    const grouped = areas(
      "stopA,Market Square,adj,N,E001,BCT,Amersham,,-0.60000,51.67000",
      "stopB,Market Square,opp,S,E001,BCT,Amersham,,-0.60040,51.67010"
    );

    expect(Number(grouped["stopA"].latitude)).to.be.closeTo(51.67005, 0.000001);
    expect(Number(grouped["stopA"].longitude)).to.be.closeTo(-0.60020, 0.000001);
  });

  it("leaves two stops facing the same way alone", () => {
    // A row of stops along one side of a road is a long stop, not an
    // interchange, and joining them says a planner can cross between them.
    expect(areas(
      "stopA,Market Square,adj,N,E001,BCT,Amersham,,-0.60000,51.67000",
      "stopB,Market Square,adj,N,E001,BCT,Amersham,,-0.60040,51.67010"
    )).to.deep.equal({});
  });

  it("leaves two stops of the same name too far apart alone", () => {
    // Half a kilometre: a road long enough to have a stop at each end of it.
    expect(areas(
      "stopA,Long Road,adj,N,E001,BCT,Amersham,,-0.60000,51.67000",
      "stopB,Long Road,opp,S,E001,BCT,Amersham,,-0.60000,51.67450"
    )).to.deep.equal({});
  });

  it("leaves two stops of the same name in different localities alone", () => {
    expect(areas(
      "stopA,Market Square,adj,N,E001,BCT,Amersham,,-0.60000,51.67000",
      "stopB,Market Square,opp,S,E002,BCT,Chesham,,-0.60040,51.67010"
    )).to.deep.equal({});
  });

  it("leaves anything that is not an on-street bus stop alone", () => {
    // A station has a hierarchy of its own, and a second parent over the top of
    // it would break the one that is there.
    expect(areas(
      "stopA,Amersham Rail Station,adj,N,E001,RLY,Amersham,,-0.60000,51.67000",
      "stopB,Amersham Rail Station,opp,S,E001,RLY,Amersham,,-0.60040,51.67010"
    )).to.deep.equal({});
  });

  it("leaves a stop with no position alone", () => {
    expect(areas(
      "stopA,Market Square,adj,N,E001,BCT,Amersham,,,",
      "stopB,Market Square,opp,S,E001,BCT,Amersham,,-0.60040,51.67010"
    )).to.deep.equal({});
  });

});
