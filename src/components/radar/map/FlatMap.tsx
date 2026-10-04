"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import countries from "@/radar/countries.json";
import geography from "@/radar/geography.json";
import { themePalettes } from "@/radar/theme";
import { useRadarStore } from "@/radar/store";
import type { Visitor } from "@/radar/types";

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
const WORLD: [[number, number], [number, number]] = [
  [-170, -55],
  [175, 73],
];

function outlineStyle(): StyleSpecification {
  const segments = [];
  for (let i = 0; i < geography.lines.length; i += 2)
    segments.push([geography.lines[i], geography.lines[i + 1]]);
  return {
    version: 8,
    sources: {
      outlines: {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "MultiLineString", coordinates: segments },
        },
        attribution: "Natural Earth",
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#0c1418" },
      },
      {
        id: "outlines",
        type: "line",
        source: "outlines",
        paint: {
          "line-color": "#415c5e",
          "line-width": 0.7,
          "line-opacity": 0.65,
        },
      },
    ],
  };
}

function cityGroups(visitors: Record<string, Visitor>, selectedId?: string) {
  const groups = new Map<string, Visitor[]>();
  for (const visitor of Object.values(visitors)) {
    if (visitor.status === "offline") continue;
    const key = `${visitor.location.countryCode}:${visitor.location.city}`;
    groups.set(key, [...(groups.get(key) ?? []), visitor]);
  }
  const activity = geographicActivity();
  const data: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [...activity.cities].map(([key, item]) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [item.location.longitude, item.location.latitude],
      },
      properties: {
        key,
        city: item.location.city,
        count: item.visitors,
        views: item.views,
        selected: (groups.get(key) ?? []).some(
          (visitor) => visitor.id === selectedId,
        ),
        online: (groups.get(key) ?? []).some(
          (visitor) => visitor.status === "online",
        ),
      },
    })),
  };
  return { data, groups };
}

// Approximate city activity areas, not administrative boundaries.
function cityActivity(
  visitors: Record<string, Visitor>,
  selectedId?: string,
): GeoJSON.FeatureCollection {
  const { data } = cityGroups(visitors, selectedId);
  return {
    type: "FeatureCollection",
    features: data.features.map((feature) => {
      const [longitude, latitude] = feature.geometry.coordinates;
      const radiusKm = 12;
      const ring = Array.from({ length: 65 }, (_, i) => {
        const angle = (i / 64) * Math.PI * 2;
        return [
          longitude +
            (Math.cos(angle) * radiusKm) /
              (111.32 * Math.cos((latitude * Math.PI) / 180)),
          latitude + (Math.sin(angle) * radiusKm) / 110.57,
        ];
      });
      return {
        type: "Feature",
        properties: feature.properties,
        geometry: { type: "Polygon", coordinates: [ring] },
      };
    }),
  };
}

// ISO numeric IDs used by the bundled Natural Earth country polygons.
const countryIds: Record<string, string> = {
  JP: "392",
  SG: "702",
  CN: "156",
  HK: "344",
  KR: "410",
  US: "840",
  CA: "124",
  GB: "826",
  FR: "250",
  DE: "276",
  NL: "528",
  AU: "036",
  IN: "356",
  AE: "784",
  BR: "076",
  ZA: "710",
  SE: "752",
  TW: "158",
};
function geographicActivity() {
  const state = useRadarStore.getState();
  const cities = new Map<
    string,
    { location: Visitor["location"]; views: number; visitors: number }
  >();
  const touch = (location: Visitor["location"]) => {
    const key = location.countryCode + ":" + location.city;
    if (!cities.has(key)) cities.set(key, { location, views: 0, visitors: 0 });
    return cities.get(key)!;
  };
  for (const visitor of Object.values(state.visitors))
    if (visitor.status !== "offline") touch(visitor.location).visitors++;
  for (const record of state.trafficRecords)
    if (
      record.location &&
      record.timestamp >= state.now - 600000 &&
      record.timestamp <= state.now &&
      (record.type === "page_view" || record.type === "navigation")
    )
      touch(record.location).views++;
  const regions = new Map<string, { views: number; visitors: number }>();
  for (const city of cities.values()) {
    const id = countryIds[city.location.countryCode];
    if (!id) continue;
    const value = regions.get(id) ?? { views: 0, visitors: 0 };
    value.views += city.views;
    value.visitors += city.visitors;
    regions.set(id, value);
  }
  return { cities, regions };
}
function countryActivity(_visitors: Record<string, Visitor>) {
  const { regions } = geographicActivity();
  return {
    type: "FeatureCollection" as const,
    features: countries.features
      .filter((feature) => String(feature.id) !== "010")
      .map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          ...(regions.get(String(feature.id)) ?? { views: 0, visitors: 0 }),
        },
      })),
  };
}
function heatColor(max: number): maplibregl.ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["get", "views"],
    0,
    "#25292c",
    1,
    "#346b55",
    Math.max(2, max),
    "#9af0ca",
  ];
}

