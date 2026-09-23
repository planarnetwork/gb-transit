import {RouteingData} from "./loadRouteing";

/**
 * The code of the London station group, the group a route of LO ("via London") passes through
 */
export const LONDON = "G01";

/**
 * Distance a local journey may exceed the shortest route by and still be permitted
 */
export const LOCAL_MARGIN_MILES = 3;

/**
 * The typed arrays a RouteingNetwork is made of, so it can be shared between worker threads without copying
 */
export interface RouteingArrays {
  /** CRS code of each station */
  readonly stations: readonly string[];
  /** code of each routeing point, a station CRS or a group code */
  readonly routeingPoints: readonly string[];
  /** shortest distance in miles between each pair of stations, from * stationCount + to */
  readonly miles: Float32Array;
  /** shortest distance in miles from each station to the nearest station of each routeing point */
  readonly routeingPointMiles: Float32Array;
  /** the routeing points of each station */
  readonly stationRouteingPointOffsets: Int32Array;
  readonly stationRouteingPoints: Int32Array;
  /** the stations of each routeing point: the station itself, or the members of a group */
  readonly routeingPointStationOffsets: Int32Array;
  readonly routeingPointStations: Int32Array;
  /** stations on a permitted route between each pair of routeing points, as a bitset per pair */
  readonly permitted: Uint32Array;
  /** stations a journey to or from each routeing point may pass through locally, as a bitset per routeing point */
  readonly catchment: Uint32Array;
}

/**
 * Which stations a journey may pass through under the National Routeing Guide.
 *
 * A journey between stations with no routeing point in common goes from the origin to one of its routeing points
 * under the local rules, between routeing points on a permitted route, then on to the destination under the local
 * rules. The local rules permit the shortest route and any route no more than three miles longer. A permitted route is
 * a sequence of maps, travelled in order without doubling back.
 *
 * A station is on some route through a map from one node to another without repeating a node exactly when it is in
 * a biconnected block on the path between them in the map's block-cut tree, so that is what each map segment
 * contributes.
 *
 * Not modelled: the fare check that decides whether a routeing point is appropriate, easements, and the requirement
 * that a route never repeats a station across map segments. The result errs towards permitting too much.
 *
 * Stations are held as bitsets of `words` 32 bit words.
 */
export class RouteingNetwork {

  public readonly stationCount: number;
  public readonly words: number;
  private readonly stationIds: Map<string, number>;
  private readonly routeingPointIds: Map<string, number>;

  constructor(public readonly arrays: RouteingArrays) {
    this.stationCount = arrays.stations.length;
    this.words = Math.ceil(this.stationCount / 32);
    this.stationIds = new Map(arrays.stations.map((crs, id) => [crs, id]));
    this.routeingPointIds = new Map(arrays.routeingPoints.map((code, id) => [code, id]));
  }

  public static build(data: RouteingData): RouteingNetwork {
    return new RouteingNetwork(new NetworkBuilder(data).build());
  }

  public station(crs: string): number | undefined {
    return this.stationIds.get(crs);
  }

  public routeingPoint(code: string): number | undefined {
    return this.routeingPointIds.get(code);
  }

  public routeingPointsOf(station: number): Int32Array {
    const {stationRouteingPointOffsets: offsets, stationRouteingPoints: values} = this.arrays;

    return values.subarray(offsets[station], offsets[station + 1]);
  }

  public stationsOf(routeingPoint: number): Int32Array {
    const {routeingPointStationOffsets: offsets, routeingPointStations: values} = this.arrays;

    return values.subarray(offsets[routeingPoint], offsets[routeingPoint + 1]);
  }

  /**
   * Stations on a permitted route between two routeing points
   */
  public permitted(from: number, to: number): Uint32Array {
    const start = (from * this.arrays.routeingPoints.length + to) * this.words;

    return this.arrays.permitted.subarray(start, start + this.words);
  }

