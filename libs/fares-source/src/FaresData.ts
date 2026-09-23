import {CodeTable} from "./Columns";

/**
 * Dates are numbers in the form YYYYMMDD so they compare numerically
 */
export type DateNumber = number;

export interface Location {
  readonly uic: string;
  readonly nlc: string | null;
  readonly crs: string | null;
  readonly description: string;
  readonly fareGroup: string | null;
  readonly zoneNo: string | null;
  readonly zoneInd: string | null;
  readonly startDate: DateNumber;
  readonly endDate: DateNumber;
  readonly quoteDate: DateNumber;
}

export interface LocationGroupMember {
  readonly uic: string;
  readonly nlc: string;
  readonly crs: string | null;
}

/**
 * A group station such as LONDON TERMINALS (UIC 7010720, NLC 1072) and the stations in it for one date range
 */
export interface LocationGroup {
  readonly uic: string;
  readonly nlc: string;
  readonly description: string;
  readonly startDate: DateNumber;
  readonly endDate: DateNumber;
  readonly quoteDate: DateNumber;
  readonly members: LocationGroupMember[];
}

/**
 * Membership of a station cluster: flows to or from `clusterId` apply to `nlc`
 */
export interface StationCluster {
  readonly clusterId: string;
  readonly nlc: string;
  readonly startDate: DateNumber;
  readonly endDate: DateNumber;
}

export interface TicketType {
  readonly code: string;
  readonly description: string;
  readonly startDate: DateNumber;
  readonly endDate: DateNumber;
  readonly quoteDate: DateNumber;
  /** 1 first, 2 standard, 9 undefined */
  readonly ticketClass: number;
  /** S single, R return, N season */
  readonly ticketType: string;
  readonly ticketGroup: string;
  readonly maxPassengers: number;
  readonly minPassengers: number;
  readonly maxAdults: number;
  readonly minAdults: number;
  readonly maxChildren: number;
  readonly minChildren: number;
  readonly restrictedByDate: boolean;
  readonly restrictedByTrain: boolean;
  readonly restrictedByArea: boolean;
  readonly validityCode: string;
  readonly discountCategory: number;
}

export interface NonDerivableFare {
  readonly origin: string;
  readonly destination: string;
  readonly route: string | null;
  /** empty when the fare is not for a railcard */
  readonly railcard: string;
  readonly ticket: string;
  readonly recordType: string;
  readonly startDate: DateNumber;
  readonly endDate: DateNumber;
  readonly quoteDate: DateNumber;
  readonly suppress: boolean;
  readonly adultFare: number | null;
  readonly childFare: number | null;
  readonly restriction: string | null;
  readonly compositeIndicator: string | null;
}

/**
 * Flow records by column. Origin and destination are IDs in `codes.locations` and may be NLCs or cluster IDs,
 * route is an ID in `codes.routes`.
 */
export interface Flows {
  readonly length: number;
  readonly flowId: Int32Array;
  readonly origin: Uint32Array;
  readonly destination: Uint32Array;
  readonly route: Uint32Array;
  /** character code of the usage code, A or G */
  readonly usage: Uint8Array;
  /** character code of the direction, R for reversible or S for single direction */
  readonly direction: Uint8Array;
  readonly startDate: Uint32Array;
  readonly endDate: Uint32Array;
}

/**
 * Fare records by column, the adult price in pence of a ticket type on a flow. Ticket is an ID in `codes.tickets`,
 * restriction an ID in `codes.restrictions` where 0 is no restriction.
 */
export interface Fares {
  readonly length: number;
  readonly flowId: Int32Array;
  readonly ticket: Uint16Array;
  readonly price: Uint32Array;
  readonly restriction: Uint16Array;
}

export interface FaresCodes {
  readonly locations: CodeTable;
  readonly routes: CodeTable;
  readonly tickets: CodeTable;
  readonly restrictions: CodeTable;
}

export interface FaresData {
  readonly locations: Location[];
  readonly locationGroups: LocationGroup[];
  readonly stationClusters: StationCluster[];
  readonly ticketTypes: TicketType[];
  readonly nonDerivableFares: NonDerivableFare[];
  readonly flows: Flows;
  readonly fares: Fares;
  readonly codes: FaresCodes;
}

export const NO_RESTRICTION = 0;
