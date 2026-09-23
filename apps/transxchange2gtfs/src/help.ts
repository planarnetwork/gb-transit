export function showHelp(): void {
  console.log(`
transxchange2gtfs - convert TransXChange data to GTFS

Usage:
  transxchange2gtfs [options] <input.xml|input.zip>... <output>

  Every argument but the last is a TransXChange file, or a zip of them. A zip
  containing zips is read too, which is the shape a BODS download arrives in.
  The last argument is where the feed goes: a .zip, or a directory.

Options:
  --naptan <file>    Read NaPTAN stop data from this CSV instead of downloading
                     it. The national file is around 100MB.
  --update-stops     Re-download NaPTAN even if the cached copy is current.
  --from <date>      The first day the feed describes, as YYYY-MM-DD. Defaults
                     to today.
  --to <date>        The last day, as YYYY-MM-DD. Defaults to a year after
                     --from. A registration's own dates run from whenever it
                     began to as far out as 2099, and neither says anything
                     about what the feed can be trusted for, so journeys that
                     run on no day in this range are left out and the calendars
                     of the rest are clipped to it.
  --feed-version <v> What feed_info.txt calls this build. Defaults to the date
                     it was made.
  --skip-stop-areas  Do not group a pair of stops either side of a street under
                     a station of their own, nor a metro, tram or ferry
                     platform under the station NaPTAN numbers it after.
  --supersede-by-line
                     Where two services of one operator and line overlap, run
                     only the one that starts latest on the days they share.
                     For TfL's Journey Planner Timetables, which publish each
                     engineering works timetable as a separate service on top
                     of the base one. Not for BODS: an operator can run two
                     unrelated services under one line name.
  --skip-stops       Use no NaPTAN data and download nothing. stops.txt and
                     transfers.txt are still written, from what the
                     TransXChange documents say - which for a feed using
                     AnnotatedStopPointRef is a name and no coordinate.
  --help             This.

Environment:
  AGENCY_URL, AGENCY_TIMEZONE, AGENCY_LANG   Written into agency.txt, which
                     TransXChange gives no values for.
`);
}
