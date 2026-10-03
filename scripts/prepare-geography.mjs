import { readFileSync, writeFileSync } from "node:fs";
import { feature, mesh } from "topojson-client";

const topology = JSON.parse(
  readFileSync("node_modules/world-atlas/countries-110m.json", "utf8"),
);
const landTopology = JSON.parse(
  readFileSync("node_modules/world-atlas/land-110m.json", "utf8"),
);
const land = feature(landTopology, landTopology.objects.land);
const polygons = land.features.flatMap((f) =>
  f.geometry.type === "MultiPolygon"
    ? f.geometry.coordinates
    : [f.geometry.coordinates],
);
const inside = (x, y, ring) => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      result = !result;
  }
  return result;
};
const regions = polygons.map((rings) => ({
  rings,
  minX: Math.min(...rings[0].map((p) => p[0])),
  maxX: Math.max(...rings[0].map((p) => p[0])),
  minY: Math.min(...rings[0].map((p) => p[1])),
  maxY: Math.max(...rings[0].map((p) => p[1])),
}));
const dots = [];
for (let lat = -85; lat < 85; lat += 0.85) {
  const step = 0.85 / Math.cos((lat * Math.PI) / 180);
  for (let lng = -180; lng < 180; lng += step) {
    if (
      regions.some(
        (r) =>
          lng >= r.minX &&
          lng <= r.maxX &&
          lat >= r.minY &&
          lat <= r.maxY &&
          inside(lng, lat, r.rings[0]) &&
          !r.rings.slice(1).some((h) => inside(lng, lat, h)),
      )
    )
      dots.push([+lng.toFixed(3), +lat.toFixed(3)]);
  }
}
const outlines = mesh(topology, topology.objects.countries).coordinates;
const lines = [];
for (const ring of outlines) {
  for (let i = 1; i < ring.length; i++) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) < 180)
      lines.push(
        ring[i - 1].map((n) => +n.toFixed(3)),
        ring[i].map((n) => +n.toFixed(3)),
      );
  }
}
writeFileSync("src/radar/geography.json", JSON.stringify({ dots, lines }));
console.log(
  `Geography: ${dots.length} land points, ${lines.length / 2} border segments. Source: Natural Earth via world-atlas (public domain).`,
);
