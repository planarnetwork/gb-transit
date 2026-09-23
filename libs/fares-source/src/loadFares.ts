import schema from "@gb-transit/dtd-schema";
import {FeedFile, FieldValue, MultiRecordFile, Record} from "@gb-transit/feed-parser";
import {CodeTable, Column} from "./Columns";
import {FaresFeed} from "./FaresFeed";
import {
  DateNumber,
  Fares,
  FaresData,
  Flows,
  Location,
  LocationGroup,
  LocationGroupMember,
  NonDerivableFare,
  StationCluster,
  TicketType
} from "./FaresData";

export interface LoadFaresOptions {
  /**
   * Only keep records valid on this date (YYYY-MM-DD), and fares on flows valid on it. Everything is kept if omitted.
   */
  date?: string;
}

const {FFL, LOC, FSC, TTY, NFO} = schema.fares as {[extension: string]: FeedFile};
const flowRecord = (FFL as MultiRecordFile).records["F"];
const fareRecord = (FFL as MultiRecordFile).records["T"];

/**
 * Load the parts of a fares feed needed to look fares up: locations, groups, clusters, ticket types, flows, fares and
 * non-derivable fares. Flows and fares are held in typed columns as there are millions of them.
 *
 * `source` is a fares feed zip, a list of them or a directory holding them. The most recent full refresh is read with
 * the change files that follow it applied.
 */
export async function loadFares(source: string | string[], options: LoadFaresOptions = {}): Promise<FaresData> {
  const feed = new FaresFeed(source);
  const date = options.date === undefined ? undefined : dateNumber(options.date);
  const valid = (start: DateNumber, end: DateNumber) => date === undefined || (start <= date && date <= end);
  const codes = {
    locations: new CodeTable(),
    routes: new CodeTable(),
    tickets: new CodeTable(),
    restrictions: new CodeTable()
  };

  codes.restrictions.id("");

  const [locations, clusters, ticketTypes, nonDerivableFares, flowsAndFares] = await Promise.all([
    readLocations(feed, valid),
    readClusters(feed, valid),
    readTicketTypes(feed, valid),
    readNonDerivableFares(feed, valid),
    readFlows(feed, codes, valid)
  ]);

  return {
    locations: locations.locations,
    locationGroups: locations.groups,
    stationClusters: clusters,
    ticketTypes,
    nonDerivableFares,
    flows: flowsAndFares.flows,
    fares: flowsAndFares.fares,
    codes
  };
}

type Validity = (start: DateNumber, end: DateNumber) => boolean;

async function readLocations(feed: FaresFeed, valid: Validity) {
  const locations: Location[] = [];
  const groups = new Map<string, LocationGroup>();
  const members: [key: string, member: LocationGroupMember][] = [];

  await feed.eachLine("LOC", LOC, line => {
    const type = line.charAt(1);

    if (type === "L") {
      const v = values(LOC, line);
      const startDate = date(v.start_date);
      const endDate = date(v.end_date);

      if (valid(startDate, endDate)) {
        locations.push({
          uic: text(v.uic)!,
          nlc: text(v.nlc),
          crs: text(v.crs),
          description: text(v.description)!,
          fareGroup: text(v.fare_group),
          zoneNo: text(v.zone_no),
          zoneInd: text(v.zone_ind),
          startDate,
          endDate,
          quoteDate: date(v.quote_date)
        });
      }
    }
    else if (type === "G") {
      const v = values(LOC, line);
      const startDate = date(v.start_date);
      const endDate = date(v.end_date);

      if (valid(startDate, endDate)) {
        const uic = text(v.group_uic_code)!;

        groups.set(`${uic}|${endDate}`, {
          uic,
          nlc: nlc(uic),
          description: text(v.description)!,
          startDate,
          endDate,
          quoteDate: date(v.quote_date),
          members: []
        });
      }
    }
    else if (type === "M") {
      const v = values(LOC, line);
      const uic = text(v.member_uic_code)!;

      members.push([
        `${text(v.group_uic_code)}|${date(v.end_date)}`,
        {uic, nlc: nlc(uic), crs: text(v.member_crs_code)}
      ]);
    }
  });

  for (const [key, member] of members) {
    groups.get(key)?.members.push(member);
  }

  return {locations, groups: [...groups.values()]};
}