  /**
   * Stations a local journey to or from the routeing point may pass through
   */
  public catchment(routeingPoint: number): Uint32Array {
    const start = routeingPoint * this.words;

    return this.arrays.catchment.subarray(start, start + this.words);
  }

  /**
   * Add the stations on a local journey from the station to the routeing point to the bitset: those on a route no more
   * than three miles longer than the shortest
   */
  public addLocal(station: number, routeingPoint: number, into: Uint32Array): void {
    addLocal(this.arrays, this.stationCount, station, routeingPoint, into);
  }

}

function addLocal(arrays: Pick<RouteingArrays, "miles" | "routeingPointMiles">, stationCount: number, station: number, routeingPoint: number, into: Uint32Array): void {
  const toPoint = arrays.routeingPointMiles.subarray(routeingPoint * stationCount, (routeingPoint + 1) * stationCount);
  const limit = toPoint[station] + LOCAL_MARGIN_MILES;
  const fromStation = station * stationCount;

  for (let x = 0; x < stationCount; x++) {
    if (arrays.miles[fromStation + x] + toPoint[x] <= limit) {
      into[x >>> 5] |= 1 << (x & 31);
    }
  }
}

interface MapBlocks {
  /** the blocks each node is in */
  readonly blocksOf: Map<number, number[]>;
  /** the nodes in each block */
  readonly blocks: number[][];
  /** neighbours of each node on this map */
  readonly adjacent: Map<number, number[]>;
}

class NetworkBuilder {

  private readonly stations: string[] = [];
  private readonly stationIds = new Map<string, number>();
  private readonly groupMembers = new Map<string, number[]>();
  private readonly nodes: string[];
  private readonly nodeIds: Map<string, number>;
  private readonly nodeOfStation: Int32Array;
  private readonly words: number;
  private readonly maps = new Map<string, MapBlocks>();
  private readonly linkStations = new Map<number, number[]>();
  private readonly segments = new Map<string, Uint32Array | null>();

  constructor(private readonly data: RouteingData) {
    for (const crs of neighbourOrder(data)) {
      this.stationId(crs);
    }
    for (const station of data.stations) {
      if (station.group !== null) {
        const members = this.groupMembers.get(station.group) ?? [];
        members.push(this.stationIds.get(station.crs)!);
        this.groupMembers.set(station.group, members);
      }
    }

    this.words = Math.ceil(this.stations.length / 32);
    this.nodes = [...new Set([...data.nodes, ...data.routeingPoints, ...data.mapLinks.flatMap(l => [l.from, l.to])])];
    this.nodeIds = new Map(this.nodes.map((code, id) => [code, id]));
    this.nodeOfStation = new Int32Array(this.stations.length).fill(-1);

    this.nodes.forEach((code, node) => {
      for (const station of this.stationsOfCode(code)) {
        this.nodeOfStation[station] = node;
      }
    });
  }

  public build(): RouteingArrays {
    const miles = this.allPairsMiles();
    const routeingPoints = this.data.routeingPoints;
    const routeingPointStations = routeingPoints.map(code => this.stationsOfCode(code));
    const routeingPointMiles = this.routeingPointMiles(miles, routeingPointStations);
    const stationRouteingPoints = this.stationRouteingPoints(routeingPoints);

    this.findLinkStations();

    const permitted = this.permittedStations(routeingPoints);
    const stationRps = csr(stationRouteingPoints);
    const rpStations = csr(routeingPointStations);
    const catchment = new Uint32Array(routeingPoints.length * this.words);

    stationRouteingPoints.forEach((points, station) => {
      for (const point of points) {
        addLocal({miles, routeingPointMiles}, this.stations.length, station, point, catchment.subarray(point * this.words, (point + 1) * this.words));
      }
    });
    routeingPointStations.forEach((members, point) => {
      for (const station of members) {
        catchment[point * this.words + (station >>> 5)] |= 1 << (station & 31);
      }
    });

    return {
      stations: this.stations,
      routeingPoints,
      miles,
      routeingPointMiles,
      stationRouteingPointOffsets: stationRps.offsets,
      stationRouteingPoints: stationRps.values,
      routeingPointStationOffsets: rpStations.offsets,
      routeingPointStations: rpStations.values,
      permitted,
      catchment
    };
  }

