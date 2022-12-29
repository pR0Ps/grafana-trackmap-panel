import L from './leaflet/leaflet.js';
import moment from 'moment';

import { DataHoverClearEvent, DataHoverEvent, LegacyGraphHoverClearEvent, LegacyGraphHoverEvent } from '@grafana/data';
import {MetricsPanelCtrl} from 'app/plugins/sdk';

import './leaflet/leaflet.css!';
import './partials/module.css!';


function log(msg) {
  // uncomment for debugging
  //console.log(msg);
}

function getAntimeridianMidpoints(start, end) {
  // See https://stackoverflow.com/a/65870755/369977
  if (Math.abs(start.lng - end.lng) <= 180.0){
    return null;
  }
  const start_dist_to_antimeridian = start.lng > 0 ? 180 - start.lng : 180 + start.lng;
  const end_dist_to_antimeridian = end.lng > 0 ? 180 - end.lng : 180 + end.lng;
  const lat_difference = Math.abs(start.lat - end.lat);
  const alpha_angle = Math.atan(lat_difference / (start_dist_to_antimeridian + end_dist_to_antimeridian)) * (180 / Math.PI) * (start.lng > 0 ? 1 : -1);
  const lat_diff_at_antimeridian = Math.tan(alpha_angle * Math.PI / 180) * start_dist_to_antimeridian;
  const intersection_lat = start.lat + lat_diff_at_antimeridian;
  const first_line_end = [intersection_lat, start.lng > 0 ? 180 : -180];
  const second_line_start = [intersection_lat, end.lng > 0 ? 180 : -180];

  return [L.latLng(first_line_end), L.latLng(second_line_start)];
}

