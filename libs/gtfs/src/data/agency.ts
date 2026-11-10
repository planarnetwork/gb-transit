
import {Agency, AgencyID} from "@gb-transit/gtfs-schema";

export const agencies: Agency[] = [
{ agency_id: "AW", agency_name: "Transport for Wales",        agency_url: "https://tfw.wales/",                      agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0333 321 1202",  agency_fare_url: null },
{ agency_id: "CC", agency_name: "c2c",                        agency_url: "https://www.c2c-online.co.uk/",           agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 744 4422",  agency_fare_url: null },
{ agency_id: "CH", agency_name: "Chiltern Railways",          agency_url: "https://www.chilternrailways.co.uk/",     agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 600 5165",  agency_fare_url: null },
{ agency_id: "XC", agency_name: "CrossCountry",               agency_url: "https://www.crosscountrytrains.co.uk/",   agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0344 736 9123",  agency_fare_url: null },
{ agency_id: "GR", agency_name: "LNER",                       agency_url: "https://www.lner.co.uk/",                 agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 722 5333",  agency_fare_url: null },
{ agency_id: "EM", agency_name: "EMR",                        agency_url: "https://www.eastmidlandsrailway.co.uk/",  agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 712 5678",  agency_fare_url: null },
{ agency_id: "GW", agency_name: "GWR",                        agency_url: "https://www.gwr.com/",                    agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 700 0125",  agency_fare_url: null },
{ agency_id: "HT", agency_name: "Hull Trains",                agency_url: "https://www.hulltrains.co.uk/",           agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 071 0222",  agency_fare_url: null },
{ agency_id: "TP", agency_name: "TransPennine Express",       agency_url: "https://www.tpexpress.co.uk/",            agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 600 1671",  agency_fare_url: null },
{ agency_id: "GX", agency_name: "Gatwick Express",            agency_url: "https://www.gatwickexpress.com/",         agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 850 1530",  agency_fare_url: null },
{ agency_id: "GC", agency_name: "Grand Central",              agency_url: "https://www.grandcentralrail.co.uk/",     agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 603 4852",  agency_fare_url: null },
{ agency_id: "GN", agency_name: "Great Northern",             agency_url: "https://www.greatnorthernrail.com/",      agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 026 4700",  agency_fare_url: null },
{ agency_id: "LE", agency_name: "Greater Anglia",             agency_url: "https://www.greateranglia.co.uk/",        agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 600 7245",  agency_fare_url: null },
{ agency_id: "HX", agency_name: "Heathrow Express",           agency_url: "https://www.heathrowexpress.com/",        agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 600 1515",  agency_fare_url: null },
{ agency_id: "IL", agency_name: "Island Line",                agency_url: "https://www.southwesternrailway.com/",    agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 600 0650",  agency_fare_url: null },
{ agency_id: "LD", agency_name: "Lumo (East Coast)",          agency_url: "https://www.lumo.co.uk/",                 agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 528 0409",  agency_fare_url: null },
{ agency_id: "LF", agency_name: "Lumo (West Coast)",          agency_url: "https://www.lumo.co.uk/",                 agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 528 0409",  agency_fare_url: null },
{ agency_id: "LM", agency_name: "West Midlands Trains",      agency_url: "https://www.wmtrains.co.uk/",             agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0333 311 0039",  agency_fare_url: null },
{ agency_id: "LO", agency_name: "London Overground",          agency_url: "https://tfl.gov.uk/modes/london-overground/", agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0343 222 1234",  agency_fare_url: null },
{ agency_id: "LS", agency_name: "Locomotive Services",        agency_url: "https://lsltoc.co.uk/",                   agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "01225 866205",   agency_fare_url: null },
{ agency_id: "LT", agency_name: "London Underground",         agency_url: "https://tfl.gov.uk/modes/tube/",          agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0343 222 1234",  agency_fare_url: null },
{ agency_id: "ME", agency_name: "Merseyrail",                 agency_url: "https://www.merseyrail.org/",             agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0151 555 1111",  agency_fare_url: null },
{ agency_id: "NT", agency_name: "Northern",                   agency_url: "https://www.northernrailway.co.uk/",      agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0800 200 6060",  agency_fare_url: null },
{ agency_id: "SR", agency_name: "ScotRail",                   agency_url: "https://www.scotrail.co.uk/",             agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0344 811 0141",   agency_fare_url: null },
{ agency_id: "SW", agency_name: "South Western Railway",      agency_url: "https://www.southwesternrailway.com/",    agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 600 0650",  agency_fare_url: null },
{ agency_id: "SE", agency_name: "Southeastern",               agency_url: "https://www.southeasternrailway.co.uk/",  agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 322 7021",  agency_fare_url: null },
{ agency_id: "SN", agency_name: "Southern",                   agency_url: "https://www.southernrailway.com/",        agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 127 2920", agency_fare_url: null },
{ agency_id: "TL", agency_name: "Thameslink",                 agency_url: "https://www.thameslinkrailway.com/",      agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 026 4700",  agency_fare_url: null },
{ agency_id: "VT", agency_name: "Avanti West Coast",          agency_url: "https://www.avantiwestcoast.co.uk/",      agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 528 0253",  agency_fare_url: null },
{ agency_id: "TW", agency_name: "Nexus (Tyne & Wear Metro)",  agency_url: "https://www.nexus.org.uk/metro",          agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0191 20 20 747", agency_fare_url: null },
{ agency_id: "CS", agency_name: "Caledonian Sleeper",         agency_url: "https://www.sleeper.scot/",               agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0330 060 0500",  agency_fare_url: null },
{ agency_id: "XR", agency_name: "Elizabeth line",             agency_url: "https://tfl.gov.uk/modes/elizabeth-line/", agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0343 222 1234", agency_fare_url: null },
{ agency_id: "QC", agency_name: "Caledonian MacBrayne",       agency_url: "https://www.calmac.co.uk/en-gb#/",        agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0800 066 5000",  agency_fare_url: null },
{ agency_id: "QE", agency_name: "Transdev",                   agency_url: "https://www.transdevbus.co.uk/",          agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "01422 553 576",  agency_fare_url: null },
{ agency_id: "QF", agency_name: "Thames Travel",              agency_url: "https://www.oxfordbus.co.uk/",            agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "01865 785 400",  agency_fare_url: null },
{ agency_id: "QH", agency_name: "Hovertravel",                agency_url: "https://www.hovertravel.co.uk/",          agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0198 371 7717",  agency_fare_url: null },
{ agency_id: "QR", agency_name: "Red Funnel",                 agency_url: "https://www.redfunnel.co.uk/",            agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "023 8001 9192",  agency_fare_url: null },
{ agency_id: "QS", agency_name: "Stena Line",                 agency_url: "https://www.stenaline.co.uk/",            agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0344 770 7070",  agency_fare_url: null },
{ agency_id: "QU", agency_name: "First Bus",                  agency_url: "https://www.firstbus.co.uk/",             agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 646 0707",  agency_fare_url: null },
{ agency_id: "QV", agency_name: "Arriva Bus",                 agency_url: "https://www.arrivabus.co.uk/",            agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0344 800 4411",  agency_fare_url: null },
{ agency_id: "ZZ", agency_name: "Other operator",             agency_url: "https://www.nationalrail.co.uk/",         agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 748 4950",  agency_fare_url: null },
];

/**
 * The agencies by their ATOC code.
 *
 * Every schedule asks whether its operator is one of these and what it is
 * called, so the lookup is built once rather than walked per schedule.
 */
export const agencyIndex: ReadonlyMap<AgencyID, Agency> = new Map(
  agencies.map(agency => [agency.agency_id, agency])
);
