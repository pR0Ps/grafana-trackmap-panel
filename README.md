TrackMap Panel for Grafana
==========================
A panel for [Grafana](https://grafana.com/) that visualizes GPS points as a line on an interactive map.

Features
--------
- Places a dot on the map at the current time as you mouse over other panels.
- Zoom to a range of points by drawing a box by shift-clicking and dragging.
- Multiple map backgrounds: [OpenStreetMap](https://www.openstreetmap.org/),
  [OpenTopoMap](https://opentopomap.org/), and [Satellite imagery](https://www.esri.com/).
- Track and dot colors can be customized in the options tab.
- Add a GeoJson overlay from a file or via a textarea.
- Download or delete an overlay.  
- Check the GeoJson properties by clicking on the overlay.

Screenshots
-----------
![Show current selection as a dot on the map](src/img/topo-crosshair.jpg)
![Zoom in by selecting a range of points](src/img/topo-boxselect.jpg)
![Chose what map to display the data on](src/img/satellite-picker.jpg)
![GeoJson overlay](src/img/GeoJsonOverlay-popup.png)

Installation
------------
To use the latest version of this plugin, clone it into Grafana's plugin directory (you can find
this path in Grafana's logs when it starts up) and run `git checkout releases`. You should now be
able to select the "TrackMap" panel when adding a new panel to a Grafana dashboard. To use an
earlier version use git to checkout an earlier commit on the `releases` branch.

To use an unreleased version of the plugin or do development, you will need to manually build it
from source.

To build, [install npm](https://www.npmjs.com/get-npm), check out the master branch (or the commit
you want to build) and run the following commands in the plugin's directory:
```
npm install
npm run build
```

This will build the currently checked out source into the `dist` folder for Grafana to use.


Configuration
-------------
The plugin requires latitude and longitude measurements provided as floats in two separate fields
formatted by Grafana as a "Time series".

The following setup has been tested using InfluxDB as a data source in the case where `latitude` and
`longitude` are stored in the `location` table. You will have customize the query for your setup
accordingly.
```
SELECT median("latitude"), median("longitude") FROM "location" WHERE $timeFilter GROUP BY time($interval)
```

It's also possible to use MySQL/MariaDB as a data source by using 2 queries along the lines of:
```
A: SELECT "latitude" as value, $__time(timestamp) FROM "location" WHERE $__timeFilter(timestamp) ORDER BY timestamp ASC
B: SELECT "longitude" as value, $__time(timestamp) FROM "location" WHERE $__timeFilter(timestamp) ORDER BY timestamp ASC
```
