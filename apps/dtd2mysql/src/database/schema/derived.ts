import {char, table} from "../Schema";

/**
 * Tables worked out from a feed rather than imported from one.
 *
 * No import creates these. network_flow_restriction is built by --fares-clean out of the fares it has
 * just cleaned, and is declared here so that it is described the same way as everything else rather than
 * as a CREATE TABLE inside the command.
 */
export const network_flow_restriction = table({
  origin: char(4),
  destination: char(4),
  route_code: char(5),
  direction: char(1),
  restriction_code: char(2),
});

export default {
  network_flow_restriction
};
