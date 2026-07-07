"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  label: string;
  sub?: string;
  color?: string;
  href?: string;
}

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export default function MapCanvas({
  markers,
  height = 420,
  className = "",
}: {
  markers: MapMarker[];
  height?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [10.5, 44.8],
      zoom: 5.2,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const instances = markers.map((m) => {
      const popupEl = document.createElement("div");
      const title = document.createElement("div");
      title.style.fontWeight = "700";
      title.textContent = m.label;
      popupEl.appendChild(title);
      if (m.sub) {
        const sub = document.createElement("div");
        sub.style.fontSize = "12px";
        sub.style.opacity = "0.7";
        sub.textContent = m.sub;
        popupEl.appendChild(sub);
      }
      if (m.href) {
        const link = document.createElement("a");
        link.href = m.href;
        link.textContent = "Apri scheda →";
        link.style.fontSize = "12px";
        link.style.color = "#6d2e46";
        link.style.fontWeight = "600";
        popupEl.appendChild(link);
      }
      return new maplibregl.Marker({ color: m.color ?? "#6d2e46" })
        .setLngLat([m.lng, m.lat])
        .setPopup(new maplibregl.Popup({ offset: 24 }).setDOMContent(popupEl))
        .addTo(map);
    });

    if (markers.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      markers.forEach((m) => bounds.extend([m.lng, m.lat]));
      map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 0 });
    }

    return () => instances.forEach((m) => m.remove());
  }, [markers]);

  return <div ref={containerRef} style={{ height }} className={`w-full overflow-hidden rounded-2xl border border-hairline shadow-soft ${className}`} />;
}
