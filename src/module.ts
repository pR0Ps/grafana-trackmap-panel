import { PanelPlugin } from '@grafana/data';
import { TrackMapOptions } from './types';
import { TrackMapPanel } from './TrackMapPanel';
import { LAYERS } from './layers';

export const plugin = new PanelPlugin<TrackMapOptions>(TrackMapPanel).setPanelOptions((builder) => {
  return builder
    .addBooleanSwitch({
      path: 'autoZoom',
      name: 'Auto-zoom map',
      description: 'Automatically zoom the map to fit the data?',
      defaultValue: true,
    })
    .addBooleanSwitch({
      path: 'scrollWheelZoom',
      name: 'Zoom with scroll wheel',
      description: 'Note that this can make it harder to navigate the dashboard',
      defaultValue: false,
    })
    .addRadio({
      path: 'defaultLayer',
      name: 'Default map style',
      description: 'The map style to use by default',
      defaultValue: 'OpenStreetMap',
      settings: {
        options: Object.keys(LAYERS).map((k) => ({ value: k, label: k })),
      },
    })
    .addBooleanSwitch({
      path: 'showLayerChanger',
      name: 'Show layer changer',
      description: 'Allow viewers to change the map style?',
      defaultValue: true,
    })
    .addColorPicker({
      path: 'lineColor',
      name: 'Line color',
      description: 'The color to use to render the line',
      category: ['Colors'],
      defaultValue: 'red',
    })
    .addColorPicker({
      path: 'pointColor',
      name: 'Point color',
      description: 'The color to use to render the individual points',
      category: ['Colors'],
      defaultValue: 'royalblue',
    });
});
