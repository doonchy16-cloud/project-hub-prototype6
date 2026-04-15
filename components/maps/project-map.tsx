"use client";

import { useEffect, useRef } from "react";
import type { ProjectMapProps } from "@/types/prototype";

export function ProjectMap({
  projects,
  highlightedIds,
  activeProjectId,
  onSelectProject,
  mode,
}: ProjectMapProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!mapElRef.current || mapRef.current || typeof window === "undefined") return;

      const leaflet = await import("leaflet");
      if (cancelled) return;

      const L = leaflet.default;
      const map = L.map(mapElRef.current, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
      });

      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        crossOrigin: true,
      }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      map.setView([39.5, -98.35], mode === "mini" ? 3 : 4);

      const invalidate = () => mapRef.current?.invalidateSize(false);
      requestAnimationFrame(invalidate);
      setTimeout(invalidate, 120);
      setTimeout(invalidate, 320);

      if (typeof ResizeObserver !== "undefined" && mapElRef.current) {
        resizeObserverRef.current = new ResizeObserver(() => invalidate());
        resizeObserverRef.current.observe(mapElRef.current);
      }

      const onWindowResize = () => invalidate();
      window.addEventListener("resize", onWindowResize);

      (mapRef.current as any).__cleanup = () => {
        window.removeEventListener("resize", onWindowResize);
      };
    }

    boot();

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      mapRef.current?.__cleanup?.();
      mapRef.current?.remove?.();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    async function renderMarkers() {
      if (!mapRef.current || !layerRef.current || typeof window === "undefined") return;
      const leaflet = await import("leaflet");
      const L = leaflet.default;
      const map = mapRef.current;
      const layer = layerRef.current;
      layer.clearLayers();

      const bounds: [number, number][] = [];

      projects.forEach((project) => {
        const isActive = activeProjectId === project.id;
        const isHighlighted = highlightedIds.includes(project.id);

        const marker = L.circleMarker([project.lat, project.lng], {
          radius: isActive ? 10 : isHighlighted ? 9 : 7,
          color: isActive ? "#1d4ed8" : isHighlighted ? "#f97316" : "#fb7185",
          fillColor: isActive ? "#3b82f6" : isHighlighted ? "#fb923c" : "#fb7185",
          fillOpacity: 0.95,
          weight: isActive || isHighlighted ? 3 : 2,
        });

        marker.on("click", () => onSelectProject?.(project));
        marker.addTo(layer);
        bounds.push([project.lat, project.lng]);
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: mode === "mini" ? 6 : 7 });
      } else {
        map.setView([39.5, -98.35], mode === "mini" ? 3 : 4);
      }

      requestAnimationFrame(() => map.invalidateSize(false));
      setTimeout(() => map.invalidateSize(false), 100);
    }

    renderMarkers();
  }, [projects, highlightedIds, activeProjectId, onSelectProject, mode]);

  return <div ref={mapElRef} className="h-full w-full rounded-3xl" />;
}
