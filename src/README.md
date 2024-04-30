TrackMap Panel for Grafana
==========================
[![Marketplace](https://img.shields.io/badge/dynamic/json?logo=grafana&query=$.version&url=https://grafana.com/api/plugins/pr0ps-trackmap-panel&label=Marketplace&prefix=v&color=F47A20)](https://grafana.com/grafana/plugins/pr0ps-trackmap-panel/)
![Required grafana version](https://img.shields.io/badge/dynamic/json?logo=grafana&query=$.grafanaDependency&url=https://grafana.com/api/plugins/pr0ps-trackmap-panel&label=Grafana&color=F47A20)
![Downloads](https://img.shields.io/badge/dynamic/json?logo=grafana&query=$.downloads&url=https://grafana.com/api/plugins/pr0ps-trackmap-panel&label=Downloads)

A panel for [Grafana](https://grafana.com/) that visualizes GPS points as a line on an interactive map.

Features
--------
- Places a dot on the map at the current time as you mouse over other panels.
- Zoom to a range of points by drawing a box by shift-clicking and dragging.
- Multiple map backgrounds: [OpenStreetMap](https://www.openstreetmap.org/),
  [OpenTopoMap](https://opentopomap.org/), and [Satellite imagery](https://www.esri.com/).
- Track and dot colors can be customized in the options tab.

Configuration
-------------
The plugin requires latitude and longitude measurements provided as numbers in two separate fields.
These can be formatted as "Time series" or "Table" data by Grafana. The order of the data returned
by the query is required (latitude, then longitude) since the labels and tag names are not used.

For example, the following query has been tested using InfluxDB as a data source in the case where
the `latitude` and `longitude` series are stored in the `location` measurement:
```
SELECT median("latitude"), median("longitude") FROM "location" WHERE $timeFilter GROUP BY time($__interval)
```

Because the plugin only cares about getting 2 series of data, it's also possible to use
MySQL/MariaDB as a data source by using 2 queries like so:
```
A: SELECT "latitude" as value, $__time(timestamp) FROM "location" WHERE $__timeFilter(timestamp) ORDER BY timestamp ASC
B: SELECT "longitude" as value, $__time(timestamp) FROM "location" WHERE $__timeFilter(timestamp) ORDER BY timestamp ASC
```
