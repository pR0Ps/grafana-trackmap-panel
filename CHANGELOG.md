# Changelog

## 3.0.2
- Fix project metadata (no functional changes)

## 3.0.1
- Fix issues rendering multiple maps (@nsass24)

## 3.0.0
- Rewrite in React
- Add option to provide a custom tile URL template
- Breaking changes:
  - Replaced Eniro Seamap with OpenSeaMap
  - All options will be reset to default

## 2.1.4
- Fix broken license link and update required Grafana version

## 2.1.3
- Add handling of new `DataHoverEvent`
- Add Eniro Seamap
- Fix certain hover events not existing in Grafana 7.x.x

## 2.1.2
- Automate releases with GitHub Actions

## 2.1.1
- Handle display of lines that cross the antimeridian
- Add support for new hover events
- Ignore coordinates of `(0, 0)`

## 2.1.0
- Add option to zoom with mouse wheel
- Add default layer option
- Fix issue with toggling autozoom with an empty map
- Fix issue with zooming to a region with no points in it
- Add option to disable the layer changer
- Fix rendering the panel to a screenshot

## 2.0.4
- Fix issues related to resizing the panel
- Add support for snapshots
- Add basic debug logging

## 2.0.3
- Change project icon

## 2.0.2
- Fix screenshot display in Grafana

## 2.0.1
- Include README in build files

## 2.0.0
- Fix map not expanding when resizing the panel
- Restructure to follow Grafana conventions/requirements
- Update build process

## 1.1.0
- Add option to disable auto-zoom

## 1.0.1
- Relax Grafana version restriction

## 1.0.0
- Initial release
