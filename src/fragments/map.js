import van from "vanjs-core"

import maplibregl from "maplibre-gl";
import * as pmtiles from 'pmtiles';
import mapstyle from './mapstyle.json'
import { getStore } from '../store.js'
const store = getStore()

const { a, div, h3, img, li, nav, p, ul } = van.tags


const mapDiv = div({ id: "map" })


const map = {
    map: null,
    zoomLevel: 16,
    // wolfMarker: new L.Marker(settingsStore.currentLocation, { icon: wolfMarkerIcon })
}



// const panToPosition = () => {
//     map.wolfMarker.setLatLng(settingsStore.currentLocation);
//     map.setView(settingsStore.viewPosition, map.getZoom(), {
//         animate: true,
//         pan: {
//             duration: 1,
//         },
//     });
// };


export const setupMap = () => {
    if (store.mapIsLoading) { return }

    store.mapIsLoading = true
    setTimeout(() => {
        let protocol = new pmtiles.Protocol();
        maplibregl.addProtocol("pmtiles", protocol.tile);
        map.map = new maplibregl.Map({
            container: mapDiv,
            style: mapstyle,
            center: [store.currentPosition.lng, store.currentPosition.lat], // starting position [lng, lat]
            zoom: 9 // starting zoom
        });
        map.map.on('load', function () {
            store.mapIsLoading = false
            map.map.resize()
        })
    }, 100);
};


export const Map = () => {
    if (!map.map) {
        setupMap()
    }
    console.log(map.map)
    return mapDiv
    
}





