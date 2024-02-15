import * as vanX from "vanjs-ext";

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
let initializing = false;
const setupStore = () => {
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
      isLoading: false,
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
    searchIsLoading: false,
    gpsLocked: true,

    position: {
      updatedAt: Date.now() - 10000,
      lng: 74,
      lat: 40,
      isLoading: true,
    },
    query: "",
    warnings: [],
  });
  store.hasPosition = vanX.calc(() => !store.position.isLoading);
  store.isLoading = vanX.calc(() =>
    [store.position.isLoading, store.db.isLoading, store.map.isLoading].some(
      (x) => !!x
    )
  );
  addItems(demodata.items).then(() => {
    console.log("done indexing");
  });
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
      timeout: 5000,
      maximumAge: 1,
    }
  );
  setupDb(config, creds).then((inst) => {
    db = inst;
    store.db.isLoading = false;
  });
};

export const getStore = () => {
  if (!store && !initializing) {
    initializing = true;
    setupStore();
  }
  return store;
};
const updatePosition = ({ longitude, latitude }) => {
  store.position = {
    isLoading: false,
    updatedAt: Date.now(),
    lat: latitude,
    lng: longitude,
  };
};

const filterByQuery = () => {
  if (!store.query.length) {
    vanX.replace(store.matchedIds, (l) => Object.keys(store.items));
  } else {
    vanX.replace(store.matchedIds, (l) =>
      search.search(store.query).map((res) => res.id)
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
  store.query = query;
  filterByQuery();
};

export const addItems = async (items) => {
  store.searchIsLoading = true;
  try {
    await search.addAllAsync(items);
    items.map((item) => {
      store.items[item.id] = item;
    });
    filterByQuery();
  } catch (e) {
    console.error(e);
  } finally {
    store.searchIsLoading = false;
  }
};

export const removeItems = async (ids) => {
  store.searchIsLoading = true;
  try {
    search.discardAll(ids);
    filterByQuery();
  } catch (e) {
    console.error(e);
  } finally {
    store.searchIsLoading = false;
  }
};

export const createNewItem = async (params) => {
  db.createNewItem({
    geo: { lng: store.position.lng, lat: store.position.lat },
    ...params,
  });
};

export const addWarning = (warning) => {
  store.warnings.push(warning);
};

export const updateBounds = ({ _sw, _ne }) => {
  store.map.bounds.sw = { ..._sw };
  store.map.bounds.ne = { ..._ne };

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
  console.log("(4890>widthInMeters>=1220)", 4890 > widthInMeters >= 1220);
  console.log("(1220>widthInMeters>=153)", 1220 > widthInMeters >= 153);
  console.log("(153>widthInMeters>=38.2)", 153 > widthInMeters >= 38.2);
  console.log("precision", precision, widthInMeters);

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
    console.log("got geo hashes:", geohashes);
  });
};
