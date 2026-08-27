import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { MapPin } from 'lucide-react';
import L from 'leaflet';

// ── IMPORTANT ────────────────────────────────────────────
// Make sure you have these in main.tsx:
//   import "leaflet/dist/leaflet.css";
//
// And these installed:
//   npm install leaflet
//   npm install --save-dev @types/leaflet
// ─────────────────────────────────────────────────────────

// ── COORDINATES ──────────────────────────────────────────
// Replace these with your actual GPS coordinates once
// you physically measure them at TUP Manila.
// ─────────────────────────────────────────────────────────
const SENSOR_NODE_1 = { lat: 14.5874, lng: 120.9841 }; // ← your actual sensor spot
const EVACUATION      = { lat: 14.5882, lng: 120.9852 }; // ← placeholder, update later
const SAFE_ZONE       = { lat: 14.5868, lng: 120.9858 }; // ← placeholder, update later

function makeIcon(color: string, isSquare = false): L.DivIcon {
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
            <path d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0
              017-7zm0 4.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/>
          </svg>
        </div>
      </div>`,
    iconSize:    [50, 50],
    iconAnchor:  [25, 25],
    popupAnchor: [0, -28],
  });
}

export function GeospatialMonitor() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<L.Map | null>(null);

  useEffect(() => {
    if (mapRef.current || !mapDivRef.current) return;

    // Init map centered on TUP Manila
    mapRef.current = L.map(mapDivRef.current, {
      center: [14.5876, 120.9850],
      zoom: 17,
      zoomControl: true,
    });

    // OpenStreetMap tiles (free, no API key)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    // ── Sensor Node 1 (Flood Risk) ──
    L.marker([SENSOR_NODE_1.lat, SENSOR_NODE_1.lng], {
      icon: makeIcon('#FF6B35'),
    })
      .addTo(mapRef.current)
      .bindPopup(`
        <div style="font-family:'Segoe UI',sans-serif;min-width:160px;">
          <strong style="font-size:14px;color:#0f172a;">Sensor Node 1</strong><br/>
          <span style="font-size:12px;color:#64748b;">Type: Flood Risk Sensor</span><br/>
          <span style="font-size:12px;color:#64748b;">Status: </span>
          <span style="font-size:12px;color:#22c55e;font-weight:600;">● Online</span>
        </div>`);

    // ── Evacuation Center ──
    L.marker([EVACUATION.lat, EVACUATION.lng], {
      icon: makeIcon('#3B82F6', true),
    })
      .addTo(mapRef.current)
      .bindPopup(`
        <div style="font-family:'Segoe UI',sans-serif;min-width:160px;">
          <strong style="font-size:14px;color:#0f172a;">Evacuation Center</strong><br/>
          <span style="font-size:12px;color:#3b82f6;font-weight:600;">Safe Zone</span>
        </div>`);

    // ── Safe Zone Sensor ──
    L.marker([SAFE_ZONE.lat, SAFE_ZONE.lng], {
      icon: makeIcon('#2EC4B6'),
    })
      .addTo(mapRef.current)
      .bindPopup(`
        <div style="font-family:'Segoe UI',sans-serif;min-width:160px;">
          <strong style="font-size:14px;color:#0f172a;">Sensor Node 2</strong><br/>
          <span style="font-size:12px;color:#64748b;">Type: Safe Zone Sensor</span><br/>
          <span style="font-size:12px;color:#22c55e;font-weight:600;">● Online</span>
        </div>`);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
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
              Real-time flood risk monitoring — Barangay 659, Ermita, Manila
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
              <span className="text-white/80 text-xs">Flood Risk Sensor</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: '#2EC4B6', boxShadow: '0 0 8px rgba(46, 196, 182, 0.5)' }} />
              <span className="text-white/80 text-xs">Safe Zone Sensor</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: '#3B82F6', boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)' }} />
              <span className="text-white/80 text-xs">Evacuation Center</span>
            </div>
          </div>
        </div>

        {/* Location badge */}
        <div className="absolute top-4 left-4 pointer-events-none" style={{ zIndex: 1000 }}>
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
              Barangay 659, Ermita, Manila
            </span>
          </div>
        </div>

      </div>
    </motion.div>
  );
}