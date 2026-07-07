"use client";

// Google Maps implementation of the map canvas (same MapMarker API surface
// as the MapLibre one). Rendered by MapView only when
// NEXT_PUBLIC_GOOGLE_MAPS_KEY is set at build time.

import { useEffect, useState } from "react";
import { APIProvider, AdvancedMarker, InfoWindow, Map, Pin, useMap } from "@vis.gl/react-google-maps";
import type { MapMarker } from "./MapCanvas";

const DEFAULT_CENTER = { lat: 44.8, lng: 10.5 };
const DEFAULT_ZOOM = 5.2;

/** Fits the viewport to the markers (mirrors the MapLibre fitBounds logic). */
function FitBounds({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || markers.length === 0) return;
    if (markers.length === 1) {
      map.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
      map.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
    map.fitBounds(bounds, 70);
  }, [map, markers]);
  return null;
}

export default function GoogleMapCanvas({
  apiKey,
  markers,
  height = 420,
  className = "",
}: {
  apiKey: string;
  markers: MapMarker[];
  height?: number;
  className?: string;
}) {
  const [selected, setSelected] = useState<MapMarker | null>(null);

  // Deselect when the marker set changes (e.g. filters).
  useEffect(() => {
    setSelected(null);
  }, [markers]);

  return (
    <div
      style={{ height }}
      className={`w-full overflow-hidden rounded-2xl border border-hairline shadow-soft ${className}`}
    >
      <APIProvider apiKey={apiKey} language="it" region="IT">
        <Map
          mapId="DEMO_MAP_ID"
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={DEFAULT_ZOOM}
          gestureHandling="greedy"
          disableDefaultUI={false}
          streetViewControl={false}
          mapTypeControl={false}
          fullscreenControl={false}
        >
          <FitBounds markers={markers} />
          {markers.map((m) => (
            <AdvancedMarker
              key={m.id}
              position={{ lat: m.lat, lng: m.lng }}
              title={m.label}
              onClick={() => setSelected(m)}
            >
              <Pin
                background={m.color ?? "#6d2e46"}
                borderColor="#ffffff"
                glyphColor="#ffffff"
              />
            </AdvancedMarker>
          ))}
          {selected && (
            <InfoWindow
              position={{ lat: selected.lat, lng: selected.lng }}
              pixelOffset={[0, -36]}
              onCloseClick={() => setSelected(null)}
            >
              <div style={{ minWidth: 140 }}>
                <div style={{ fontWeight: 700 }}>{selected.label}</div>
                {selected.sub && <div style={{ fontSize: 12, opacity: 0.7 }}>{selected.sub}</div>}
                {selected.href && (
                  <a href={selected.href} style={{ fontSize: 12, color: "#6d2e46", fontWeight: 600 }}>
                    Apri scheda →
                  </a>
                )}
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}
