---
"@gb-transit/dtd-source": patch
---

`CifFileSource.getTransfers` takes each station's minimum change time from the TIPLOC `getStops`
chooses for it - the station rather than a subsidiary junction sharing its CRS - rather than from
whichever rated TIPLOC the file lists first, and leaves out TIPLOCs with no CRS. A feed built from
the files and one built from the database now agree on transfers.txt.
