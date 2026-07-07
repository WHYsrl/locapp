"use client";

// Google Maps implementation of the map canvas (same MapMarker API surface
// as the MapLibre one). Rendered by MapView only when
// NEXT_PUBLIC_GOOGLE_MAPS_KEY is set at build time.

import { useEffect, useState } from "react";
import { APIProvider, AdvancedMarker, InfoWindow, Map, Pin, useMap } from "@vis.gl/react-google-maps";
import type { MapMarker } from "./MapCanvas";

const DEFAULT_CENTER = { lat: 44.8, lng: 10.5 };
const DEFAULT_ZOOM = 5.2;

// --- Map view options (type + traffic), shared across every map instance ---

type MapTypeId = "roadmap" | "terrain" | "satellite" | "hybrid";

const MAP_TYPES: ReadonlyArray<{ id: MapTypeId; label: string }> = [
  { id: "roadmap", label: "Strada" },
  { id: "terrain", label: "Terreno" },
  { id: "satellite", label: "Satellite" },
  { id: "hybrid", label: "Ibrido" },
];

interface MapPrefs {
  mapType: MapTypeId;
  traffic: boolean;
}

const DEFAULT_PREFS: MapPrefs = { mapType: "roadmap", traffic: false };
const PREFS_STORAGE_KEY = "venuescout:maptype";

/** Restore the persisted map type + traffic toggle (defaults on any failure). */
function loadMapPrefs(): MapPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as { mapType?: unknown; traffic?: unknown };
    const mapType = MAP_TYPES.find((t) => t.id === parsed.mapType)?.id ?? DEFAULT_PREFS.mapType;
    return { mapType, traffic: parsed.traffic === true };
  } catch {
    return DEFAULT_PREFS;
  }
}

function saveMapPrefs(prefs: MapPrefs): void {
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full/blocked: the preference simply won't persist.
  }
}

/** Mounts/unmounts a google.maps.TrafficLayer on the current map instance. */
function TrafficLayer({ enabled }: { enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !enabled) return;
    const layer = new google.maps.TrafficLayer();
    layer.setMap(map);
    return () => layer.setMap(null);
  }, [map, enabled]);
  return null;
}

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

/** Compact glass overlay (top-right): map style segmented options + traffic pill. */
function MapOptionsControl({
  prefs,
  onChange,
}: {
  prefs: MapPrefs;
  onChange: (prefs: MapPrefs) => void;
}) {
  return (
    <div className="pointer-events-none absolute right-2.5 top-2.5 z-10 flex items-center gap-1.5">
      <div
        role="group"
        aria-label="Stile mappa"
        className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-hairline bg-white/70 p-0.5 shadow-soft backdrop-blur"
      >
        {MAP_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={prefs.mapType === t.id}
            onClick={() => onChange({ ...prefs, mapType: t.id })}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition duration-150 ${
              prefs.mapType === t.id
                ? "bg-white text-ink shadow-soft"
                : "text-ink/55 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={prefs.traffic}
        title="Mostra il traffico in tempo reale"
        onClick={() => onChange({ ...prefs, traffic: !prefs.traffic })}
        className={`pointer-events-auto rounded-full border border-hairline px-2.5 py-1 text-[11px] font-semibold shadow-soft backdrop-blur transition duration-150 ${
          prefs.traffic ? "bg-white text-ink" : "bg-white/70 text-ink/55 hover:text-ink"
        }`}
      >
        Traffico
      </button>
    </div>
  );
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
  // Loaded lazily in the initializer: this component is client-only (ssr: false).
  const [prefs, setPrefs] = useState<MapPrefs>(loadMapPrefs);

  const updatePrefs = (next: MapPrefs) => {
    setPrefs(next);
    saveMapPrefs(next);
  };

  // Deselect when the marker set changes (e.g. filters).
  useEffect(() => {
    setSelected(null);
  }, [markers]);

  return (
    <div
      style={{ height }}
      className={`relative w-full overflow-hidden rounded-2xl border border-hairline shadow-soft ${className}`}
    >
      <APIProvider apiKey={apiKey} language="it" region="IT">
        <Map
          mapId="DEMO_MAP_ID"
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={DEFAULT_ZOOM}
          mapTypeId={prefs.mapType}
          gestureHandling="greedy"
          disableDefaultUI={false}
          streetViewControl={false}
          mapTypeControl={false}
          fullscreenControl={false}
        >
          <FitBounds markers={markers} />
          <TrafficLayer enabled={prefs.traffic} />
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
        <MapOptionsControl prefs={prefs} onChange={updatePrefs} />
      </APIProvider>
    </div>
  );
}
