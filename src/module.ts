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
    })
    .addNestedOptions({
      path: 'customLayer',
      category: ['Custom tile layer'],
      build(subbuilder) {
        subbuilder
          .addBooleanSwitch({
            path: 'enabled',
            name: 'Custom layer',
            description: 'Use a custom tile layer? This will disable all other layers',
            defaultValue: false,
          })
          .addTextInput({
            path: 'template',
            name: 'URL template',
            description: 'Must include {x}, {y} or {-y}, and {z} placeholders',
            defaultValue: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          })
          .addTextInput({
            name: 'attribution',
            path: 'attribution',
            description: 'Attribution text for the tiles',
            defaultValue: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          });
      },
    });
});
