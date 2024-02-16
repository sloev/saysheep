import van from "vanjs-core";

import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import mapstyle from "./mapstyle.json";

const { a, div, h3, img, li, nav, p, ul } = van.tags;

const mapDiv = div({ id: "map" });


export const setupMap = async (lng, lat, updateBounds) => {
  await new Promise((resolve) => {
    console.log("setupMap", lng, lat);
    // IMPORTANT FOR DB TO FUNCTION
    let protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    const map = new maplibregl.Map({
      container: mapDiv,
      style: mapstyle,
      center: [lng, lat], // starting position [lng, lat]
      zoom: 14, // starting zoom
      maxZoom: 16,
      minZoom: 10,
    });

    map.on("zoomend", () => {
      let bounds = map.getBounds();
      let zoom = map.getZoom();
      updateBounds({ zoom, ...bounds });
    });
    map.on("moveend", () => {
      let bounds = map.getBounds();
      let zoom = map.getZoom();
      updateBounds({ zoom, ...bounds });
    });

    map.on("load", function () {
      map.resize();
      let bounds = map.getBounds();
      let zoom = map.getZoom();
      updateBounds({ zoom, ...bounds });
      resolve({addToMap:(marker)=>marker.addTo(map)});
    });
    
  });
};

export const Map = () => {
  return mapDiv;
};
