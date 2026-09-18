import {RouteRow, RouteType} from "@gb-transit/gtfs-schema";
import {RowStream} from "./RowStream";
import {ROUTES} from "./TxcFeed";
import {Mode, Operators, Service, TransXChange} from "../transxchange/TransXChange";
import {agencyId} from "./AgencyId";

/**
 * The extended GTFS route type for a coach service.
 *
 * Only TransXChange registers a service as a coach, so it is named here rather
 * than in the shared RouteType, which carries the types more than one producer
 * writes.
 */
const COACH = 200 as RouteType;

/**
 * Extract the routes from the TransXChange objects
 */
export class RoutesStream extends RowStream<TransXChange, RouteRow> {
  public readonly file = ROUTES;

  private routesSeen: Record<string, boolean> = {};
  private routeType: Record<Mode, RouteType> = {
    [Mode.Air]: RouteType.Air,
    [Mode.Bus]: RouteType.Bus,
    [Mode.Coach]: COACH,
    [Mode.Ferry]: RouteType.Ferry,
    [Mode.Rail]: RouteType.Rail,
    [Mode.Train]: RouteType.Rail,
    [Mode.Tram]: RouteType.Tram,
    [Mode.Underground]: RouteType.Subway
  };

  protected transform(data: TransXChange): void {
    for (const service of Object.values(data.Services)) {
      this.addRoute(service, data.Operators);
    }
  }

  private addRoute(service: Service, operators: Operators) {
    const routeId = service.ServiceCode;

    // TransXChange allows multiple lines per service; emit one GTFS route per line.
    for (const lineId in service.Lines) {
      const line = service.Lines[lineId];
      const id = routeId + "|" + lineId;

      if (!this.routesSeen[id]) {
        this.routesSeen[id] = true;

        this.pushRow({
          route_id: id,
          agency_id: agencyId(operators, service.RegisteredOperatorRef),
          route_short_name: line.LineName,
          route_long_name: line.Description || service.Description,
          route_type: this.routeType[service.Mode],
          route_text_color: "",
          route_color: "",
          route_url: "",
          route_desc: service.Description
        });
      }
    }
  }

}
