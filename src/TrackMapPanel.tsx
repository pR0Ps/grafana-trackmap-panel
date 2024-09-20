import React, { useEffect, useId, useRef } from 'react';
import {
  DataHoverClearEvent,
  DataHoverEvent,
  Field,
  LegacyGraphHoverClearEvent,
  LegacyGraphHoverEvent,
  PanelData,
} from '@grafana/data';
import { Subscription } from 'rxjs';
import { CircleMarker, Control, LatLng, Map as LeafMap, LeafletEventHandlerFn, Polyline, TileLayer, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';

import {
  BoxZoomEndEvent,
  InputRows,
  CustomLayerOptions,
  Point,
  TrackMapProps,
  setDashboardTimeRangeFunction,
} from './types';
import { getLayers } from './layers';

function log(...args: any) {
  // uncomment for debugging
  //console.log(...args);
}

const allSame = (arrs: any[]) => arrs.every((arr) => arr === arrs[0]);
const allSameLength = (arrs: any[]) => arrs.every((arr) => arr.length === arrs[0].length);

function transpose(arrs: any[][]) {
  // [[1, 2, 3], [11, 22, 33]] --> [[1, 11], [2, 22], [3, 33]]
  // if arrays are not all the same length, returns null;
  if (!allSameLength(arrs)) {
    return null;
  }
  return arrs[0].map((_, idx) => arrs.map((arr) => arr[idx]));
}

const getFieldIdxsByType = (fields: Field[], type: string) =>
  fields.reduce((r, val, idx) => (val.type === type ? r.concat(idx) : r), [] as number[]);

function getAntimeridianMidpoints(start: LatLng, end: LatLng) {
  // See https://stackoverflow.com/a/65870755/369977
  if (Math.abs(start.lng - end.lng) <= 180.0) {
    return null;
  }
  const start_dist_to_antimeridian = start.lng > 0 ? 180 - start.lng : 180 + start.lng;
  const end_dist_to_antimeridian = end.lng > 0 ? 180 - end.lng : 180 + end.lng;
  const lat_difference = Math.abs(start.lat - end.lat);
  const alpha_angle =
    Math.atan(lat_difference / (start_dist_to_antimeridian + end_dist_to_antimeridian)) *
    (180 / Math.PI) *
    (start.lng > 0 ? 1 : -1);
  const lat_diff_at_antimeridian = Math.tan((alpha_angle * Math.PI) / 180) * start_dist_to_antimeridian;
  const intersection_lat = start.lat + lat_diff_at_antimeridian;

  return [
    new LatLng(intersection_lat, start.lng > 0 ? 180 : -180), // first line end
    new LatLng(intersection_lat, end.lng > 0 ? 180 : -180), //second line start
  ];
}

class TrackMapState {
  leafMap: LeafMap;
  layerChanger: Control.Layers;
  coords: Point[];
  coordSlices: number[];
  polylines: Polyline[];
  hoverMarker: CircleMarker;
  hoverTarget: number | null;
  lineColor: string | undefined;
  autoZoom: boolean;
  setDashboardTimeRange: setDashboardTimeRangeFunction;
  layers: { [key: string]: TileLayer | LayerGroup };

  constructor(containerId: string, setDashboardTimeRange: setDashboardTimeRangeFunction) {
    log('panelInit', containerId);
    this.coords = [];
    this.coordSlices = [];
    this.polylines = [];
    this.lineColor = undefined;
    this.autoZoom = false;
    this.setDashboardTimeRange = setDashboardTimeRange;

    // the hover marker and its target time
    this.hoverMarker = new CircleMarker(new LatLng(0, 0), {
      color: 'white',
      fillOpacity: 1,
      weight: 2,
      radius: 7,
    });
    this.hoverTarget = null;

    this.layers = getLayers();
    // Create the layer changer
    this.layerChanger = new Control.Layers(this.layers);

    // Create the map and set up events
    this.leafMap = new LeafMap(containerId, {
      zoomSnap: 0,
      zoomDelta: 0.5,
      attributionControl: false,
    })
      .addControl(new Control.Scale())
      .addControl(new Control.Attribution({ prefix: false }))
      .on('boxzoomend', this.mapZoomToBox.bind(this) as LeafletEventHandlerFn);

    this.leafMap.setView([0, 0], 1);
  }

  removeLines() {
    log('removeLines');
    // Get map back in a clean state
    if (this.polylines) {
      this.polylines.forEach((p) => p.removeFrom(this.leafMap));
      this.onPanelClearEvent(null);
    }
  }

  onPanelTeardown() {
    log('onPanelTeardown');
    this.leafMap.off();
    this.leafMap.remove();
  }

  onPanelHoverEvent(event: DataHoverEvent | LegacyGraphHoverEvent) {
    log('onPanelHover', event);

    // Remove the hover marker if no coords
    if (this.coords.length === 0 || !event.payload.point.time) {
      this.onPanelClearEvent(null);
      return;
    }

    // timestamps in coords are integers so floor the target so it can possibly match
    const targetTime = Math.floor(event.payload.point.time);

    // check if we are already showing the correct hoverMarker
    if (this.hoverTarget && this.hoverTarget === targetTime) {
      return;
    }

    // check for initial show of the marker
    if (this.hoverTarget == null) {
      this.hoverMarker.addTo(this.leafMap);
    }
    this.hoverTarget = targetTime;

    // Find the currently selected time and move the hoverMarker to it
    // Note that an exact match isn't always going to work due to rounding so
    // we clean that up later
    let min = 0;
    let max = this.coords.length - 1;
    let idx = 0;
    let exact = false;
    while (min <= max) {
      idx = Math.floor((max + min) / 2);
      if (this.coords[idx].timestamp === this.hoverTarget) {
        exact = true;
        break;
      } else if (this.coords[idx].timestamp < this.hoverTarget) {
        min = idx + 1;
      } else {
        max = idx - 1;
      }
    }

    // Correct the case where we are +1 index off
    if (!exact && idx > 0 && this.coords[idx].timestamp > this.hoverTarget) {
      idx--;
    }
    this.hoverMarker.setLatLng(this.coords[idx].position);
  }

  onPanelClearEvent(event: DataHoverClearEvent | LegacyGraphHoverClearEvent | null) {
    log('onPanelClearEvent', event);
    // clear the highlighted circle
    if (this.hoverTarget == null) {
      return;
    }
    this.hoverTarget = null;
    this.hoverMarker.removeFrom(this.leafMap);
  }

  onPanelSizeChanged() {
    log('onPanelSizeChanged');
    this.leafMap.invalidateSize(true);
  }

  /* set options */
  setScrollWheelZoom(scrollZoom: boolean) {
    log('setScrollWheelZoom', scrollZoom);
    if (scrollZoom) {
      this.leafMap.scrollWheelZoom.enable();
    } else {
      this.leafMap.scrollWheelZoom.disable();
    }
  }

  setAutoZoom(autoZoom: boolean) {
    log('setAutoZoom', autoZoom);
    this.autoZoom = autoZoom;
    if (autoZoom) {
      this.zoomToFit();
    }
  }

  setDefaultLayer(layerName: string, customLayer: CustomLayerOptions) {
    log('setDefaultLayer', layerName, customLayer);
    this.removeLines();

    // Remove all layers and add the new one
    this.leafMap.eachLayer((layer) => {
      layer.removeFrom(this.leafMap);
    });
    if (customLayer.enabled) {
      this.leafMap.addLayer(
        new TileLayer(customLayer.template, {
          attribution: customLayer.attribution,
        })
      );
    } else {
      // Use the cloned layers instead of the global LAYERS object
      this.leafMap.addLayer(this.layers[layerName]);
    }

    this.addLinesToMap();
  }

  setShowLayerChanger(show: boolean) {
    // Hide/show the layer switcher
    log('setShowLayerSwitcher', show);
    this.leafMap.removeControl(this.layerChanger);
    if (show) {
      this.leafMap.addControl(this.layerChanger);
    }
  }

  setLineColor(lineColor: string) {
    log('setLineColor', lineColor);
    this.lineColor = lineColor;
    this.polylines.forEach((p) => {
      p.setStyle({
        color: lineColor,
      });
    });
  }

  setPointColor(pointColor: string) {
    log('setPointColor', pointColor);
    this.hoverMarker.setStyle({
      fillColor: pointColor,
    });
  }

  mapZoomToBox(event: BoxZoomEndEvent) {
    log('mapZoomToBox', event);

    // Find time bounds of selected coordinates
    const bounds = this.coords.reduce(
      function (t, c) {
        if (event.boxZoomBounds.contains(c.position)) {
          t.from = Math.min(t.from, c.timestamp);
          t.to = Math.max(t.to, c.timestamp);
        }
        return t;
      },
      { from: Infinity, to: -Infinity }
    );

    // Set the global time range
    if (isFinite(bounds.from) && isFinite(bounds.to)) {
      this.setDashboardTimeRange(bounds);
    }
  }

  // Add the circles and polyline(s) to the map
  addLinesToMap() {
    log('addDataToMap');

    this.polylines.length = 0;
    for (let i = 0; i < this.coordSlices.length - 1; i++) {
      const coordSlice = this.coords.slice(this.coordSlices[i], this.coordSlices[i + 1]);
      this.polylines.push(
        new Polyline(
          coordSlice.map((x) => x.position, this),
          {
            color: this.lineColor,
            weight: 3,
          }
        ).addTo(this.leafMap)
      );
    }
    this.zoomToFit();
  }

  zoomToFit() {
    log('zoomToFit');

    if (this.autoZoom && this.polylines.length > 0) {
      const bounds = this.polylines[0].getBounds();
      this.polylines.forEach((p) => bounds.extend(p.getBounds()));

      if (bounds.isValid()) {
        this.leafMap.fitBounds(bounds);
      } else {
        this.leafMap.setView([0, 0], 1);
      }
    }
  }

  onDataReceived(rows: InputRows) {
    log('onDataReceived', rows);
    this.removeLines();

    // Requried format is [[timestamp, lat, lon], ...]
    if (!rows) {
      // No data, show a world map and abort
      this.leafMap.setView([0, 0], 1);
      return;
    }

    // clear data arrays
    this.coords.length = 0;
    this.coordSlices.length = 0;
    this.coordSlices.push(0);

    let lastCoord: Point | null = null;
    for (const [timestamp, lat, lon] of rows) {
      // Handle filling in missing data with null and 0's
      // Since 0 is valid, only ignore times when *both* are 0 since this almost always indicates null/error
      if (!timestamp || lat == null || lon == null || (lat === 0 && lon === 0)) {
        continue;
      }
      const pos = new LatLng(lat, lon);

      if (lastCoord != null) {
        // Deal with the line between last point and this one crossing the antimeridian:
        // Draw a line from the last point to the antimeridian and another from the anitimeridian
        // to the current point.
        const midpoints = getAntimeridianMidpoints(lastCoord.position, pos);
        if (midpoints != null) {
          // Crossed the antimeridian, add the points to the coords array
          const lastTime = lastCoord.timestamp;
          midpoints.forEach((p) => {
            this.coords.push({
              position: p,
              timestamp: lastTime + (timestamp - lastTime) / 2, // TODO: interpolate based on coordinates
            });
          });
          // Note that we need to start drawing a new line between the added points
          this.coordSlices.push(this.coords.length - 1);
        }
      }

      lastCoord = {
        position: pos,
        timestamp: timestamp,
      };
      this.coords.push(lastCoord);
    }
    this.coordSlices.push(this.coords.length);
    this.addLinesToMap();
  }
}

function parseTableData(data: PanelData): InputRows {
  log('parseTableData');
  // table requries 1 series
  if (data.series.length !== 1) {
    return null;
  }
  const fields = data.series[0].fields;
  const time_idxs = getFieldIdxsByType(fields, 'time');
  const data_idxs = getFieldIdxsByType(fields, 'number');
  if (time_idxs.length !== 1 || data_idxs.length !== 2) {
    return null;
  }

  // get values, transpose into rows
  return transpose([time_idxs[0], data_idxs[0], data_idxs[1]].map((idx) => fields[idx].values)) as InputRows;
}

function parseTimeSeriesData(data: PanelData): InputRows {
  log('parseTimeSeriesData');
  // time series requries 2 series
  if (data.series.length !== 2) {
    return null;
  }

  // ensure the number of times/points are all the same in all fields in all series
  if (!allSame(data.series.map((s) => s.fields.map((f) => f.values.length)).flat())) {
    return null;
  }

  // assume lat/lon order
  const lat_fields = data.series[0].fields;
  const lon_fields = data.series[1].fields;

  // get times/data
  const lat_idx = getFieldIdxsByType(lat_fields, 'number');
  const lat_time_idx = getFieldIdxsByType(lat_fields, 'time');
  const lon_idx = getFieldIdxsByType(lon_fields, 'number');
  const lon_time_idx = getFieldIdxsByType(lon_fields, 'time');
  if (!allSameLength([[undefined], lat_idx, lat_time_idx, lon_idx, lon_time_idx])) {
    return null;
  }

  // get data, transpose into rows
  return (
    transpose([
      lat_fields[lat_time_idx[0]].values,
      lon_fields[lon_time_idx[0]].values,
      lat_fields[lat_idx[0]].values,
      lon_fields[lon_idx[0]].values,
    ])
      // assumption is that the times will match up by index - ensure this
      ?.filter(([lat_time, lon_time, _, __]) => lat_time === lon_time)
      .map(([time, _, lat, lon]) => [time, lat, lon]) || null
  );
}

export const TrackMapPanel: React.FC<TrackMapProps> = ({
  options,
  data,
  width,
  height,
  id,
  eventBus,
  onChangeTimeRange,
}) => {
  /*
  Create a ref to hold the actual leafmap and event processing.
  Because the only updates to the map happen via events (that leaflet handles),
  there's no real need to re-render anything. Events are pumped into it via useEffect.
  */
  const mapState = useRef<TrackMapState | null>(null);

  /*
  Leaflet requires a DOM element (specified via ID) to put the map into.
  To avoid creating duplicate IDs if multiple of this component is rendered at the same time,
  unique per-instance ids are generated via useId.
  */
  const containerId = `trackmap-${id}-${useId()}`;

  // create the actual map - should only be called once per panel
  useEffect(() => {
    mapState.current = new TrackMapState(containerId, onChangeTimeRange);

    // Add events
    const subs = new Subscription();
    subs.add(eventBus.subscribe(DataHoverEvent, mapState.current.onPanelHoverEvent.bind(mapState.current)));
    subs.add(eventBus.subscribe(LegacyGraphHoverEvent, mapState.current.onPanelHoverEvent.bind(mapState.current)));
    subs.add(eventBus.subscribe(DataHoverClearEvent, mapState.current.onPanelClearEvent.bind(mapState.current)));
    subs.add(eventBus.subscribe(LegacyGraphHoverClearEvent, mapState.current.onPanelClearEvent.bind(mapState.current)));

    return () => {
      //unsubscribe from events and clean up map
      subs.unsubscribe();
      mapState.current?.onPanelTeardown();
    };
  }, [containerId, eventBus, onChangeTimeRange]);

  useEffect(() => {
    log('data changed', data);
    let rows: InputRows = null;
    if (!data.series) {
      log('No data received!');
    } else if (data.series.length === 1) {
      rows = parseTableData(data);
    } else if (data.series.length === 2) {
      rows = parseTimeSeriesData(data);
    } else {
      console.error('TrackMap received data in unknown format!', data);
    }
    mapState.current?.onDataReceived(rows);
  }, [data]);

  useEffect(() => {
    mapState.current?.onPanelSizeChanged();
  }, [width, height]);

  /* wire up options triggers (also called on startup to apply the options) */
  useEffect(() => {
    mapState.current?.setAutoZoom(options.autoZoom);
  }, [options.autoZoom]);

  useEffect(() => {
    mapState.current?.setScrollWheelZoom(options.scrollWheelZoom);
  }, [options.scrollWheelZoom]);

  useEffect(() => {
    mapState.current?.setDefaultLayer(options.defaultLayer, options.customLayer);
  }, [options.defaultLayer, options.customLayer]);

  useEffect(() => {
    mapState.current?.setShowLayerChanger(options.showLayerChanger);
  }, [options.showLayerChanger]);

  useEffect(() => {
    mapState.current?.setLineColor(options.lineColor);
  }, [options.lineColor]);

  useEffect(() => {
    mapState.current?.setPointColor(options.pointColor);
  }, [options.pointColor]);

  return <div id={containerId} style={{ width: width, height: height }}></div>;
};
