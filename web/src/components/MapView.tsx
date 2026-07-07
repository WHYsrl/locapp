"use client";

// Single wrapper for the interactive maps: when NEXT_PUBLIC_GOOGLE_MAPS_KEY
// is set at build time it renders Google Maps (@vis.gl/react-google-maps),
// otherwise the MapLibre/OSM canvas. Same MapMarker API for all call sites.

import dynamic from "next/dynamic";
import type { MapMarker } from "./MapCanvas";

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

const loading = () => (
  <div className="flex h-[420px] w-full items-center justify-center rounded-2xl border border-hairline bg-white text-sm text-ink/40">
    Caricamento mappa…
  </div>
);

const MapLibreCanvas = dynamic(() => import("./MapCanvas"), { ssr: false, loading });
const GoogleCanvas = dynamic(() => import("./GoogleMapCanvas"), { ssr: false, loading });

export type { MapMarker };

export default function MapView(props: { markers: MapMarker[]; height?: number; className?: string }) {
  if (GOOGLE_MAPS_KEY) {
    return <GoogleCanvas apiKey={GOOGLE_MAPS_KEY} {...props} />;
  }
  return <MapLibreCanvas {...props} />;
}
