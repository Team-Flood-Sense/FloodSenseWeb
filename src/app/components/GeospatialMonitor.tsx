import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { MapPin } from 'lucide-react';
import L from 'leaflet';

// Leaflet's stylesheet is imported in main.tsx ("leaflet/dist/leaflet.css").

// ── LOCATIONS ────────────────────────────────────────────
// Barangay Pamplona 3, Las Piñas City. Coordinates supplied by the barangay.
// ─────────────────────────────────────────────────────────
type Place = { name: string; lat: number; lng: number };

const FLOOD_AREAS: Place[] = [
  { name: 'Flood Area 1', lat: 14.456840433002867, lng: 120.98282717398664 },
  { name: 'Flood Area 2', lat: 14.454728512437777, lng: 120.9837726555534 },
];

const EVACUATION_AREAS: Place[] = [
  { name: 'Evacuation Area 1', lat: 14.454053235350871, lng: 120.98067216651691 },
  { name: 'Evacuation Area 2', lat: 14.454186996765806, lng: 120.98035432436127 },
  { name: 'Evacuation Area 3', lat: 14.45703539568615, lng: 120.98108983679258 },
];

const DRRM_OFFICE: Place = {
  name: 'Barangay Pamplona 3 DRRM Office',
  lat: 14.455053133983723,
  lng: 120.98506119230326,
};

// Marker glyphs (24x24 paths)
const GLYPHS = {
  droplet: 'M12 2.7c-.3 0-.6.1-.8.4C9.3 5.4 5 10.2 5 14a7 7 0 0014 0c0-3.8-4.3-8.6-6.2-10.9-.2-.3-.5-.4-.8-.4z',
  shelter: 'M12 3L2 12h3v8h6v-5h2v5h6v-8h3L12 3z',
  shield: 'M12 2L4 5v6c0 5.5 3.4 10.7 8 12 4.6-1.3 8-6.5 8-12V5l-8-3z',
} as const;

function makeIcon(color: string, glyph: keyof typeof GLYPHS, isSquare = false): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:50px;height:50px;">
        <!-- Pulse ring animation -->
        <div style="
          position:absolute;inset:0;
          border-radius:${isSquare ? '12px' : '50%'};
          background:${color};
          opacity:0.3;
          animation:markerPulse 1.8s ease-out infinite;">
        </div>
        <!-- Main marker -->
        <div style="
          position:absolute;top:8px;left:8px;
          width:34px;height:34px;
          background:${color};
          border:3px solid white;
          border-radius:${isSquare ? '8px' : '50%'};
          box-shadow:0 4px 15px ${color}99;
          display:flex;align-items:center;justify-content:center;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
            <path d="${GLYPHS[glyph]}"/>
          </svg>
        </div>
      </div>`,
    iconSize:    [50, 50],
    iconAnchor:  [25, 25],
    popupAnchor: [0, -28],
  });
}

function popup(title: string, kind: string, kindColor: string, place: Place) {
  return `
    <div style="font-family:'Plus Jakarta Sans','Segoe UI',sans-serif;min-width:170px;">
      <strong style="font-size:14px;color:#0f172a;">${title}</strong><br/>
      <span style="font-size:12px;color:${kindColor};font-weight:600;">${kind}</span><br/>
      <span style="font-size:11px;color:#94a3b8;">${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}</span>
    </div>`;
}

export function GeospatialMonitor() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<L.Map | null>(null);

  useEffect(() => {
    if (mapRef.current || !mapDivRef.current) return;

    const map = L.map(mapDivRef.current, { zoomControl: true });
    mapRef.current = map;

    // OpenStreetMap tiles (free, no API key)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // ── Flood areas ──
    FLOOD_AREAS.forEach((place) => {
      L.marker([place.lat, place.lng], { icon: makeIcon('#FF6B35', 'droplet'), title: place.name })
        .addTo(map)
        .bindPopup(popup(place.name, 'Flood-prone area', '#FF6B35', place));
    });

    // ── Evacuation areas ──
    EVACUATION_AREAS.forEach((place) => {
      L.marker([place.lat, place.lng], { icon: makeIcon('#3B82F6', 'shelter', true), title: place.name })
        .addTo(map)
        .bindPopup(popup(place.name, 'Evacuation area', '#3B82F6', place));
    });

    // ── DRRM office ──
    L.marker([DRRM_OFFICE.lat, DRRM_OFFICE.lng], { icon: makeIcon('#2EC4B6', 'shield'), title: DRRM_OFFICE.name })
      .addTo(map)
      .bindPopup(popup(DRRM_OFFICE.name, 'Command post', '#2EC4B6', DRRM_OFFICE));

    // Frame every location on screen
    const points = [...FLOOD_AREAS, ...EVACUATION_AREAS, DRRM_OFFICE].map((p) => [p.lat, p.lng] as [number, number]);
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 17 });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="relative overflow-hidden"
      style={{
        borderRadius: '28px',
        background: 'linear-gradient(135deg, #1a1f2e 0%, #0f1419 100%)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        isolation: 'isolate',
      }}
    >
      {/* Header */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white text-xl mb-1" style={{ fontWeight: 700 }}>
              Live Geospatial Monitor
            </h3>
            <p className="text-white/60 text-sm">
              Real-time flood risk monitoring — Barangay Pamplona 3, Las Piñas City
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5">
            <div className="w-2 h-2 rounded-full bg-[#2EC4B6] animate-pulse" />
            <span className="text-white/90 text-sm" style={{ fontWeight: 600 }}>
              Live
            </span>
          </div>
        </div>
      </div>

      {/* Map Area */}
      <div className="relative h-[500px]">

        {/* Leaflet Map */}
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />

        {/* Legend */}
        <div className="absolute bottom-6 right-6 p-4 rounded-2xl bg-[#0B3C5D]/90 backdrop-blur-xl border border-white/10 pointer-events-none" style={{ zIndex: 1000 }}>
          <h4 className="text-white text-sm mb-3" style={{ fontWeight: 600 }}>Legend</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: '#FF6B35', boxShadow: '0 0 8px rgba(255, 107, 53, 0.5)' }} />
              <span className="text-white/80 text-xs">Flood Area</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: '#2EC4B6', boxShadow: '0 0 8px rgba(46, 196, 182, 0.5)' }} />
              <span className="text-white/80 text-xs">DRRM Office</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: '#3B82F6', boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)' }} />
              <span className="text-white/80 text-xs">Evacuation Area</span>
            </div>
          </div>
        </div>

        {/* Location badge */}
        <div className="absolute top-4 right-4 pointer-events-none" style={{ zIndex: 1000 }}>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-full"
            style={{
              background: 'rgba(11, 60, 93, 0.9)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(46, 196, 182, 0.3)',
            }}
          >
            <MapPin className="text-[#2EC4B6]" size={14} />
            <span className="text-white text-xs" style={{ fontWeight: 600 }}>
              Barangay Pamplona 3, Las Piñas City
            </span>
          </div>
        </div>

      </div>
    </motion.div>
  );
}