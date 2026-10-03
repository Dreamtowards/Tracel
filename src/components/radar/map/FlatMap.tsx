"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import countries from "@/radar/countries.json";
import geography from "@/radar/geography.json";
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
  const data: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [...groups].map(([key, members]) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [
          members[0].location.longitude,
          members[0].location.latitude,
        ],
      },
      properties: {
        key,
        city: members[0].location.city,
        count: members.length,
        selected: members.some((visitor) => visitor.id === selectedId),
        online: members.some((visitor) => visitor.status === "online"),
      },
    })),
  };
  return { data, groups };
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
function countryActivity(visitors: Record<string, Visitor>) {
  const counts = new Map<string, number>();
  for (const visitor of Object.values(visitors)) {
    if (visitor.status === "offline") continue;
    const id = countryIds[visitor.location.countryCode];
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    type: "FeatureCollection" as const,
    features: countries.features
      .filter((feature) => counts.has(String(feature.id)))
      .map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          count: counts.get(String(feature.id))!,
        },
      })),
  };
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
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const [status, setStatus] = useState<
    "loading" | "detailed" | "offline" | "unavailable"
  >("loading");
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
      source.setData(
        cityGroups(state.visitors, state.selectedVisitor?.id).data,
      );
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
    current.addControl(attribution, "top-left");
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
            "fill-color": "#72d8ad",
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              0.045,
              3,
              0.1,
              8,
              0.19,
              20,
              0.3,
            ],
          },
        },
        current.getStyle().layers.find((layer) => layer.type === "symbol")?.id,
      );
      current.addLayer(
        {
          id: "country-activity-border",
          type: "line",
          source: "country-activity",
          maxzoom: 7,
          paint: {
            "line-color": "#85dcbc",
            "line-width": 0.8,
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1,
              0.15,
              8,
              0.5,
              20,
              0.8,
            ],
          },
        },
        current.getStyle().layers.find((layer) => layer.type === "symbol")?.id,
      );
      current.addSource("visitors", {
        type: "geojson",
        data: cityGroups(state.visitors, state.selectedVisitor?.id).data,
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
            "#dcffee",
          ],
          "circle-opacity": 0.84,
          "circle-stroke-color": "#b6f4d8",
          "circle-stroke-width": 1,
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
            "#dcffee",
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
          "circle-stroke-color": "#1c4135",
          "circle-stroke-width": 2,
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
          filter: ["!", ["has", "point_count"]],
          layout: {
            "text-field": ["get", "city"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-offset": [0, 1.6],
            "text-anchor": "top",
          },
          paint: {
            "text-color": [
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
    });
    current.on("zoomend", () => setMapZoom(current.getZoom()));
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
        for (const layer of style.layers) {
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
  }, [updateData]);

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
      duration: reducedMotion ? 0 : 900,
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
