import L from './leaflet/leaflet.js';
import moment from 'moment';

import appEvents from 'app/core/app_events';
import {MetricsPanelCtrl} from 'app/plugins/sdk';
import TableModel from 'app/core/table_model';

import './leaflet/leaflet.css!';
import './partials/module.css!';

const panelDefaults = {
  maxDataPoints: 500,
  autoZoom: true,
  scrollWheelZoom: false,
  defaultLayer: 'OpenStreetMap',
  lineColor: 'red',
  pointColor: 'royalblue',
}

function log(msg) {
  // uncomment for debugging
  //console.log(msg);
}

export class TrackMapCtrl extends MetricsPanelCtrl {
  constructor($scope, $injector) {
    super($scope, $injector);

    log("constructor");

    _.defaults(this.panel, panelDefaults);

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
    this.leafMap = null;
    this.polyline = null;
    this.hoverMarker = null;
    this.hoverTarget = null;
    this.setSizePromise = null;

    // Panel events
    this.events.on('panel-initialized', this.onInitialized.bind(this));
    this.events.on('view-mode-changed', this.onViewModeChanged.bind(this));
    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
    this.events.on('panel-teardown', this.onPanelTeardown.bind(this));
    this.events.on('panel-size-changed', this.onPanelSizeChanged.bind(this));
    this.events.on('data-received', this.onDataReceived.bind(this));
    this.events.on('data-snapshot-load', this.onDataSnapshotLoad.bind(this));

    // Global events
    appEvents.on('graph-hover', this.onPanelHover.bind(this));
    appEvents.on('graph-hover-clear', this.onPanelClear.bind(this));
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
    if (this.coords.length === 0) {
      return;
    }

    // check if we are already showing the correct hoverMarker
    let target = Math.floor(evt.pos.x);
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

    // Show/hide tooltip and set text
    let tooltip = this.coords[idx].tooltip;
    let validTooltip = !(tooltip == "" || tooltip == undefined || tooltip == null)
    if (validTooltip != this.hoverMarker.isTooltipOpen()){
      this.hoverMarker.toggleTooltip();
    }
    if (validTooltip){
      // TODO: non-hardcoded title
      this.hoverMarker.setTooltipContent("<h1>Altitude</h1><p>" + String(tooltip) + "</p>");
    }
  }

  onPanelClear(evt) {
    log("onPanelClear");
    // clear the highlighted circle
    this.hoverTarget = null;
    if (this.hoverMarker) {
      this.hoverMarker.removeFrom(this.leafMap);
    }
  }

  onViewModeChanged(){
    log("onViewModeChanged");
    // KLUDGE: When the view mode is changed, panel resize events are not
    //         emitted even if the panel was resized. Work around this by telling
    //         the panel it's been resized whenever the view mode changes.
    this.onPanelSizeChanged();
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
    // Only need to re-add layers if the map previously existed
    if (hadMap){
      this.leafMap.eachLayer((layer) => {
        layer.removeFrom(this.leafMap);
      });
      this.layers[this.panel.defaultLayer].addTo(this.leafMap);
    }
    this.addDataToMap();
  }

  setupMap() {
    log("setupMap");
    // Create the map or get it back in a clean state if it already exists
    if (this.leafMap) {
      if (this.polyline) {
        this.polyline.removeFrom(this.leafMap);
      }
      this.onPanelClear();
      return;
    }

    // Create the map
    this.leafMap = L.map('trackmap-' + this.panel.id, {
      scrollWheelZoom: this.panel.scrollWheelZoom,
      zoomSnap: 0.5,
      zoomDelta: 1,
    });

    // Add layers to the control widget
    L.control.layers(this.layers).addTo(this.leafMap);

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

    // Tooltip
    this.hoverMarker.bindTooltip(L.tooltip({
      direction: 'top',
      permanent: true,
      opacity: 1,
    }));

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
  }

