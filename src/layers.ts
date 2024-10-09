import { LayerGroup, TileLayer } from 'leaflet';

// Save layers globally in order to use them in options
export const getLayers = (): { [key: string]: TileLayer | LayerGroup } => {
  return {
    OpenStreetMap: new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxNativeZoom: 19,
    }),
    CyclOSM: new TileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
      attribution:
        'Map data: &copy; <a href="/copyright">OpenStreetMap contributors</a>. Tiles style by <a href="https://www.cyclosm.org">CyclOSM</a> hosted by <a href="https://openstreetmap.fr/">OpenStreetMap France</a>',
      maxNativeZoom: 20,
    }),
    OpenTopoMap: new TileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution:
        'Map data: &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
      maxNativeZoom: 17,
    }),
    Satellite: new LayerGroup([
      new TileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        maxNativeZoom: 23,
      }),
      new TileLayer(
        'https://server.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Esri, HERE, Garmin, (c) OpenStreetMap contributors, and the GIS user community',
          maxNativeZoom: 23,
        }
      ),
    ]),
    OpenSeaMap: new LayerGroup([
      new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxNativeZoom: 19,
      }),
      new TileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
        attribution: 'Sea marks from <a href="https://map.openseamap.org">OpenSeaMap</a>',
        maxNativeZoom: 18,
      }),
    ]),
  };
};

export const LAYER_NAMES: string[] = Object.keys(getLayers());
