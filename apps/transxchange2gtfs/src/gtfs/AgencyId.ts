import {AgencyID} from "@gb-transit/gtfs-schema";
import {Operators, OperatorID} from "../transxchange/TransXChange";

/**
 * The agency an operator is written into the feed as.
 *
 * An `Operator` id means something only inside its own document - `tkt_oid` is
 * the id 167 different operators give themselves - so a national dataset keyed
 * on it collapses them into one agency. The National Operator Code means the
 * same thing everywhere, and the other two are what is left without it.
 */
export function agencyId(operators: Operators | undefined, operator: OperatorID): AgencyID {
  const known = operators?.[operator];

  return known?.NationalOperatorCode || known?.OperatorCode || operator;
}
