
import {CLICommand} from "./CLICommand";

export class ShowHelpCommand implements CLICommand {

  public run(argv: string[]): Promise<void> {
    console.log(`
Usage: dtd2mysql [COMMAND] [FILE]
Import a DTD feed into a MySQL, Postgres or SQLite database

  --fares [FILE]             import the fares feed 
  --fares-clean              remove old and irrelevant data
  --timetable [FILE]         import the timetable feed 
  --routeing [FILE]          import the routeing guide data
  --nfm64 [FILE]             import the nfm64 data
  --gtfs [DIR]               convert timetable data to GTFS and output txt files in DIR
  --gtfs-zip [FILE]          convert timetable data to GTFS and output zip
  --gtfs-import [DIR]        import the GTFS files in the DIR to the database
  --download-fares [DIR]     download latest fares refresh from DTD
  --download-timetable [DIR] download latest timetable refresh from DTD
  --download-routeing [DIR]  download latest routeing refresh from DTD
  --nfm64 [DIR]              download nfm64 data
  --get-fares [DIR]          download and process latest fares refresh from DTD
  --get-timetable [DIR]      download and process latest timetable refresh from DTD
  --get-routeing [DIR]       download and process latest routeing refresh from DTD
  --get-nfm64 [DIR]          download and process latest nfm64 file

The --gtfs and --gtfs-zip commands take the following options:

  --range RANGE              how far ahead to build, e.g. "3 months" (defaults to '3 MONTH')
  --today YYYY-MM-DD         the date to build for (defaults to the current date)

The following environment properties are expected to be set:
  
  DATABASE_DIALECT           mysql, postgres or sqlite (defaults to mysql)
  DATABASE_USERNAME          database username (defaults to root)
  DATABASE_PASSWORD          database password (defaults to none)
  DATABASE_NAME              database name, or the file to use for sqlite
  DATABASE_HOSTNAME          database host (defaults to localhost)
  DATABASE_PORT              database port (defaults to the dialect's own)

Postgres needs the pg package installed, and pg-cursor for --gtfs, which
streams. SQLite is built into node and needs neither, nor a server:

  DATABASE_DIALECT=sqlite DATABASE_NAME=./feed.sqlite dtd2mysql --timetable RJTTFxxx.ZIP
  
The --get-* and --download-* commands require SFTP environment properties:

  SFTP_USERNAME              SFTP username
  SFTP_PASSWORD              SFTP password
  SFTP_HOSTNAME              SFTP hostname (defaults to dtd.atocrsp.org)

The --gtfs and --gtfs-zip commands take the following environment properties:

  GTFS_RANGE                 how far ahead to build, e.g. '6 MONTH' (defaults to '3 MONTH'). --range overrides it
  GTFS_TODAY                 the date to build for, YYYY-MM-DD. --today overrides it

`);

    return Promise.resolve();
  }

}