const mapColorRoles: Record<string, keyof (typeof themePalettes)["blue"]> = {
  "#e86d32": "selected",
  "#79d8bd": "live",
  "#85dcbc": "live",
  "#346b55": "heat",
  "#9af0ca": "bright",
  "#62b797": "live",
  "#79988b": "dim",
  "#9cdbc2": "live",
  "#a5cbb8": "info",
  "#a5f0cc": "bright",
  "#b5f7d6": "bright",
  "#c5eee0": "bright",
  "#c6ffe2": "bright",
  "#edfff5": "bright",
  "#f2fff9": "bright",
};
function themePaint(value: unknown): any {
  if (Array.isArray(value)) return value.map(themePaint);
  if (typeof value === "string" && mapColorRoles[value])
    return themePalettes[useRadarStore.getState().themeColor][
      mapColorRoles[value]
    ];
  return value;
}

export default function FlatMap({
  reducedMotion,
  showPlaceNames,
  resetKey,
  zoom,
}: {
  reducedMotion: boolean;
  showPlaceNames: boolean;
  resetKey: number;
  zoom: number;
}) {
  const themeColor = useRadarStore((state) => state.themeColor);
  const palette = themePalettes[themeColor];
  const basePaints = useRef(new Map<string, Record<string, unknown>>());
  const applyTheme = useCallback(() => {
    const current = map.current;
    if (!current) return;
    for (const [id, paint] of basePaints.current)
      if (current.getLayer(id))
        for (const [property, value] of Object.entries(paint))
          current.setPaintProperty(
            id,
            property as Parameters<MapLibreMap["setPaintProperty"]>[1],
            themePaint(value),
          );
  }, []);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const [status, setStatus] = useState<
    "loading" | "detailed" | "offline" | "unavailable"
  >("loading");
  const records = useRadarStore((state) => state.trafficRecords);
  const visitorState = useRadarStore((state) => state.visitors);
  const now = useRadarStore((state) => state.now);
  const distribution = useMemo(() => {
    const stats = geographicActivity();
    return {
      countries: countries.features.map(
        (feature) => stats.regions.get(String(feature.id))?.views ?? 0,
      ),
      cities: [...stats.cities.values()].map((city) => city.views),
    };
  }, [records, visitorState, now]);
  const [hover, setHover] = useState<{
    name: string;
    views: number;
    visitors: number;
    x: number;
    y: number;
  } | null>(null);
  const [mapZoom, setMapZoom] = useState(1);
  const placeNames = useRef(showPlaceNames);
  placeNames.current = showPlaceNames;
  const motion = useRef(reducedMotion);
  motion.current = reducedMotion;
  const loadDetails = useRef<(() => void) | null>(null);
  const selectedId = useRadarStore((state) => state.selectedVisitor?.id);
  const previousReset = useRef(resetKey);

  const updateData = useCallback(() => {
    const current = map.current;
    const source = current?.getSource("visitors") as GeoJSONSource | undefined;
    if (source) {
      const state = useRadarStore.getState();
      (
        current?.getSource("country-activity") as GeoJSONSource | undefined
      )?.setData(countryActivity(state.visitors) as GeoJSON.FeatureCollection);
      (
        current?.getSource("city-activity") as GeoJSONSource | undefined
      )?.setData(cityActivity(state.visitors, state.selectedVisitor?.id));
      (current?.getSource("city-glow") as GeoJSONSource | undefined)?.setData(
        cityGroups(state.visitors, state.selectedVisitor?.id).data,
      );
      if (current?.getLayer("country-activity-fill"))
        current.setPaintProperty(
          "country-activity-fill",
          "fill-color",
          themePaint(
            heatColor(
              Math.max(
                1,
                ...[...geographicActivity().regions.values()].map(
                  (region) => region.views,
                ),
              ),
            ),
          ),
        );
      const activeCities = cityGroups(
        state.visitors,
        state.selectedVisitor?.id,
      ).data;
      activeCities.features = activeCities.features.filter(
        (feature) => Number(feature.properties?.count) > 0,
      );
      source.setData(activeCities);
    }
  }, []);

  useEffect(() => {
    if (!container.current) return;
    let current: MapLibreMap;
    try {
      current = new maplibregl.Map({
        container: container.current,
        style: outlineStyle(),
        center: [15, 20],
        zoom: 1.1,
        minZoom: 0.6,
        maxZoom: 19,
        renderWorldCopies: false,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch {
      setStatus("unavailable");
      return;
    }
    map.current = current;
    current.touchZoomRotate.disableRotation();
    const attribution = new maplibregl.AttributionControl({ compact: true });
    current.addControl(attribution, "bottom-right");
    const attributionElement = current
      .getContainer()
      .querySelector<HTMLDetailsElement>(".maplibregl-ctrl-attrib");
    const collapseAttribution = new MutationObserver(() => {
      if (
        attributionElement &&
        !attributionElement.classList.contains("maplibregl-attrib-empty") &&
        attributionElement.classList.contains("maplibregl-compact")
      ) {
        attributionElement.open = false;
        attributionElement.classList.remove("maplibregl-compact-show");
        collapseAttribution.disconnect();
      }
    });
    if (attributionElement)
      collapseAttribution.observe(attributionElement, {
        attributes: true,
        attributeFilter: ["class", "open"],
      });

    current.addControl(
      new maplibregl.ScaleControl({ maxWidth: 90, unit: "metric" }),
      "bottom-left",
    );
    let alive = true;
    let pending: AbortController | null = null;
    let remote = false;
    let failures = 0;
    const fitWorld = () => {
      current.fitBounds(WORLD, {
        padding: { top: 20, bottom: 42, left: 25, right: 25 },
        duration: 0,
      });
      setMapZoom(current.getZoom());
    };
    fitWorld();
    const addVisitorLayers = () => {
      if (current.getSource("visitors")) return;
      const state = useRadarStore.getState();
      current.addSource("country-activity", {
        type: "geojson",
        data: countryActivity(state.visitors) as GeoJSON.FeatureCollection,
      });
      current.addLayer(
        {
          id: "country-activity-fill",
          type: "fill",
          source: "country-activity",
          maxzoom: 7,
          paint: {
            "fill-color": heatColor(
              Math.max(
                1,
                ...[...geographicActivity().regions.values()].map(
                  (region) => region.views,
                ),
              ),
            ),
            "fill-opacity": ["case", [">", ["get", "views"], 0], 0.24, 0],
            "fill-antialias": false,
          },
        },
        current.getStyle().layers.find((layer) => layer.type === "symbol")?.id,
      );
      current.addSource("city-activity", {
        type: "geojson",
        data: cityActivity(state.visitors, state.selectedVisitor?.id),
      });
      current.addLayer(
        {
          id: "city-activity-fill",
          type: "fill",
          source: "city-activity",
          minzoom: 5,
          paint: {
            "fill-color": ["case", ["get", "selected"], "#e86d32", "#79d8bd"],
            "fill-opacity": [
              "case",
              ["get", "selected"],
              0.28,
              [
                "interpolate",
                ["linear"],
                ["get", "views"],
                0,
                0,
                1,
                0.24,
                5,
                0.25,
                15,
                0.4,
              ],
            ],
          },
        },
        current.getStyle().layers.find((layer) => layer.type === "symbol")?.id,
      );
      current.addSource("city-glow", {
        type: "geojson",
        data: cityGroups(state.visitors, state.selectedVisitor?.id).data,
      });
      current.addLayer({
        id: "city-activity-glow",
        type: "circle",
        source: "city-glow",
        paint: {
          "circle-color": ["case", ["get", "selected"], "#e86d32", "#79d8bd"],
          "circle-blur": 0.9,
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["get", "views"],
            0,
            0,
            1,
            0.18,
            5,
            0.2,
            15,
            0.28,
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            1,
            18,
            5,
            26,
            15,
            36,
          ],
        },
      });
      const activeCities = cityGroups(
        state.visitors,
        state.selectedVisitor?.id,
      ).data;
      activeCities.features = activeCities.features.filter(
        (feature) => Number(feature.properties?.count) > 0,
      );
      current.addSource("visitors", {
        type: "geojson",
        data: activeCities,
        cluster: true,
        clusterRadius: 28,
        clusterMaxZoom: 8,
        clusterProperties: { visitors: ["+", ["get", "count"]] },
      });
      current.addLayer({
        id: "visitor-clusters",
        type: "circle",
        source: "visitors",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "visitors"],
            2,
            "#62b797",
            8,
            "#a5f0cc",
            20,
            "#c5eee0",
          ],
          "circle-opacity": 0.84,
          "circle-stroke-width": 0,
          "circle-radius": ["step", ["get", "visitors"], 12, 5, 15, 15, 19],
        },
      });
      current.addLayer({
        id: "visitor-halo",
        type: "circle",
        source: "visitors",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#85dcbc",
          "circle-opacity": [
            "case",
            ["get", "selected"],
            0.3,
            [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              0.12,
              5,
              0.28,
              15,
              0.45,
            ],
          ],
          "circle-blur": 0.5,
          "circle-radius": [
            "case",
            ["get", "selected"],
            24,
            ["interpolate", ["linear"], ["get", "count"], 1, 16, 5, 28, 15, 42],
          ],
        },
      });
      current.addLayer({
        id: "visitor-cities",
        type: "circle",
        source: "visitors",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "case",
            ["get", "selected"],
            "#e86d32",
            ["get", "online"],
            [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              "#85dcbc",
              5,
              "#b5f7d6",
              15,
              "#edfff5",
            ],
            "#79988b",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            1,
            5,
            5,
            9,
            15,
            14,
          ],
          "circle-stroke-width": 0,
        },
      });
      if (current.getStyle().glyphs) {
        current.addLayer({
          id: "visitor-cluster-count",
          type: "symbol",
          source: "visitors",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["to-string", ["get", "visitors"]],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#09271b" },
        });
        current.addLayer({
          id: "visitor-city-label",
          type: "symbol",
          source: "visitors",
          filter: [
            "all",
            ["!", ["has", "point_count"]],
            ["any", ["get", "selected"], [">=", ["get", "count"], 3]],
          ],
          layout: {
            "text-field": ["get", "city"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-offset": [0, 1.6],
            "text-anchor": "top",
          },
          paint: {
            "text-color": [
              "case",
              ["get", "selected"],
              "#e86d32",
              [
                "interpolate",
                ["linear"],
                ["get", "count"],
                1,
                "#9cdbc2",
                5,
                "#c6ffe2",
                15,
                "#f2fff9",
              ],
            ],
            "text-halo-color": "#0a1514",
            "text-halo-width": 1.5,
          },
        });
      }
    };
    current.on("style.load", () => {
      for (const layer of current.getStyle().layers) {
        if (
          layer.type === "symbol" &&
          layer.source !== "visitors" &&
          layer.layout?.["text-field"]
        )
          current.setLayoutProperty(
            layer.id,
            "visibility",
            placeNames.current ? "visible" : "none",
          );
      }
      addVisitorLayers();
      basePaints.current.clear();
      for (const layer of current.getStyle().layers)
        if (
          "source" in layer &&
          [
            "country-activity",
            "city-activity",
            "city-glow",
            "visitors",
          ].includes(String(layer.source))
        )
          basePaints.current.set(layer.id, { ...layer.paint });
      applyTheme();
    });
    current.on("zoomend", () => setMapZoom(current.getZoom()));
    current.on("mousemove", (event) => {
      const layers = [
        "city-activity-fill",
        "city-activity-glow",
        "country-activity-fill",
      ].filter((id) => current.getLayer(id));
      const features = current.queryRenderedFeatures(event.point, { layers });
      const feature =
        features.find((feature) => feature.layer.id.startsWith("city-")) ??
        features[0];
      if (!feature) {
        setHover(null);
        return;
      }
      const props = feature.properties;
      setHover({
        name: String(props.city ?? props.name),
        views: Number(props.views ?? 0),
        visitors: Number(props.visitors ?? props.count ?? 0),
        x: Math.max(
          8,
          Math.min(
            current.getContainer().clientWidth - 192,
            event.point.x + 16,
          ),
        ),
        y: Math.max(
          8,
          Math.min(
            current.getContainer().clientHeight - 120,
            event.point.y + 16,
          ),
        ),
      });
    });
    current.getCanvas().addEventListener("mouseleave", () => setHover(null));
    current.on("click", "visitor-clusters", async (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      try {
        const source = current.getSource("visitors") as GeoJSONSource;
        const targetZoom = await source.getClusterExpansionZoom(
          Number(feature.properties.cluster_id),
        );
        if (alive)
          current.easeTo({
            center: feature.geometry.coordinates as [number, number],
            zoom: targetZoom + 0.3,
            duration: motion.current ? 0 : 600,
          });
      } catch {
        /* Source may be replaced while detailed style loads. */
      }
    });
    current.on("click", "visitor-cities", (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const state = useRadarStore.getState();
      const members =
        cityGroups(state.visitors).groups.get(String(feature.properties.key)) ??
        [];
      popup.current?.remove();
      if (members.length === 1) {
        state.select(members[0]);
        return;
      }
      if (!members.length) return;
      const content = document.createElement("div");
      content.className = "map-visitor-picker";
      const heading = document.createElement("strong");
      heading.textContent = `${members[0].location.city} · ${members.length} visitors`;
      content.append(heading);
      members.forEach((visitor) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${visitor.id.slice(0, 6)} · ${visitor.client.browser} · ${visitor.currentPage.pathname}`;
        button.addEventListener("click", () => {
          useRadarStore
            .getState()
            .select(useRadarStore.getState().visitors[visitor.id] ?? visitor);
          popup.current?.remove();
        });
        content.append(button);
      });
      popup.current = new maplibregl.Popup({
        closeButton: true,
        maxWidth: "290px",
        offset: 12,
      })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setDOMContent(content)
        .addTo(current);
      (content.querySelector("button") as HTMLButtonElement | null)?.focus();
    });
    for (const layer of ["visitor-clusters", "visitor-cities"]) {
      current.on("mouseenter", layer, () => {
        current.getCanvas().style.cursor = "pointer";
      });
      current.on("mouseleave", layer, () => {
        current.getCanvas().style.cursor = "";
      });
    }
    const load = async () => {
      pending?.abort();
      pending = new AbortController();
      const signal = pending.signal;
      const timeout = setTimeout(() => pending?.abort(), 12000);
      setStatus("loading");
      failures = 0;
      try {
        const response = await fetch(STYLE_URL, { signal });
        if (!response.ok) throw new Error("Map style unavailable");
        const style = (await response.json()) as StyleSpecification;
        if (!alive || signal.aborted) return;
        remote = true;
        // The style background is land; the water layer supplies the ocean.
        for (const layer of style.layers) {
          if (layer.type === "background")
            layer.paint = { ...layer.paint, "background-color": "#25292c" };
          if (layer.type === "fill" && layer.id === "water")
            layer.paint = { ...layer.paint, "fill-color": "#080d10" };
          if (layer.type === "line" && layer.id === "waterway")
            layer.paint = { ...layer.paint, "line-color": "#080d10" };
          if (
            layer.type === "fill" &&
            (layer.id.startsWith("landcover_") ||
              layer.id.startsWith("landuse_"))
          )
            layer.paint = {
              ...layer.paint,
              "fill-color":
                layer.id.includes("wood") || layer.id.includes("park")
                  ? "#2a3030"
                  : "#272d30",
            };
          if (layer.type === "symbol" && layer.layout?.["text-field"])
            layer.paint = {
              ...layer.paint,
              "text-color": "#9aaeb4",
              "text-halo-color": "#0c1418",
              "text-halo-width": 1,
            };
        }
        current.setStyle(style);
        setStatus("detailed");
      } catch {
        if (alive) setStatus("offline");
      } finally {
        clearTimeout(timeout);
      }
    };
    loadDetails.current = () => {
      void load();
    };
    current.on("error", () => {
      if (remote && ++failures >= 3) {
        remote = false;
        current.setStyle(outlineStyle());
        setStatus("offline");
      }
    });
    void load();
    const unsubscribe = useRadarStore.subscribe((state, previous) => {
      if (
        state.trafficRecords !== previous.trafficRecords ||
        state.now !== previous.now ||
        state.visitors !== previous.visitors ||
        state.selectedVisitor?.id !== previous.selectedVisitor?.id
      )
        updateData();
    });
    const observer = new ResizeObserver(() => current.resize());
    observer.observe(container.current);
    return () => {
      alive = false;
      pending?.abort();
      unsubscribe();
      observer.disconnect();
      collapseAttribution.disconnect();
      popup.current?.remove();
      current.remove();
      map.current = null;
      loadDetails.current = null;
    };
  }, [updateData, applyTheme]);

  useEffect(() => {
    applyTheme();
    updateData();
  }, [themeColor, applyTheme, updateData]);

  useEffect(() => {
    const current = map.current;
    if (!current?.isStyleLoaded()) return;
    for (const layer of current.getStyle().layers) {
      if (
        layer.type === "symbol" &&
        layer.source !== "visitors" &&
        layer.layout?.["text-field"]
      )
        current.setLayoutProperty(
          layer.id,
          "visibility",
          showPlaceNames ? "visible" : "none",
        );
    }
  }, [showPlaceNames, status]);

  useEffect(() => {
    const visitor = useRadarStore.getState().selectedVisitor;
    if (!visitor || !map.current) return;
    map.current.resize();
    map.current.easeTo({
      center: [visitor.location.longitude, visitor.location.latitude],
      zoom: Math.max(11, map.current.getZoom()),
      duration: reducedMotion ? 0 : 500,
    });
    popup.current?.remove();
  }, [selectedId, reducedMotion]);
  useEffect(() => {
    if (previousReset.current === resetKey) return;
    previousReset.current = resetKey;
    map.current?.fitBounds(WORLD, {
      padding: { top: 20, bottom: 42, left: 25, right: 25 },
      duration: reducedMotion ? 0 : 600,
    });
    popup.current?.remove();
  }, [resetKey, reducedMotion]);
  useEffect(() => {
    if (zoom)
      map.current?.zoomTo(
        Math.max(
          0.6,
          Math.min(19, map.current.getZoom() + (zoom < 0 ? 1 : -1)),
        ),
        { duration: reducedMotion ? 0 : 250 },
      );
  }, [zoom, reducedMotion]);

  const values = mapZoom < 5 ? distribution.countries : distribution.cities;
  const maxViews = Math.max(1, ...values);
  const bins = Array.from({ length: 16 }, () => 0);
  values.forEach(
    (value) => bins[Math.min(15, Math.floor((value / maxViews) * 15))]++,
  );
  const peak = Math.max(1, ...bins.map((value) => Math.log1p(value)));
  const histogram = bins
    .map(
      (value, index) =>
        `${index ? "L" : "M"}${index * 10},${28 - (Math.log1p(value) / peak) * 24}`,
    )
    .join(" ");
  return (
    <div
      className="flat-map"
      data-map-detail={status}
      data-map-zoom={mapZoom.toFixed(1)}
    >
      <div
        ref={container}
        className="map-canvas"
        aria-label="Interactive world map. Drag to pan; scroll or double click to zoom to cities."
      />
      {hover && (
        <div
          className="map-stats-tooltip"
          role="tooltip"
          style={{ left: hover.x, top: hover.y }}
        >
          <strong>{hover.name}</strong>
          <div>
            <span>
              Views <small>10m</small>
            </span>
            <b>{hover.views}</b>
          </div>
          <div>
            <span>
              Visitors <small>now</small>
            </span>
            <b>{hover.visitors}</b>
          </div>
        </div>
      )}
      <div
        className="map-heat-legend"
        aria-label={`${mapZoom < 5 ? "Country" : "City"} page views in the last 10 minutes, 0 to ${Math.max(0, ...values)}`}
      >
        <div className="heat-legend-heading">
          <span>Views · 10m</span>
          <small>{mapZoom < 5 ? "Countries" : "Cities"}</small>
        </div>
        <svg
          viewBox="0 0 150 30"
          aria-label="Distribution of regions by page views"
        >
          <path
            d={histogram + " L150,30 L0,30 Z"}
            fill="var(--tracel-live)"
            fillOpacity=".09"
          />
          <path
            d={histogram}
            fill="none"
            stroke="var(--tracel-info)"
            strokeWidth="1"
          />
        </svg>
        <div
          className="heat-gradient"
          style={{
            background:
              maxViews <= 1
                ? `linear-gradient(to right,#25292c,${palette.heat})`
                : `linear-gradient(to right,#25292c 0%,${palette.heat} ${100 / maxViews}%,${palette.bright} 100%)`,
          }}
        />
        <div className="heat-legend-labels">
          <span>0</span>
          <span>{Math.max(0, ...values)} views</span>
        </div>
      </div>
      {status === "unavailable" && (
        <div className="globe-fallback">
          <span>MAP VIEW UNAVAILABLE</span>
          <p>
            Enable WebGL to view the map.
            <br />
            Use the Visitors list to explore activity.
          </p>
        </div>
      )}
      {(status === "loading" || status === "offline") && (
        <div className="map-connection-state" role="status">
          {status === "loading"
            ? "Loading city detail…"
            : "World outlines only · city detail needs a connection"}
          {status === "offline" && (
            <button onClick={() => loadDetails.current?.()}>Retry</button>
          )}
        </div>
      )}
    </div>
  );
}