  private stationId(crs: string): number {
    let id = this.stationIds.get(crs);

    if (id === undefined) {
      id = this.stations.length;
      this.stationIds.set(crs, id);
      this.stations.push(crs);
    }

    return id;
  }

  /**
   * A routeing point or node code is either a group of stations or a single station
   */
  private stationsOfCode(code: string): number[] {
    const members = this.groupMembers.get(code);
    const station = this.stationIds.get(code);

    return members ?? (station === undefined ? [] : [station]);
  }

  /**
   * Shortest distances over the station links. Detours within a station group do not count towards the distance of a
   * route, so the members of each group are joined at no distance.
   */
  private allPairsMiles(): Float32Array {
    const count = this.stations.length;
    const adjacent: [number, number][][] = Array.from({length: count}, () => []);

    for (const link of this.data.stationLinks) {
      adjacent[this.stationIds.get(link.from)!].push([this.stationIds.get(link.to)!, link.miles]);
    }
    for (const members of this.groupMembers.values()) {
      for (const a of members) {
        for (const b of members) {
          if (a !== b) {
            adjacent[a].push([b, 0]);
          }
        }
      }
    }

    const miles = new Float32Array(count * count);
    const distances = new Float64Array(count);
    const heap = new MinHeap(count, distances);

    for (let origin = 0; origin < count; origin++) {
      distances.fill(Infinity);
      distances[origin] = 0;
      heap.push(origin);

      while (heap.size > 0) {
        const current = heap.pop();

        for (const [next, length] of adjacent[current]) {
          if (distances[current] + length < distances[next]) {
            distances[next] = distances[current] + length;
            heap.pushOrDecrease(next);
          }
        }
      }

      miles.set(distances, origin * count);
    }

    return miles;
  }

  private routeingPointMiles(miles: Float32Array, routeingPointStations: number[][]): Float32Array {
    const count = this.stations.length;
    const result = new Float32Array(routeingPointStations.length * count).fill(Infinity);

    routeingPointStations.forEach((members, point) => {
      for (const member of members) {
        for (let x = 0; x < count; x++) {
          result[point * count + x] = Math.min(result[point * count + x], miles[member * count + x]);
        }
      }
    });

    return result;
  }

  /**
   * A station in a group has the group as its routeing point. A station that is a routeing point has only itself.
   * Any other station has the routeing points listed for it.
   */
  private stationRouteingPoints(routeingPoints: string[]): number[][] {
    const pointIds = new Map(routeingPoints.map((code, id) => [code, id]));
    const result: number[][] = this.stations.map(() => []);

    for (const station of this.data.stations) {
      const id = this.stationIds.get(station.crs)!;
      const codes = station.group !== null ? [station.group]
        : station.routeingPoints.length > 0 ? station.routeingPoints
        : [station.crs];

      result[id] = codes.map(code => pointIds.get(code)).filter(point => point !== undefined);
    }

    return result;
  }

