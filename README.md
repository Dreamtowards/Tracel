# Tracel

A quiet, science-fiction-inspired live website observation surface. This visual MVP uses local simulated visitors only; it does not collect real traffic.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. Run `npm run build` for production.

Production builds export a static site to `out/`. Preview it with a static HTTP server.
To deploy to Cloudflare Pages, run `npx wrangler login` once, then `npm run deploy`.
The deployment targets the `tracel` Pages project and its `main` production branch.

## Explore

- Switch between the default flat map and the 3D globe. The map pans and zooms down to city and street detail; the globe supports orbit and zoom.
- Click a cluster to expand it. A city with multiple visitors opens a visitor picker. Selecting a visitor from either view or the list focuses their city.
- Select a globe visitor, an event, or a visitor in the Visitors tab to inspect location, client, source and full journey. Escape closes the panel.
- Visitor details include visit count, approximate total session time and relative first visit, with the full date on hover. Historical visits are simulated; total time includes idle time.
- Pause/resume or switch between 1×, 5× and 20×. Speed advances simulated time; the header clock shows real local time. Event, journey and chart timestamps use the browser's local timezone.
- Simulation tools provide reset and spawn. Reset restores the initial 12-visitor scene. Hidden tabs suspend simulation and rendering to avoid catch-up bursts.
- Fullscreen supports using the surface on a second display. Narrow screens use an overlay visitor panel.
- Traffic shows 5 or 10 minutes of simulated time. Views counts page loads and navigation per 15-second bucket; Visitors counts unique sessions viewing a page in that same bucket. Hover or focus a bucket for exact values. Legend buttons toggle each series.
- Audience rankings switch between countries, cities, browsers and sources. Counts and percentages refer to current online + idle visitors, not cumulative sessions. Offline visitors are excluded.

## Verify

```sh
npm run typecheck
npm test
npm run build
```

`src/radar/simulation` owns the seeded lifecycle engine and event stream. The UI consumes typed snapshots through `src/radar/store.ts`; it has no dependency on the mock generator. The stream supports event subscriptions for a future real telemetry source.

Visitor markers and pulses use instanced meshes, geographic land uses one point cloud, and camera/animation updates avoid React state per frame. Events, offline visitors and journey history have retention limits. Respecting reduced motion disables auto rotation and arrival pulses, and removes panel/feed transitions. Visitors remain accessible through the HTML visitor list when WebGL is unavailable.

The globe uses Natural Earth public-domain geographic data distributed by `world-atlas`. `node scripts/prepare-geography.mjs` regenerates the bundled point cloud and borders. The flat map uses MapLibre and OpenFreeMap's dark vector basemap with OpenStreetMap/OpenMapTiles attribution. City and street detail requires a network connection; bundled world outlines provide an offline fallback. Visitor telemetry remains entirely local and is never sent to the basemap service.

`predev` and `prebuild` prepare matching MapLibre worker modules in the ignored `public/maplibre/` directory, as required by the Next.js bundler. Traffic records retain ten minutes of history independently of the bounded event feed.

The map toolbar floats over the map. Place names toggles background labels while keeping visitor city labels visible. Simulation controls live in the top-right header. Pages ranks current online and idle visitors by their current pathname.

Visual styling follows `STYLE_GUIDE.md`: IBM Plex Sans Condensed for compact controls, IBM Plex Mono for telemetry, mint for live data, and sparse orange for selection and focus. Functional theme overrides live in `src/styles/industrial.css`.

The default accent is blue. Use the top-right display and simulation menu to switch Blue, Cyan, or Violet; the palette applies to controls, charts, map activity, and globe markers. The choice is saved locally.

Traffic compares page views and unique viewing visitors in the same 15-second buckets. The header separately shows current online + idle sessions. Event selection uses a country-scale camera view instead of city street zoom.
