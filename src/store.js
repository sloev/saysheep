import * as vanX from "vanjs-ext";

import { setupMap } from "./fragments/map.js";
import config from "./config.json";
import creds from "./creds.client.json";
import { setupDb } from "./db/db.js";
import MiniSearch from "minisearch";
import shape2geohash from "shape2geohash";
import { distance } from "./helpers/geo.js";

import demodata from "./demoData.js";

let store;
let search;
let db;
let isLoading = false;

const setupStore = async () => {
  search = new MiniSearch({
    fields: ["title", "description"], // fields to index for full-text search
    storeFields: ["id"], // fields to return with search results
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
    },
  });

  store = vanX.reactive({
    items: {},
    matchedIds: [],
    db: { isLoading: true, listeners: {} },
    map: {
      isLoading: true,
      bounds: {
        sw: {
          lng: null,
          lat: null,
        },
        ne: {
          lng: null,
          lat: null,
        },
      },
      zoom: 17,
    },
    search: {
      isLoading: false,
      query: "",
    },
    gpsLocked: true,

    position: {
      updatedAt: Date.now() - 10000,
      lng: 74,
      lat: 40,
      isLoading: true,
    },
    warnings: [],
  });
  store.hasPosition = vanX.calc(() => !store.position.isLoading);
  store.isLoading = vanX.calc(() =>
    [store.position.isLoading, store.db.isLoading, store.map.isLoading].some(
      (x) => !!x
    )
  );
  // addItems(demodata.items).then(() => {
  //   console.log("done indexing");
  // });
  
  db = await setupDb(config, creds);
  store.db.isLoading = false;
  store.watchID = navigator.geolocation.watchPosition(
    (pos) => {
      updatePosition(pos.coords);
    },
    (err) => {
      addWarning("Didn't get position!");
      console.warn(
        `An error occurred during position acquiering:(${err.code}): ${err.message}`
      );
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 1,
    }
  );
};

export const getStore = () => {
  if (!store && !isLoading) {
    isLoading = true;
    setupStore().then(() => {
      isLoading = false;
    });
  }
  return store;
};
const updatePosition = ({ longitude, latitude }) => {
  if(store.position.isLoading){
    setupMap(
      longitude,
      latitude,
       updateBounds
    ).then(({addToMap})=>{
      store.map.isLoading = false
    })
  }
  store.position = {
    isLoading: false,
    updatedAt: Date.now(),
    lat: latitude,
    lng: longitude,
  };
};

const filterByQuery = () => {
  if (!store.search.query.length) {
    vanX.replace(store.matchedIds, (l) => Object.keys(store.items));
  } else {
    vanX.replace(store.matchedIds, (l) =>
      search.search(store.search.query).map((res) => res.id)
    );
  }
  console.log("matched ids", store.matchedIds);
  console.log("matched items", store.items);
  // let newMatchedItems = ids.map(id => store.items[id])
  // console.log(store.matchedItems)
  // console.log(newMatchedItems)
  // vanX.replace(store.matchedItems, l => newMatchedItems)
  // console.log(store.matchedItems)
};
export const updateQuery = async (query) => {
  store.search.query = query;
  filterByQuery();
};

export const addItems = async (items) => {
  console.log("adding items:", items)
  store.search.isLoading = true;
  try {
    const itemsToBeAdded=[]
    items.map((item) => {
      if(!store.items[item.id]){
      store.items[item.id] = item;
      itemsToBeAdded.push(item)
      }
    });
    await search.addAllAsync(itemsToBeAdded);

    filterByQuery();
  } catch (e) {
    console.error(e);
  }
  store.search.isLoading = false;
};

export const removeItems = async (ids) => {
  store.search.isLoading = true;
  try {
    search.discardAll(ids);
    filterByQuery();
  } catch (e) {
    console.error(e);
  }
  store.search.isLoading = false;
};

export const createNewItem = async (params) => {
  params = {
    geo: { lng: store.position.lng, lat: store.position.lat },
    ...params,
  }
  console.log("create_new_item", params)
  return await db.createNewItem(params);
};

export const addWarning = (warning) => {
  store.warnings.push(warning);
};

export const updateBounds = ({ _sw, _ne, zoom }) => {
  store.map.bounds.sw = { ..._sw };
  store.map.bounds.ne = { ..._ne };
  store.map.zoom = zoom
  console.log(zoom)

  const widthInMeters = Math.floor(
    distance(
      store.map.bounds.sw.lat,
      store.map.bounds.sw.lng,
      store.map.bounds.sw.lat,
      store.map.bounds.ne.lng
    )
  );
  let precision = 1;
  if (widthInMeters > 156000) {
    precision = 2;
  } else if (widthInMeters > 39100) {
    precision = 3;
  } else if (widthInMeters > 4890) {
    precision = 4;
  } else if (widthInMeters > 1220) {
    precision = 5;
  } else if (widthInMeters > 153) {
    precision = 6;
  } else if (widthInMeters > 38) {
    precision = 7;
  } else {
    precision = 8;
  }
  
  // Providing polygon as GeoJSON
  shape2geohash(
    {
      type: "Polygon",
      coordinates: [
        [
          [store.map.bounds.sw.lng, store.map.bounds.sw.lat],
          [store.map.bounds.ne.lng, store.map.bounds.sw.lat],
          [store.map.bounds.ne.lng, store.map.bounds.ne.lat],
          [store.map.bounds.sw.lng, store.map.bounds.ne.lat],
          [store.map.bounds.sw.lng, store.map.bounds.sw.lat],
        ],
      ],
    },
    {
      precision: precision,
      hashMode: "intersect",
      minIntersect: 0,
      allowDuplicates: true,
      customWriter: null,
    }
  ).then((geohashes) => {
    const newListeners = {};
    geohashes.map((geohash) => {
      let listener = store.db.listeners[geohash];
      if (!!listener) {
        delete store.db.listeners[geohash];
      } else {
        listener = db.listenForGeoHashes(geohash, addItems);
      }
      newListeners[geohash] = listener;
    });

    Object.keys(store.db.listeners).map((k) => {
      store.db.listeners[k]();
      delete store.db.listeners[k];
    });
    store.db.listeners = newListeners;
    console.log("listeners", Object.keys(store.db.listeners));
  });
};
