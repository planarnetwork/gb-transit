export async function showHelp(argv: string[]): Promise<void> {
  console.log(`
Usage: cif2gtfs build [OPTIONS]
Build a GTFS feed from the DTD timetable feed, with no database

  --source PATH              a DTD timetable zip, or a directory of them. A
                             directory contributes every RJTTxxxx.ZIP it holds,
                             in sequence order, from the most recent full
                             refresh onwards. Repeat it to combine sources
  --out PATH                 where to write. A path ending .zip produces a zip,
                             anything else a directory of text files
                             (defaults to ./gtfs.zip)
  --range RANGE              how far ahead to build, e.g. "3 months"
                             (defaults to '3 MONTH')
  --today YYYY-MM-DD         the date to build for (defaults to the current date)
  --config PATH              read the build from a YAML file. Any flag given as
                             well takes precedence, so a config is a starting
                             point rather than a commitment
  --links                    also write links.txt, this project's own file of
                             fixed links. transfers.txt holds the same links;
                             links.txt is kept for one release
  --remove-passing-points BOOL
                             whether to drop the locations a service runs
                             through without stopping (defaults to true).
                             Pass false to keep them, as calls with
                             pickup_type and drop_off_type 1 and timepoint 0,
                             timed between the published calls either side.
                             It is roughly a third more stop times
  --duplicate-overnight-associations
                             also publish an associated schedule that runs the
                             day after its base on the base's own service day,
                             at times past 24:00. For journey planners that
                             cannot follow a coupling across a service day; it
                             leaves the same train in the feed twice

For example:

  cif2gtfs build --source RJTTF918.ZIP --out gtfs.zip --range "6 months"
  cif2gtfs build --source ./feeds --out gtfs.zip
  cif2gtfs build --config gtfs.config.yaml

A config file looks like this. Only source is required:

  source:
    - ./feeds/RJTTF918.ZIP
  out: gtfs.zip
  today: 2026-08-10
  range: 3 months
  licence: permissive        # or full, which allows share-alike sources
  links: false
  removePassingPoints: true  # false keeps the locations a service passes through
  duplicateOvernightAssociations: false   # true publishes an overnight portion twice
  exclude:                     # config only - these are lists, not switches
    modes: [metro, bus, ship]  # replacement buses are their own mode and stay
    operators: [ES, LT, TW, ZZ]     # every service these operators run
    replacementBuses: [LO, XR]      # only their buses; their trains stay
    links: [TUBE]                   # fixed links of these modes stay out of transfers.txt
  enrichers:
    NAPTAN:                  # on, with its own defaults
    KNOWLEDGEBASE:
      priority: 80           # outrank another source for a contested field
      apply: [wheelchair_boarding]   # and only take this from it
      options:
        cache: ./cache

The same GTFS_RANGE and GTFS_TODAY environment variables dtd2mysql reads are
honoured, and --range and --today override them. GTFS_REMOVE_PASSING_POINTS
does the same for --remove-passing-points.
`);
}
