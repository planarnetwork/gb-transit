import * as path from "node:path";
import {eachLine, ZipFile} from "@gb-transit/fares-source";

/**
 * A station and the routeing points it is associated with. A station that is a routeing point, or a member of a
 * group that is one, has no routeing points of its own.
 */
export interface RouteingStation {
  readonly crs: string;
  readonly routeingPoints: readonly string[];
  readonly group: string | null;
}

export interface StationLink {
  readonly from: string;
  readonly to: string;
  readonly miles: number;
}

/**
 * A link between two nodes on a map. Nodes are routeing points, station groups (G01 is London) and junctions.
 */
export interface MapLink {
  readonly from: string;
  readonly to: string;
  readonly map: string;
}

/**
 * One permitted route between two routeing points: the maps to travel over, in order. A route of the single map LO
 * means via London, any permitted route to the London group followed by any permitted route from it.
 */
export interface PermittedRoute {
  readonly from: string;
  readonly to: string;
  readonly maps: readonly string[];
}

export interface RouteingData {
  readonly stations: RouteingStation[];
  readonly routeingPoints: string[];
  readonly nodes: string[];
  readonly stationLinks: StationLink[];
  readonly mapLinks: MapLink[];
  readonly permittedRoutes: PermittedRoute[];
}

/**
 * Load the parts of a routeing guide feed (RJRGxxxx.ZIP) that say where a journey may go: stations and their routeing
 * points, the distances between stations, the maps and the permitted routes between routeing points.
 *
 * The files are comma separated. The layouts are those in RSPS5047, as also declared in @gb-transit/dtd-schema.
 */
export async function loadRouteing(zipPath: string): Promise<RouteingData> {
  const zip = ZipFile.open(zipPath);
  const read = async (extension: string, onRow: (columns: string[]) => void) => {
    const entry = zip.entries.find(e => path.extname(e.name).slice(1).toUpperCase() === extension);

    if (entry === undefined) {
      throw new Error(`${zipPath} has no ${extension} file`);
    }

    await eachLine(zip.stream(entry), line => onRow(line.split(",")));
  };

  const stations: RouteingStation[] = [];
  const routeingPoints: string[] = [];
  const nodes: string[] = [];
  const stationLinks: StationLink[] = [];
  const mapLinks: MapLink[] = [];
  const permittedRoutes: PermittedRoute[] = [];

  await Promise.all([
    read("RGS", ([crs, rp1, rp2, rp3, rp4, group]) => stations.push({
      crs,
      routeingPoints: [rp1, rp2, rp3, rp4].filter(rp => rp !== undefined && rp !== ""),
      group: group === undefined || group === "" ? null : group
    })),
    read("RGP", ([code]) => routeingPoints.push(code)),
    read("RGN", ([code]) => nodes.push(code)),
    read("RGD", ([from, to, miles]) => stationLinks.push({from, to, miles: parseFloat(miles)})),
    read("RGL", ([from, to, map]) => mapLinks.push({from, to, map})),
    read("RGR", ([from, to, ...maps]) => permittedRoutes.push({from, to, maps}))
  ]);

  return {stations, routeingPoints, nodes, stationLinks, mapLinks, permittedRoutes};
}
