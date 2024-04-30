import { PanelProps } from '@grafana/data';
import { LatLng, LatLngBounds, LeafletEvent } from 'leaflet';

export interface TrackMapOptions {
  autoZoom: boolean;
  scrollWheelZoom: boolean;
  defaultLayer: string;
  showLayerChanger: boolean;
  lineColor: string;
  pointColor: string;
}

export interface TrackMapProps extends PanelProps<TrackMapOptions> {}

export interface Point {
  position: LatLng;
  timestamp: number;
}

export interface BoxZoomEndEvent extends LeafletEvent {
  boxZoomBounds: LatLngBounds;
}

export type DataRow = [EpochTimeStamp, number | null, number | null];
export type InputRows = DataRow[] | null;
export type setDashboardTimeRangeFunction = PanelProps['onChangeTimeRange'];
