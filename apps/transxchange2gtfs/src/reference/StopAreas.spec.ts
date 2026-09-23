import {describe, it, expect} from "vitest";
import {naptanIndexes} from "./NaPTAN";
import {areaOf, stationAreas, stopAreas} from "./StopAreas";

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

describe("stationAreas", () => {

  function stations(...rows: string[]) {
    const [byCode] = naptanIndexes([HEADER, ...rows].join("\n"));

    return stationAreas(byCode);
  }

  it("puts a station's platforms under the stop area NaPTAN numbers them after", () => {
    const grouped = stations(
      "9400ZZLUKSX1,King's Cross St. Pancras Underground Station,,,E001,PLT,London,,-0.12400,51.53000",
      "9400ZZLUKSX4,King's Cross St. Pancras Underground Station,,,E001,PLT,London,,-0.12600,51.53020",
      "9300SWK1,Bankside Pier,,,E001,FBT,London,,-0.09600,51.50800"
    );

    expect(grouped["9400ZZLUKSX1"].id).to.equal("940GZZLUKSX");
    expect(grouped["9400ZZLUKSX4"].id).to.equal("940GZZLUKSX");
    expect(grouped["9400ZZLUKSX1"].name).to.equal("King's Cross St. Pancras Underground Station");
    expect(grouped["9400ZZLUKSX1"].longitude).to.equal("-0.125");
    expect(grouped["9300SWK1"].id).to.equal("930GSWK");
  });

  it("keeps Heathrow's terminals apart, whose number is part of the station code", () => {
    const grouped = stations(
      "9400ZZLUHR41,Heathrow Terminal 4 Underground Station,,,E001,PLT,London,,-0.44600,51.45900",
      "9400ZZLUHR51,Heathrow Terminal 5 Underground Station,,,E001,PLT,London,,-0.48800,51.47100"
    );

    expect(grouped["9400ZZLUHR41"].id).to.equal("940GZZLUHR4");
    expect(grouped["9400ZZLUHR51"].id).to.equal("940GZZLUHR5");
  });

  it("leaves a station's entrance out of it, which shares the code but is not a platform", () => {
    expect(stations(
      "9400ZZLUHR4,Heathrow Terminal 4 Underground Station,,,E001,MET,London,,-0.44600,51.45900"
    )).to.deep.equal({});
  });

  it("names a station for what its platforms share, without the direction they face", () => {
    const grouped = stations(
      "9400ZZSYRTH1,Rotherham Station To Parkgate,,,E001,PLT,Rotherham,,-1.36000,53.43000",
      "9400ZZSYRTH2,Rotherham Station To Sheffield,,,E001,PLT,Rotherham,,-1.36010,53.43010"
    );

    expect(grouped["9400ZZSYRTH1"].name).to.equal("Rotherham Station");
  });

  it("names a station for its first platform where the platforms disagree about more than that", () => {
    const grouped = stations(
      "9400ZZLUHRC2,Heathrow Terminals 1-2-3 Underground Station,,,E001,PLT,London,,-0.45200,51.47100",
      "9400ZZLUHRC1,Heathrow Terminals 2 & 3 Underground Station,,,E001,PLT,London,,-0.45210,51.47110"
    );

    expect(grouped["9400ZZLUHRC1"].name).to.equal("Heathrow Terminals 2 & 3 Underground Station");
  });

  it("leaves a stop that is not a numbered platform alone", () => {
    expect(stations(
      "490000077E,Market Square,adj,N,E001,BCT,Amersham,,-0.60000,51.67000",
      "9100AMERSHM,Amersham Rail Station,,,E001,RLY,Amersham,,-0.60000,51.67000"
    )).to.deep.equal({});
  });

  it("finds the station of a platform NaPTAN does not list", () => {
    const grouped = stations(
      "9400ZZLUBST1,Baker Street Underground Station,,,E001,PLT,London,,-0.15750,51.52321"
    );

    expect(areaOf(grouped, "9400ZZLUBST7")?.id).to.equal("940GZZLUBST");
    expect(areaOf(grouped, "9400ZZLUXYZ1")).to.equal(undefined);
  });

});
