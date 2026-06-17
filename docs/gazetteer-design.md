# Handoff: saysheep geohash gazetteer (updated)

## Context
saysheep (sloev.github.io/saysheep) — P2P, offline-capable PWA for giving/receiving free items near you. Needs a **clientside place-name gazetteer**: type a place name → get matching cities → query peers by geohash. Committed to geohash. **No reverse lookup** (never geohash → name).

## Requirements
- **Coverage:** all cities pop > 1000 globally (GeoNames `cities1000`, ~150k).
- **Names:** local name + English only. **Drop all other languages** — biggest size lever.
- **Clientside, offline** (service-worker precache). P2P-friendly: single immutable content-addressed blob.
- **Target:** 1–3 MB brotli.

## Architecture
Map is **name → city_id → geohash**, with **one-to-many** names.

- **Geohash precision 5** (~±2.4 km), city centroid. No 9–12 char hashes.
- **Names:** sorted + **front-coded** string table, **binary-search** in pure JS. Value is a **list of city_ids** (most names single-id; multi-id is the exception).
- **Side arrays** indexed by `city_id`: `geohash5` (store once per city), and `admin1` (small int code) + `country` for display labels in the list.
- **Encoding:** brotli static asset, decompressed into typed arrays in memory.

## Duplicate-name handling (DECIDED)
A name matching multiple cities → **present a list, ordered by proximity** to the user's current geohash. No auto-resolution, no highest-population collapse. User taps the right one.
- Proximity: rank candidates by **geohash distance to user** — cheap via longest-common-prefix on geohash5 strings (no haversine needed, fits offline/clientside).
- Each list row shows name + admin1/country label for clarity.
- Build-time: collapse only genuine dupes (same name AND ~identical geohash5). Distinct places sharing a name stay separate ids.

## Rejected
- **word2vec/embeddings** — exact string→id is lossless; embeddings lossy, bigger, bad at proper nouns. Not needed.
- **WASM `fst`** — smallest for exact + Levenshtein fuzzy, but adds WASM. Skip unless typo-tolerance becomes a requirement.
- **Full multilingual alt-names** — too heavy clientside.
- **Highest-population dedup** — wrong for a location app.

## Open decision (ask user)
- **Typo/fuzzy matching needed?** If yes → reconsider WASM-`fst`. If no → front-coded table is fine.
- **Single world blob vs geohash-bucketed lazy loading?** Single blob simplest (~1–3 MB, precache) — start here. Geohash-prefix chunks scale better and suit P2P (co-located peers share buckets) — optional later.

## Next task
Write the **offline build script**: `cities1000` + `alternateNamesV2` → filter local lang + English → geohash5 per city → name→id-list, front-coded brotli blob + side arrays (geohash5, admin1, country) + a small **pure-JS reader** (binary search returning candidate list, proximity-sorted by geohash LCP, no WASM). Sources: download.geonames.org/export/dump/.

## Data source notes
- `cities1000.zip` — `geonameid`, `name`, `asciiname`, `alternatenames` (messy), lat, lon, population, admin1, country.
- `alternateNamesV2.zip` — language-tagged (`isolanguage`); filter `isolanguage IN ('en', <country primary lang>)` joined on `geonameid` to get clean local+English names.