async function readClusters(feed: FaresFeed, valid: Validity): Promise<StationCluster[]> {
  const clusters: StationCluster[] = [];

  await feed.eachLine("FSC", FSC, line => {
    const v = values(FSC, line);
    const startDate = date(v.start_date);
    const endDate = date(v.end_date);

    if (valid(startDate, endDate)) {
      clusters.push({clusterId: text(v.cluster_id)!, nlc: text(v.cluster_nlc)!, startDate, endDate});
    }
  });

  return clusters;
}

async function readTicketTypes(feed: FaresFeed, valid: Validity): Promise<TicketType[]> {
  const ticketTypes: TicketType[] = [];

  await feed.eachLine("TTY", TTY, line => {
    const v = values(TTY, line);
    const startDate = date(v.start_date);
    const endDate = date(v.end_date);

    if (valid(startDate, endDate)) {
      ticketTypes.push({
        code: text(v.ticket_code)!,
        description: text(v.description)!,
        startDate,
        endDate,
        quoteDate: date(v.quote_date),
        ticketClass: v.tkt_class as number,
        ticketType: text(v.tkt_type)!,
        ticketGroup: text(v.tkt_group)!,
        maxPassengers: v.max_passengers as number,
        minPassengers: v.min_passengers as number,
        maxAdults: v.max_adults as number,
        minAdults: v.min_adults as number,
        maxChildren: v.max_children as number,
        minChildren: v.min_children as number,
        restrictedByDate: v.restricted_by_date === 1,
        restrictedByTrain: v.restricted_by_train === 1,
        restrictedByArea: v.restricted_by_area === 1,
        validityCode: text(v.validity_code)!,
        discountCategory: v.discount_category as number
      });
    }
  });

  return ticketTypes;
}

async function readNonDerivableFares(feed: FaresFeed, valid: Validity): Promise<NonDerivableFare[]> {
  const fares: NonDerivableFare[] = [];

  await feed.eachLine("NFO", NFO, line => {
    const v = values(NFO, line);
    const startDate = date(v.start_date);
    const endDate = date(v.end_date);

    if (valid(startDate, endDate)) {
      fares.push({
        origin: text(v.origin_code)!,
        destination: text(v.destination_code)!,
        route: text(v.route_code),
        railcard: text(v.railcard_code) ?? "",
        ticket: text(v.ticket_code)!,
        recordType: text(v.nd_record_type)!,
        startDate,
        endDate,
        quoteDate: date(v.quote_date),
        suppress: v.suppress_mkr === 1,
        adultFare: v.adult_fare as number | null,
        childFare: v.child_fare as number | null,
        restriction: text(v.restriction_code),
        compositeIndicator: text(v.composite_indicator)
      });
    }
  });

  return fares;
}

/**
 * Flows and fares are sliced by hand at the positions the schema gives rather than through extractValues, which
 * builds an object per line and there are seven million of them.
 */
