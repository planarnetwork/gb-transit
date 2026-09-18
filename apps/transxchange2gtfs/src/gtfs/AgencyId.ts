import {AgencyID} from "@gb-transit/gtfs-schema";
import {Operators, OperatorID} from "../transxchange/TransXChange";

/**
 * The agency an operator is written into the feed as.
 *
 * TransXChange names an operator with an id that means something only inside
 * the document it is written in, and a national dataset is twenty thousand
 * documents: `tkt_oid` is the id that 167 different operators give themselves.
 * Keyed on that, all 167 become one agency under whichever trading name arrived
 * first - 4,035 routes and 323,538 trips of a national feed, 29% of it, filed
 * under "London United".
 *
 * The National Operator Code is the one identifier that means the same thing in
 * every document, and all but one of the 20,502 operators in a national dataset
 * carry it. The other two are what is left when it is missing: the operator code
 * from the licence, which is at least stable within an operator's own documents,
 * and then the local id, which is where this came in.
 */
export function agencyId(operators: Operators | undefined, operator: OperatorID): AgencyID {
  const known = operators?.[operator];

  return known?.NationalOperatorCode || known?.OperatorCode || operator;
}
