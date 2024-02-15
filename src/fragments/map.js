import van from "vanjs-core"

import maplibregl from "maplibre-gl";
import * as pmtiles from 'pmtiles';
import mapstyle from './mapstyle.json'
import { getStore, updateBounds } from '../store.js'
const store = getStore()

const { a, div, h3, img, li, nav, p, ul } = van.tags


const mapDiv = div({ id: "map" })


const state = {
    map: null,
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
    if (store.map.isLoading) { return }

    store.map.isLoading = true
    setTimeout(() => {
        let protocol = new pmtiles.Protocol();
        maplibregl.addProtocol("pmtiles", protocol.tile);
        state.map = new maplibregl.Map({
            container: mapDiv,
            style: mapstyle,
            center: [store.position.lng, store.position.lat], // starting position [lng, lat]
            zoom: store.map.zoom // starting zoom
        });
        state.map.on('load', function () {
            store.map.isLoading = false
            state.map.resize();
           let bounds = state.map.getBounds();
           updateBounds(bounds)

        })
        
        state.map.on('zoomend', () => {
            let bounds = state.map.getBounds();
           updateBounds(bounds)
         });

    }, 100);
};


export const Map = () => {
    return mapDiv
}





