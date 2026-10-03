# Tracel

A quiet, science-fiction-inspired live website observation surface. This visual MVP uses local simulated visitors only; it does not collect real traffic.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. Production: `npm run build` then `npm start`.

## Explore

- Drag the globe to orbit, scroll or use the buttons to zoom.
- Select a globe visitor, an event, or a visitor in the Visitors tab to inspect location, client, source and full journey. Escape closes the panel.
- Pause/resume or switch between 1×, 5× and 20×. Speed advances simulated time; the header clock shows real UTC.
- Simulation tools provide reset and spawn. Reset restores the initial 12-visitor scene. Hidden tabs suspend simulation and rendering to avoid catch-up bursts.
- Fullscreen supports using the surface on a second display. Narrow screens use an overlay visitor panel.

## Verify

```sh
npm run typecheck
npm test
npm run build
```

`src/radar/simulation` owns the seeded lifecycle engine and event stream. The UI consumes typed snapshots through `src/radar/store.ts`; it has no dependency on the mock generator. The stream supports event subscriptions for a future real telemetry source.

Visitor markers and pulses use instanced meshes, geographic land uses one point cloud, and camera/animation updates avoid React state per frame. Events, offline visitors and journey history have retention limits. Respecting reduced motion disables auto rotation and arrival pulses, and removes panel/feed transitions. Visitors remain accessible through the HTML visitor list when WebGL is unavailable.

The globe uses Natural Earth public-domain geographic data distributed by `world-atlas`. `node scripts/prepare-geography.mjs` regenerates the bundled point cloud and borders. No external assets or APIs are required at runtime.