export class TrackMapCtrl extends MetricsPanelCtrl {
  constructor($scope, $injector) {
    super($scope, $injector);

    log("constructor");

    _.defaults(this.panel, {
      maxDataPoints: 500,
      autoZoom: true,
      scrollWheelZoom: false,
      defaultLayer: 'OpenStreetMap',
      showLayerChanger: true,
      lineColor: 'red',
      pointColor: 'royalblue',
    });

    // Save layers globally in order to use them in options
    this.layers = {
      'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
      }),
      'OpenTopoMap': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        maxZoom: 17
      }),
      'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Imagery &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        // This map doesn't have labels so we force a label-only layer on top of it
        forcedOverlay: L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.png', {
          attribution: 'Labels by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          subdomains: 'abcd',
          maxZoom: 20,
        })
      })
    };

    this.timeSrv = $injector.get('timeSrv');
    this.coords = [];
    this.coordSlices = [];
    this.leafMap = null;
    this.layerChanger = null;
    this.polylines = [];
    this.hoverMarker = null;
    this.hoverTarget = null;
    this.setSizePromise = null;

    // Panel events
    this.events.on('panel-initialized', this.onInitialized.bind(this));
    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
    this.events.on('panel-teardown', this.onPanelTeardown.bind(this));
    this.events.on('data-received', this.onDataReceived.bind(this));
    this.events.on('data-snapshot-load', this.onDataSnapshotLoad.bind(this));
    this.events.on('render', this.onRender.bind(this));
    this.events.on('refresh', this.onRefresh.bind(this));

    // Global events
    this.dashboard.events.on(LegacyGraphHoverEvent.type, this.onPanelHover.bind(this), $scope);
    this.dashboard.events.on(LegacyGraphHoverClearEvent.type, this.onPanelClear.bind(this), $scope);

    this.dashboard.events.on(DataHoverEvent.type, this.onPanelHover.bind(this), $scope);
    this.dashboard.events.on(DataHoverClearEvent.type, this.onPanelClear.bind(this), $scope);
  }

  onRefresh(){
    log("onRefresh")
    this.onPanelSizeChanged();
  }

  onRender(){
    log("onRender")

    // No specific event for panel size changing anymore
    // Render is called when the size changes so just call it here
    this.onPanelSizeChanged();

    // Wait until there is at least one GridLayer with fully loaded
    // tiles before calling renderingCompleted
    if (this.leafMap) {
      this.leafMap.eachLayer((l) => {
        if (l instanceof L.GridLayer){
          if (l.isLoading()) {
            l.once('load', this.renderingCompleted.bind(this));
          }
          else {
            this.renderingCompleted();
          }
        }
      });
    }
  }

  onInitialized(){
    log("onInitialized");
    this.render();
  }

  onInitEditMode() {
    log("onInitEditMode");
    this.addEditorTab('Options', 'public/plugins/pr0ps-trackmap-panel/partials/options.html', 2);
  }

  onPanelTeardown() {
    log("onPanelTeardown");
    this.$timeout.cancel(this.setSizePromise);
  }

  onPanelHover(evt) {
    log("onPanelHover");

    let target = 0;
    // Check if event has position (Legacy Hover event) or point (Data Hover event)
    if (evt.hasOwnProperty('pos')) {
      if (evt.pos?.x == null) {
        return;
      }
      target = Math.floor(evt.pos.x);
    } else {
      if (evt.point?.time == null) {
        return
      }
      target = Math.floor(evt.point.time);
    }

    if (this.coords.length === 0) {
      return;
    }

    // check if we are already showing the correct hoverMarker
    if (this.hoverTarget && this.hoverTarget === target) {
      return;
    }

    // check for initial show of the marker
    if (this.hoverTarget == null){
      this.hoverMarker.addTo(this.leafMap);
    }

    this.hoverTarget = target;

    // Find the currently selected time and move the hoverMarker to it
    // Note that an exact match isn't always going to work due to rounding so
    // we clean that up later (still more efficient)
    let min = 0;
    let max = this.coords.length - 1;
    let idx = null;
    let exact = false;
    while (min <= max) {
      idx = Math.floor((max + min) / 2);
      if (this.coords[idx].timestamp === this.hoverTarget) {
        exact = true;
        break;
      }
      else if (this.coords[idx].timestamp < this.hoverTarget) {
        min = idx + 1;
      }
      else {
        max = idx - 1;
      }
    }

    // Correct the case where we are +1 index off
    if (!exact && idx > 0 && this.coords[idx].timestamp > this.hoverTarget) {
      idx--;
    }
    this.hoverMarker.setLatLng(this.coords[idx].position);
    this.render();
  }

  onPanelClear(evt) {
    log("onPanelClear");
    // clear the highlighted circle
    this.hoverTarget = null;
    if (this.hoverMarker) {
      this.hoverMarker.removeFrom(this.leafMap);
    }
  }

  onPanelSizeChanged() {
    log("onPanelSizeChanged");
    // KLUDGE: This event is fired too soon - we need to delay doing the actual
    //         size invalidation until after the panel has actually been resized.
    this.$timeout.cancel(this.setSizePromise);
    let map = this.leafMap;
    this.setSizePromise = this.$timeout(function(){
      if (map) {
        log("Invalidating map size");
        map.invalidateSize(true);
      }}, 500
    );
  }

  applyScrollZoom() {
    let enabled = this.leafMap.scrollWheelZoom.enabled();
    if (enabled != this.panel.scrollWheelZoom){
      if (enabled){
        this.leafMap.scrollWheelZoom.disable();
      }
      else{
        this.leafMap.scrollWheelZoom.enable();
      }
    }
  }

  applyDefaultLayer() {
    let hadMap = Boolean(this.leafMap);
    this.setupMap();
    if (hadMap){
      // Re-add the default layer
      this.leafMap.eachLayer((layer) => {
        layer.removeFrom(this.leafMap);
      });
      this.layers[this.panel.defaultLayer].addTo(this.leafMap);

      // Hide/show the layer switcher
      this.leafMap.removeControl(this.layerChanger)
      if (this.panel.showLayerChanger){
        this.leafMap.addControl(this.layerChanger);
      }
    }
    this.addDataToMap();
  }

  setupMap() {
    log("setupMap");
    // Create the map or get it back in a clean state if it already exists
    if (this.leafMap) {
      this.polylines.forEach(p=>p.removeFrom(this.leafMap));
      this.onPanelClear();
      return;
    }

    // Create the map
    this.leafMap = L.map('trackmap-' + this.panel.id, {
      scrollWheelZoom: this.panel.scrollWheelZoom,
      zoomSnap: 0.5,
      zoomDelta: 1,
    });

    // Create the layer changer
    this.layerChanger = L.control.layers(this.layers)

    // Add layers to the control widget
    if (this.panel.showLayerChanger){
      this.leafMap.addControl(this.layerChanger);
    }

    // Add default layer to map
    this.layers[this.panel.defaultLayer].addTo(this.leafMap);

    // Hover marker
    this.hoverMarker = L.circleMarker(L.latLng(0, 0), {
      color: 'white',
      fillColor: this.panel.pointColor,
      fillOpacity: 1,
      weight: 2,
      radius: 7
    });

    // Events
    this.leafMap.on('baselayerchange', this.mapBaseLayerChange.bind(this));
    this.leafMap.on('boxzoomend', this.mapZoomToBox.bind(this));
  }

  mapBaseLayerChange(e) {
    // If a tileLayer has a 'forcedOverlay' attribute, always enable/disable it
    // along with the layer
    if (this.leafMap.forcedOverlay) {
      this.leafMap.forcedOverlay.removeFrom(this.leafMap);
      this.leafMap.forcedOverlay = null;
    }
    let overlay = e.layer.options.forcedOverlay;
    if (overlay) {
      overlay.addTo(this.leafMap);
      overlay.setZIndex(e.layer.options.zIndex + 1);
      this.leafMap.forcedOverlay = overlay;
    }
  }

  mapZoomToBox(e) {
    log("mapZoomToBox");
    // Find time bounds of selected coordinates
    const bounds = this.coords.reduce(
      function(t, c) {
        if (e.boxZoomBounds.contains(c.position)) {
          t.from = Math.min(t.from, c.timestamp);
          t.to = Math.max(t.to, c.timestamp);
        }
        return t;
      },
      {from: Infinity, to: -Infinity}
    );

    // Set the global time range
    if (isFinite(bounds.from) && isFinite(bounds.to)) {
      // KLUDGE: Create moment objects here to avoid a TypeError that
      //         occurs when Grafana processes normal numbers
      this.timeSrv.setTime({
        from: moment.utc(bounds.from),
        to: moment.utc(bounds.to)
      });
    }
    this.render();
  }

  // Add the circles and polyline(s) to the map
  addDataToMap() {
    log("addDataToMap");

    this.polylines.length = 0;
    for (let i = 0; i < this.coordSlices.length - 1; i++) {
      const coordSlice = this.coords.slice(this.coordSlices[i], this.coordSlices[i+1])
      this.polylines.push(
        L.polyline(
          coordSlice.map(x => x.position, this), {
            color: this.panel.lineColor,
            weight: 3,
          }
        ).addTo(this.leafMap)
      );
    }
    this.zoomToFit();
  }

  zoomToFit(){
    log("zoomToFit");
    if (this.panel.autoZoom && this.polylines.length>0){
      var bounds = this.polylines[0].getBounds();
      this.polylines.forEach(p => bounds.extend(p.getBounds()));

      if (bounds.isValid()){
        this.leafMap.fitBounds(bounds);
      }
      else {
        this.leafMap.setView([0, 0], 1);
      }
    }
    this.render();
  }

  refreshColors() {
    log("refreshColors");
    this.polylines.forEach(p => {
      p.setStyle({
        color: this.panel.lineColor
      })
    });
    if (this.hoverMarker){
      this.hoverMarker.setStyle({
        fillColor: this.panel.pointColor,
      });
    }
    this.render();
  }

  onDataReceived(data) {
    log("onDataReceived");
    this.setupMap();

    if (data.length === 0 || data.length !== 2) {
      // No data or incorrect data, show a world map and abort
      this.leafMap.setView([0, 0], 1);
      this.render();
      return;
    }

    // Asumption is that there are an equal number of properly matched timestamps
    // TODO: proper joining by timestamp?
    this.coords.length = 0;
    this.coordSlices.length = 0;
    this.coordSlices.push(0)
    const lats = data[0].datapoints;
    const lons = data[1].datapoints;
    for (let i = 0; i < lats.length; i++) {
      if (lats[i][0] == null || lons[i][0] == null ||
          (lats[i][0] == 0 && lons[i][0] == 0) ||
          lats[i][1] !== lons[i][1]) {
        continue;
      }
      const pos = L.latLng(lats[i][0], lons[i][0])

      if (this.coords.length > 0){
        // Deal with the line between last point and this one crossing the antimeridian:
        // Draw a line from the last point to the antimeridian and another from the anitimeridian
        // to the current point.
        const midpoints = getAntimeridianMidpoints(this.coords[this.coords.length-1].position, pos);
        if (midpoints != null){
          // Crossed the antimeridian, add the points to the coords array
          const lastTime = this.coords[this.coords.length-1].timestamp
          midpoints.forEach(p => {
            this.coords.push({
              position: p,
              timestamp: lastTime + ((lats[i][1] - lastTime)/2)
            })
          });
          // Note that we need to start drawing a new line between the added points
          this.coordSlices.push(this.coords.length - 1)
        }
      }

      this.coords.push({
        position: pos,
        timestamp: lats[i][1]
      });

    }
    this.coordSlices.push(this.coords.length)
    this.addDataToMap();
  }

  onDataSnapshotLoad(snapshotData) {
    log("onSnapshotLoad");
    this.onDataReceived(snapshotData);
  }
}

TrackMapCtrl.templateUrl = 'partials/module.html';
