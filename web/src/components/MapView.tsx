"use client";

import dynamic from "next/dynamic";
import type { MapMarker } from "./MapCanvas";

const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] w-full items-center justify-center rounded-xl border border-berry/10 bg-white text-sm text-ink/40">
      Caricamento mappa…
    </div>
  ),
});

export type { MapMarker };

export default function MapView(props: { markers: MapMarker[]; height?: number; className?: string }) {
  return <MapCanvas {...props} />;
}
