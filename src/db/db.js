import GUN from "gun";

import "gun/sea.js";
import "gun/lib/open.js";
import "gun/lib/load.js";
import "gun/lib/promise.js";
import "gun/lib/rindexed.js";
import { sha256 } from "js-sha256";
import Geohash from "ngeohash";

import { GunProxy } from "./proxy";

const uuid = () => {
  return self.crypto.randomUUID();
};
const createSecret = () => {
  return (Math.random() + 1).toString(36).substring(7).toUpperCase();
};
const hashSecret = (secret) => {
  return sha256(secret);
};
export const setupDb = async (config, creds) => {
  let db = {
    tables: {
      users: null,
      messages: null,
      articles: null,
      geohashes: null,
    },
    gun: null,
  };

  // instantiate module
  var proxy = new GunProxy();

  // configure websocket
  var WebSocketProxy = proxy.initialize(config);
  console.log("proxy", WebSocketProxy, config);

  // pass websocket as custom websocket to gun instance
  // make sure localStorage / indexedDB is on
  var gun = Gun({ peers: ["proxy:websocket"], WebSocket: WebSocketProxy });

  await new Promise((resolve) =>
    // IMPORTANT FOR DB TO FUNCTION
    setTimeout(() => {
      proxy.attachGun(gun);

      for (const table in db.tables) {
        db.tables[table] = gun.user(creds.serverPublicKey).get(table);
      }

      db.gun = gun;
      db.creds = creds;
      db.config = config;
      resolve();
    }, 100)
  );

  const a = await SEA.pair();

  db.user = gun.user();
  await db.user.auth(a);

  db.user.pub = db.user._.sea.pub;
  db.user.priv = db.user._.sea.priv;
  console.log("auth success", db.user);

  db.createNewItem = async ({ geo, photo, title, description }) => {
    const newItem = {
      photo,
      title,
      description,
      geo,
      id: uuid(),
      date: Date.now(),
      geohash: Geohash.encode(geo.lat, geo.lng, 10),
    };
    console.log("create item with params:", newItem);

    var secret = createSecret();
    newItem.hashedSecret = hashSecret(secret);

    var geohashItem = db.tables.geohashes;
    console.log("geohash create", newItem.geohash);
    for (let i = 0; i < newItem.geohash.length; i++) {
      geohashItem = geohashItem.get(newItem.geohash.charAt(i));
    }

    var item = db.tables.articles
      .get(newItem.id)
      .get(db.user.pub)
      .put(JSON.parse(JSON.stringify(newItem)), null, {
        opt: { cert: db.creds.serverCertificate },
      });
    console.log("geo:", geohashItem);
    geohashItem
      .get(newItem.id)
      .get(db.user.pub)
      .put(item, null, { opt: { cert: db.creds.serverCertificate } });

    return { secret, ...newItem };
  };

  // returns an unsubscribe function you can call
  db.listenForGeoHashes = (geohashPrefix, addItem) => {
    var geohashItem = db.tables.geohashes;
    let ev = null;
    for (let i = 0; i < geohashPrefix.length; i++) {
      geohashItem = geohashItem.get(geohashPrefix.charAt(i));
    }
    console.log("listen to ", geohashPrefix);
    geohashItem.map().open((data, doc, key, opt, eve) => {
      ev = eve;
      console.log("received data", data)
 
      const items = []
      function loopThroughJSON(obj) {
        for (let key in obj) {
          if (typeof obj[key] === 'object') {
            if (Array.isArray(obj[key])) {
              // loop through array
              for (let i = 0; i < obj[key].length; i++) {
                loopThroughJSON(obj[key][i]);
              }
            } else {
              if(!!obj[key].id){
                items.push(obj[key])
              }else{
              // call function recursively for object
              loopThroughJSON(obj[key]);
            }
          }
          } else {
            // do something with value
            console.log(key + ': ' + obj[key]);
          }
        }
      }
      loopThroughJSON(data)
      addItem(items).then("added items");
    });
  
    return () => {
      // geohashItem.off()
      ev ? ev.off() : geohashItem.off();
      console.log("off'ed", geohashPrefix);
    };
  };

  return db;
};
