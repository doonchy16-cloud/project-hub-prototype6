"use client";

import { useEffect, useRef } from "react";
import type { ProjectMapProps, SharedProject } from "@/types/prototype";

type LeafletModule = typeof import("leaflet");

function getMarkerSize(zoom: number, mode: "mini" | "full") {
  const base = mode === "full" ? 42 : 34;
  const extra = Math.max(0, zoom - (mode === "full" ? 4 : 3)) * 2.2;
  return Math.round(base + Math.min(extra, mode === "full" ? 18 : 14));
}

function buildPinSvg(size: number, active: boolean) {
  const stroke = active ? "#111827" : "#000000";
  const fill = "#ff1a1a";
  const outerStroke = Math.max(2, Math.round(size * 0.09));
  const innerStroke = Math.max(2, Math.round(size * 0.06));

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none">
      <path
        d="M32 4C20.4 4 11 13.1 11 24.4c0 16 21 35.6 21 35.6s21-19.6 21-35.6C53 13.1 43.6 4 32 4Z"
        fill="${fill}"
        stroke="${stroke}"
        stroke-width="${outerStroke}"
        stroke-linejoin="round"
      />
      <circle
        cx="32"
        cy="24"
        r="9.5"
        fill="#ffffff"
        stroke="${stroke}"
        stroke-width="${innerStroke}"
      />
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createProjectIcon(
  L: LeafletModule,
  mapZoom: number,
  mode: "mini" | "full",
  active: boolean
) {
  const size = getMarkerSize(mapZoom, mode);

  return L.icon({
    iconUrl: buildPinSvg(size, active),
    iconRetinaUrl: buildPinSvg(size, active),
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 2],
    popupAnchor: [0, -size + 8],
    className: "project-pin-icon",
  });
}

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
  const zoomHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!mapElRef.current || mapRef.current || typeof window === "undefined") return;

      const leaflet = await import("leaflet");
      if (cancelled) return;

      const L = leaflet;
      const map = L.map(mapElRef.current, {
        zoomControl: true,
        attributionControl: true,
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
      zoomHandlerRef.current = null;
      mapRef.current?.__cleanup?.();
      mapRef.current?.remove?.();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    let disposed = false;

    async function renderMarkers() {
      if (!mapRef.current || !layerRef.current || typeof window === "undefined") return;
      const leaflet = await import("leaflet");
      if (disposed) return;

      const L = leaflet;
      const map = mapRef.current;
      const layer = layerRef.current;

      const drawMarkers = () => {
        layer.clearLayers();
        const bounds: [number, number][] = [];
        const zoom = map.getZoom();

        projects.forEach((project: SharedProject) => {
          if (!Number.isFinite(project.lat) || !Number.isFinite(project.lng)) return;

          const isActive = activeProjectId === project.id;
          const marker = L.marker([project.lat, project.lng], {
            icon: createProjectIcon(L, zoom, mode, isActive),
            keyboard: true,
            title: project.title,
            riseOnHover: true,
          });

          marker.on("click", () => onSelectProject?.(project));
          marker.addTo(layer);
          bounds.push([project.lat, project.lng]);
        });

        if (bounds.length > 0) {
          map.fitBounds(bounds, {
            padding: [30, 30],
            maxZoom: mode === "mini" ? 6 : 8,
          });
        } else {
          map.setView([39.5, -98.35], mode === "mini" ? 3 : 4);
        }

        requestAnimationFrame(() => map.invalidateSize(false));
      };

      if (zoomHandlerRef.current) {
        map.off("zoomend", zoomHandlerRef.current);
      }

      zoomHandlerRef.current = drawMarkers;
      map.on("zoomend", drawMarkers);
      drawMarkers();
    }

    renderMarkers();

    return () => {
      disposed = true;
      if (mapRef.current && zoomHandlerRef.current) {
        mapRef.current.off("zoomend", zoomHandlerRef.current);
      }
      zoomHandlerRef.current = null;
    };
  }, [projects, highlightedIds, activeProjectId, onSelectProject, mode]);

  return <div ref={mapElRef} className="h-full w-full rounded-3xl" />;
}