  // Add the circles and polyline to the map
  addDataToMap() {
    log("addDataToMap");
    this.polyline = L.polyline(
      this.coords.map(x => x.position, this), {
        color: this.panel.lineColor,
        weight: 3,
      }
    ).addTo(this.leafMap);

    this.zoomToFit();
  }

  zoomToFit(){
    log("zoomToFit");
    if (this.panel.autoZoom && this.polyline){
      this.leafMap.fitBounds(this.polyline.getBounds());
    }
    this.render();
  }

  refreshColors() {
    log("refreshColors");
    if (this.polyline) {
      this.polyline.setStyle({
        color: this.panel.lineColor
      });
    }
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

    log(data);

    // Reset displayed coordinates
    this.coords.length = 0;

    // Check for the simple mode - a lat+lon time series
    if (data.length === 2) {
      let time_series = true;
      for (let i = 0; i < data.length; i++) {
        if (time_series && !data[i].hasOwnProperty('datapoints')){
          time_series = false;
        }
      }
      if (time_series){
        // We have time series data - convert it to table format
        // Assumption is that there are an equal number of properly matched timestamps
        log("Converting data from time series to table");
        let table = new TableModel();
        table.addColumn({ text: 'Time', type: 'time' });
        table.addColumn({ text: 'latitude' });
        table.addColumn({ text: 'longitude' });
        const lats = data[0].datapoints;
        const lons = data[1].datapoints;
        for (let i = 0; i < Math.min(lats.length, lons.length); i++) {
          // Timestamps must be the same
          if (lats[i][1] !== lons[i][1]) {
            continue;
          }
          // timestamp, latitude, longitude
          table.addRow([lats[i][1], lats[i][0], lons[i][0]]);
        }
        // Replace received data with table-ized version
        data = [table];
      }
    }

    for (let i = 0; i < data.length; i++) {
      if (data[i].type != "table"){
        // At this point the data should've been converted to a table
        // If it wasn't, something invalid was given
        console.log("ERROR: Data must be provided in table format or as two time series");
        continue;
      }

      // Allow addressing the row data by column name
      let type_map = {}
      let time_idx = null
      for (let j = 0; j < data[i].columns.length; j++){
        if (data[i].columns[j].type === "time"){
          time_idx = j
        }
        else {
          type_map[data[i].columns[j].text] = j
        }
      }
      log(type_map);

      if (time_idx == null || !(type_map.hasOwnProperty('latitude') && type_map.hasOwnProperty('longitude'))) {
        console.log("ERROR: Table must have the columns 'longitude' and 'latitude' indexed by time");
        continue;
      }

      // Add coords to the map
      for (let j = 0; j < data[i].rows.length; j++){
        // TODO: Handle more value types (tooltips, line color, etc)
        // TODO: Add everything to the coords array. Use settings to define the tooltip contents
        // TODO: Add time bar below the map to enable scrolling and show time?
        const lat = data[i].rows[j][type_map['latitude']]
        const lon = data[i].rows[j][type_map['longitude']]
        const tooltip = data[i].rows[j][type_map['tooltip']] //// remove
        const timestamp = data[i].rows[j][time_idx]
        if (lat === null || lon == null){
          continue;
        }
        let point = {
          position: L.latLng(lat, lon),
          timestamp: timestamp,
        }
        if (tooltip != undefined){
          point.tooltip = tooltip;
        }
        this.coords.push(point);
      }

      log(this.coords)

      // TODO: Handle more than 1 line
      if (i + 1 < data.length){
        console.log("Only a single line is currently supported")
      }
      break;
    }

    if (this.coords.length === 0){
      // No data or incorrect data, show a world map and abort
      this.leafMap.setView([0, 0], 1);
      return;
    }

    this.addDataToMap();
  }

  onDataSnapshotLoad(snapshotData) {
    log("onSnapshotLoad");
    this.onDataReceived(snapshotData);
  }
}

TrackMapCtrl.templateUrl = 'partials/module.html';