  /**
   * The stations between each pair of adjacent nodes. Maps only link nodes, so the stations along a link are found by
   * walking the station links out from each node until another node is reached.
   */
  private findLinkStations(): void {
    const count = this.stations.length;
    const adjacent: number[][] = Array.from({length: count}, () => []);

    for (const link of this.data.stationLinks) {
      adjacent[this.stationIds.get(link.from)!].push(this.stationIds.get(link.to)!);
    }

    const parent = new Int32Array(count).fill(-1);

    for (let node = 0; node < this.nodes.length; node++) {
      for (const start of this.stationsOfCode(this.nodes[node])) {
        for (const first of adjacent[start]) {
          if (this.nodeOfStation[first] !== -1) {
            continue;
          }

          const visited = [first];
          const touched = [first];
          const reached = new Map<number, number>();
          parent[first] = start;

          for (let i = 0; i < visited.length; i++) {
            for (const next of adjacent[visited[i]]) {
              if (parent[next] !== -1 || next === start) {
                continue;
              }

              parent[next] = visited[i];
              touched.push(next);

              const other = this.nodeOfStation[next];

              if (other === -1) {
                visited.push(next);
              }
              else if (other !== node && !reached.has(other)) {
                reached.set(other, next);
              }
            }
          }

          for (const [other, end] of reached) {
            const key = linkKey(node, other, this.nodes.length);
            const stations = this.linkStations.get(key) ?? [];

            for (let x = parent[end]; x !== start; x = parent[x]) {
              stations.push(x);
            }

            this.linkStations.set(key, stations);
          }
          for (const x of touched) {
            parent[x] = -1;
          }
        }
      }
    }
  }

  private permittedStations(routeingPoints: string[]): Uint32Array {
    const count = routeingPoints.length;
    const pointIds = new Map(routeingPoints.map((code, id) => [code, id]));
    const result = new Uint32Array(count * count * this.words);
    const viaLondon: [number, number][] = [];
    const london = pointIds.get(LONDON);

    for (const route of this.data.permittedRoutes) {
      const from = pointIds.get(route.from);
      const to = pointIds.get(route.to);

      if (from === undefined || to === undefined) {
        continue;
      }
      if (route.maps.length === 1 && route.maps[0] === "LO" && !(this.onMap("LO", route.from) && this.onMap("LO", route.to))) {
        viaLondon.push([from, to]);
        continue;
      }

      const stations = this.routeStations(route.from, route.to, route.maps);
      const offset = (from * count + to) * this.words;

      for (let w = 0; w < this.words; w++) {
        result[offset + w] |= stations[w];
      }
    }

    if (london !== undefined) {
      for (const [from, to] of viaLondon) {
        const offset = (from * count + to) * this.words;
        const toLondon = (from * count + london) * this.words;
        const fromLondon = (london * count + to) * this.words;

        for (let w = 0; w < this.words; w++) {
          result[offset + w] |= result[toLondon + w] | result[fromLondon + w];
        }
      }
    }

    return result;
  }

  private onMap(map: string, code: string): boolean {
    const node = this.nodeIds.get(code);

    return node !== undefined && this.mapBlocks(map).adjacent.has(node);
  }