async function readFlows(feed: FaresFeed, codes: FaresData["codes"], valid: Validity): Promise<{flows: Flows, fares: Fares}> {
  const flow = positions(flowRecord);
  const fare = positions(fareRecord);
  const flowColumns = {
    flowId: new Column(n => new Int32Array(n)),
    origin: new Column(n => new Uint32Array(n)),
    destination: new Column(n => new Uint32Array(n)),
    route: new Column(n => new Uint32Array(n)),
    usage: new Column(n => new Uint8Array(n)),
    direction: new Column(n => new Uint8Array(n)),
    startDate: new Column(n => new Uint32Array(n)),
    endDate: new Column(n => new Uint32Array(n))
  };
  const fareColumns = {
    flowId: new Column(n => new Int32Array(n), 1 << 20),
    ticket: new Column(n => new Uint16Array(n), 1 << 20),
    price: new Column(n => new Uint32Array(n), 1 << 20),
    restriction: new Column(n => new Uint16Array(n), 1 << 20)
  };

  await feed.eachLine("FFL", FFL, line => {
    const type = line.charCodeAt(1);

    if (type === 84) {
      const restriction = line.substr(fare.restriction_code[0], fare.restriction_code[1]);

      fareColumns.flowId.push(parseInt(line.substr(fare.flow_id[0], fare.flow_id[1]), 10));
      fareColumns.ticket.push(codes.tickets.id(line.substr(fare.ticket_code[0], fare.ticket_code[1])));
      fareColumns.price.push(parseInt(line.substr(fare.fare[0], fare.fare[1]), 10));
      fareColumns.restriction.push(isBlank(restriction) ? 0 : codes.restrictions.id(restriction));
    }
    else if (type === 70) {
      const startDate = rawDate(line, flow.start_date[0]);
      const endDate = rawDate(line, flow.end_date[0]);

      if (valid(startDate, endDate)) {
        flowColumns.flowId.push(parseInt(line.substr(flow.flow_id[0], flow.flow_id[1]), 10));
        flowColumns.origin.push(codes.locations.id(line.substr(flow.origin_code[0], flow.origin_code[1])));
        flowColumns.destination.push(codes.locations.id(line.substr(flow.destination_code[0], flow.destination_code[1])));
        flowColumns.route.push(codes.routes.id(line.substr(flow.route_code[0], flow.route_code[1])));
        flowColumns.usage.push(line.charCodeAt(flow.usage_code[0]));
        flowColumns.direction.push(line.charCodeAt(flow.direction[0]));
        flowColumns.startDate.push(startDate);
        flowColumns.endDate.push(endDate);
      }
    }
  });

  const flows: Flows = {
    length: flowColumns.flowId.length,
    flowId: flowColumns.flowId.toArray(),
    origin: flowColumns.origin.toArray(),
    destination: flowColumns.destination.toArray(),
    route: flowColumns.route.toArray(),
    usage: flowColumns.usage.toArray(),
    direction: flowColumns.direction.toArray(),
    startDate: flowColumns.startDate.toArray(),
    endDate: flowColumns.endDate.toArray()
  };

  const fares: Fares = {
    length: fareColumns.flowId.length,
    flowId: fareColumns.flowId.toArray(),
    ticket: fareColumns.ticket.toArray(),
    price: fareColumns.price.toArray(),
    restriction: fareColumns.restriction.toArray()
  };

  return {flows, fares: onFlows(fares, flows)};
}

/**
 * Drop fares whose flow is not in the given flows, when the flows have been filtered by date
 */
function onFlows(fares: Fares, flows: Flows): Fares {
  let maxId = 0;

  for (let i = 0; i < flows.length; i++) {
    maxId = Math.max(maxId, flows.flowId[i]);
  }
  for (let i = 0; i < fares.length; i++) {
    maxId = Math.max(maxId, fares.flowId[i]);
  }

  const present = new Uint8Array(maxId + 1);

  for (let i = 0; i < flows.length; i++) {
    present[flows.flowId[i]] = 1;
  }

  let length = 0;

  for (let i = 0; i < fares.length; i++) {
    if (present[fares.flowId[i]] === 1) {
      fares.flowId[length] = fares.flowId[i];
      fares.ticket[length] = fares.ticket[i];
      fares.price[length] = fares.price[i];
      fares.restriction[length] = fares.restriction[i];
      length++;
    }
  }

  return length === fares.length ? fares : {
    length,
    flowId: fares.flowId.slice(0, length),
    ticket: fares.ticket.slice(0, length),
    price: fares.price.slice(0, length),
    restriction: fares.restriction.slice(0, length)
  };
}

function positions(record: Record): {[field: string]: [position: number, length: number]} {
  return Object.fromEntries(
    Object.entries(record.fields).map(([name, field]) => [name, [field.position, field.length]])
  );
}

function values(file: FeedFile, line: string): {[field: string]: FieldValue} {
  return file.getRecord(line)!.extractValues(line).values;
}

/**
 * CHAR columns lose their trailing spaces in the database, so they do here too
 */
function text(value: FieldValue): string | null {
  return value === null ? null : String(value).trimEnd();
}

function date(value: FieldValue): DateNumber {
  return value === null ? 0 : dateNumber(value as string);
}

function dateNumber(value: string): DateNumber {
  return parseInt(value.replace(/-/g, ""), 10);
}

/**
 * A DDMMYYYY date in the line as YYYYMMDD
 */
function rawDate(line: string, position: number): DateNumber {
  return parseInt(line.substr(position + 4, 4) + line.substr(position + 2, 2) + line.substr(position, 2), 10);
}

function isBlank(value: string): boolean {
  return value.trim() === "" || value === "**";
}

function nlc(uic: string): string {
  return uic.slice(2, 6);
}