  /**
   * Stations on a route over the maps in order. Map i is entered where map i - 1 was left, at a node on both maps, and
   * only entries that can still reach the destination over the remaining maps are used.
   */
  private routeStations(from: string, to: string, maps: readonly string[]): Uint32Array {
    const result = new Uint32Array(this.words);
    const origin = this.nodeIds.get(from);
    const destination = this.nodeIds.get(to);

    if (origin === undefined || destination === undefined) {
      return result;
    }

    const blocks = maps.map(map => this.mapBlocks(map));
    const last = maps.length - 1;
    const entries: Set<number>[] = [new Set(blocks[0].adjacent.has(origin) ? [origin] : [])];

    for (let i = 0; i < last; i++) {
      const next = new Set<number>();

      for (const entry of entries[i]) {
        for (const change of blocks[i].adjacent.keys()) {
          if (change !== entry && blocks[i + 1].adjacent.has(change) && this.segment(maps[i], entry, change) !== null) {
            next.add(change);
          }
        }
      }

      entries.push(next);
    }

    const exits: Set<number>[] = new Array(maps.length);
    exits[last] = new Set(blocks[last].adjacent.has(destination) ? [destination] : []);

    for (let i = last - 1; i >= 0; i--) {
      exits[i] = new Set([...entries[i + 1]].filter(change =>
        [...exits[i + 1]].some(exit => this.segment(maps[i + 1], change, exit) !== null)
      ));
    }

    for (let i = 0; i <= last; i++) {
      for (const entry of entries[i]) {
        for (const exit of exits[i]) {
          const stations = this.segment(maps[i], entry, exit);

          if (stations !== null) {
            for (let w = 0; w < this.words; w++) {
              result[w] |= stations[w];
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Stations on a route through one map from one node to another that does not repeat a node, or null if there is no
   * such route
   */
  private segment(map: string, from: number, to: number): Uint32Array | null {
    const key = `${map}|${from}|${to}`;
    const cached = this.segments.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const nodes = this.blockPath(this.mapBlocks(map), from, to);
    let result: Uint32Array | null = null;

    if (nodes !== null) {
      result = new Uint32Array(this.words);

      const {adjacent} = this.mapBlocks(map);

      for (const node of nodes) {
        for (const station of this.stationsOfCode(this.nodes[node])) {
          result[station >>> 5] |= 1 << (station & 31);
        }
        for (const other of adjacent.get(node) ?? []) {
          if (nodes.has(other)) {
            for (const station of this.linkStations.get(linkKey(node, other, this.nodes.length)) ?? []) {
              result[station >>> 5] |= 1 << (station & 31);
            }
          }
        }
      }
    }

    this.segments.set(key, result);

    return result;
  }

  /**
   * The nodes of the blocks on the path between two nodes in the block-cut tree
   */
  private blockPath({blocksOf, blocks}: MapBlocks, from: number, to: number): Set<number> | null {
    if (from === to) {
      return new Set([from]);
    }
    if (!blocksOf.has(from) || !blocksOf.has(to)) {
      return null;
    }

    // vertices of the block-cut tree: nodes as themselves, blocks as -1 - block
    const previous = new Map<number, number>([[from, from]]);
    const queue = [from];

    for (let i = 0; i < queue.length && !previous.has(to); i++) {
      const current = queue[i];
      const neighbours = current >= 0 ? blocksOf.get(current)!.map(block => -1 - block) : blocks[-1 - current];

      for (const next of neighbours) {
        if (!previous.has(next)) {
          previous.set(next, current);
          queue.push(next);
        }
      }
    }

    if (!previous.has(to)) {
      return null;
    }

    const result = new Set<number>();

    for (let current = to; current !== from; current = previous.get(current)!) {
      if (current < 0) {
        for (const node of blocks[-1 - current]) {
          result.add(node);
        }
      }
    }

    return result;
  }

  private mapBlocks(map: string): MapBlocks {
    let result = this.maps.get(map);

    if (result === undefined) {
      const adjacent = new Map<number, number[]>();

      for (const link of this.data.mapLinks) {
        if (link.map === map) {
          const from = this.nodeIds.get(link.from)!;
          const to = this.nodeIds.get(link.to)!;
          const list = adjacent.get(from) ?? [];

          if (!list.includes(to)) {
            list.push(to);
          }
          adjacent.set(from, list);
        }
      }

      result = {...biconnectedBlocks(adjacent), adjacent};
      this.maps.set(map, result);
    }

    return result;
  }

}

/**
 * Every station, in the order a breadth first walk over the station links reaches them. Numbering stations in this
 * order gives neighbours nearby numbers, so the stations of a route are close together in anything indexed by station.
 */
function neighbourOrder(data: RouteingData): string[] {
  const adjacent = new Map<string, string[]>();

  for (const {crs} of data.stations) {
    adjacent.set(crs, []);
  }
  for (const link of data.stationLinks) {
    adjacent.set(link.from, [...(adjacent.get(link.from) ?? []), link.to]);
    adjacent.set(link.to, adjacent.get(link.to) ?? []);
  }

  const order: string[] = [];
  const seen = new Set<string>();

  for (const start of [...adjacent.keys()].sort()) {
    if (seen.has(start)) {
      continue;
    }

    seen.add(start);
    order.push(start);

    for (let i = order.length - 1; i < order.length; i++) {
      for (const next of adjacent.get(order[i])!) {
        if (!seen.has(next)) {
          seen.add(next);
          order.push(next);
        }
      }
    }
  }

  return order;
}

/**
 * Hopcroft-Tarjan biconnected components of an undirected graph
 */
function biconnectedBlocks(adjacent: Map<number, number[]>): {blocksOf: Map<number, number[]>, blocks: number[][]} {
  const discovered = new Map<number, number>();
  const low = new Map<number, number>();
  const edges: [number, number][] = [];
  const blocks: number[][] = [];
  let time = 0;

  const visit = (node: number, parent: number) => {
    discovered.set(node, time);
    low.set(node, time);
    time++;

    for (const next of adjacent.get(node) ?? []) {
      if (!discovered.has(next)) {
        edges.push([node, next]);
        visit(next, node);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));

        if (low.get(next)! >= discovered.get(node)!) {
          const block = new Set<number>();
          let edge: [number, number];

          do {
            edge = edges.pop()!;
            block.add(edge[0]);
            block.add(edge[1]);
          } while (edge[0] !== node || edge[1] !== next);

          blocks.push([...block]);
        }
      }
      else if (next !== parent && discovered.get(next)! < discovered.get(node)!) {
        edges.push([node, next]);
        low.set(node, Math.min(low.get(node)!, discovered.get(next)!));
      }
    }
  };

  for (const node of adjacent.keys()) {
    if (!discovered.has(node)) {
      visit(node, -1);
    }
  }

  const blocksOf = new Map<number, number[]>();

  blocks.forEach((nodes, block) => {
    for (const node of nodes) {
      const list = blocksOf.get(node) ?? [];
      list.push(block);
      blocksOf.set(node, list);
    }
  });

  return {blocksOf, blocks};
}

function linkKey(a: number, b: number, nodeCount: number): number {
  return a < b ? a * nodeCount + b : b * nodeCount + a;
}

function csr(lists: number[][]): {offsets: Int32Array, values: Int32Array} {
  const offsets = new Int32Array(lists.length + 1);

  lists.forEach((list, i) => {
    offsets[i + 1] = offsets[i] + list.length;
  });

  return {offsets, values: Int32Array.from(lists.flat())};
}

/**
 * Binary min-heap of node IDs keyed by an external distance array
 */
class MinHeap {

  private readonly heap: Int32Array;
  private readonly positions: Int32Array;
  public size = 0;

  constructor(capacity: number, private readonly keys: Float64Array) {
    this.heap = new Int32Array(capacity);
    this.positions = new Int32Array(capacity).fill(-1);
  }

  public push(node: number): void {
    this.heap[this.size] = node;
    this.positions[node] = this.size;
    this.siftUp(this.size++);
  }

  public pushOrDecrease(node: number): void {
    if (this.positions[node] === -1) {
      this.push(node);
    }
    else {
      this.siftUp(this.positions[node]);
    }
  }

  public pop(): number {
    const top = this.heap[0];

    this.positions[top] = -1;
    this.size--;

    if (this.size > 0) {
      this.heap[0] = this.heap[this.size];
      this.positions[this.heap[0]] = 0;
      this.siftDown(0);
    }

    return top;
  }

  private siftUp(index: number): void {
    const node = this.heap[index];

    while (index > 0) {
      const parent = (index - 1) >> 1;

      if (this.keys[this.heap[parent]] <= this.keys[node]) {
        break;
      }

      this.heap[index] = this.heap[parent];
      this.positions[this.heap[index]] = index;
      index = parent;
    }

    this.heap[index] = node;
    this.positions[node] = index;
  }

  private siftDown(index: number): void {
    const node = this.heap[index];

    while (true) {
      let child = 2 * index + 1;

      if (child >= this.size) {
        break;
      }
      if (child + 1 < this.size && this.keys[this.heap[child + 1]] < this.keys[this.heap[child]]) {
        child++;
      }
      if (this.keys[this.heap[child]] >= this.keys[node]) {
        break;
      }

      this.heap[index] = this.heap[child];
      this.positions[this.heap[index]] = index;
      index = child;
    }

    this.heap[index] = node;
    this.positions[node] = index;
  }

}
