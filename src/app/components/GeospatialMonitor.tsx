import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { MapPin } from 'lucide-react';
import L from 'leaflet';
import type { Sensor } from '../hooks/useSensors';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

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

const SENSOR_COLORS = { online: '#0EA5E9', warning: '#DC2626', offline: '#64748B' } as const;
const WAVES_GLYPH = 'M2 9c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 8 0v3c-4-2.5-6-2.5-8 0s-4 2.5-6 0-4-2.5-6 0V9zm0 6c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 8 0v3c-4-2.5-6-2.5-8 0s-4 2.5-6 0-4-2.5-6 0v-3z';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Sensor marker: colour follows its status; the selected one is larger with a ring and a name label. */
function sensorIcon(s: Sensor, selected: boolean): L.DivIcon {
  const color = SENSOR_COLORS[s.status];
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:50px;height:50px;${selected ? 'transform:scale(1.18);' : ''}">
        ${s.status !== 'offline' ? `<div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.3;animation:markerPulse 1.8s ease-out infinite;"></div>` : ''}
        <div style="position:absolute;top:8px;left:8px;width:34px;height:34px;background:${color};border:3px solid white;border-radius:50%;
          box-shadow:${selected ? `0 0 0 4px ${color}88, ` : ''}0 4px 15px ${color}99;display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="${WAVES_GLYPH}"/></svg>
        </div>
        <div style="position:absolute;top:48px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:1px 8px;border-radius:99px;
          background:rgba(11,60,93,0.92);color:white;font:600 11px 'Plus Jakarta Sans','Segoe UI',sans-serif;border:1px solid ${selected ? color : 'rgba(255,255,255,0.15)'};">
          ${esc(s.name)}
        </div>
      </div>`,
    iconSize: [50, 50],
    iconAnchor: [25, 25],
    popupAnchor: [0, -28],
  });
}

function sensorPopup(s: Sensor, placed: boolean, canPlace: boolean) {
  const color = SENSOR_COLORS[s.status];
  const label = { online: 'Online', warning: 'Warning', offline: 'Offline' }[s.status];
  return `
    <div style="font-family:'Plus Jakarta Sans','Segoe UI',sans-serif;min-width:170px;">
      <strong style="font-size:14px;color:#0f172a;">${esc(s.name)}</strong><br/>
      <span style="font-size:12px;color:${color};font-weight:600;">${label}</span>
      <span style="font-size:12px;color:#475569;"> · ${s.status === 'offline' ? 'no recent reading' : esc(s.reading)}</span><br/>
      <span style="font-size:11px;color:#94a3b8;">${esc(s.location)} · ${esc(s.lastSync)}</span>
      ${placed ? '' : `<br/><span style="font-size:11px;color:#b45309;">Location not set${canPlace ? ': drag this marker to place it' : ''}</span>`}
    </div>`;
}

function popup(title: string, kind: string, kindColor: string, place: Place) {
  return `
    <div style="font-family:'Plus Jakarta Sans','Segoe UI',sans-serif;min-width:170px;">
      <strong style="font-size:14px;color:#0f172a;">${title}</strong><br/>
      <span style="font-size:12px;color:${kindColor};font-weight:600;">${kind}</span><br/>
      <span style="font-size:11px;color:#94a3b8;">${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}</span>
    </div>`;
}

interface GeospatialMonitorProps {
  sensors: Sensor[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function GeospatialMonitor({ sensors, selectedId, onSelect }: GeospatialMonitorProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<L.Map | null>(null);
  const markersRef = useRef(new Map<string, { marker: L.Marker; key: string }>());
  const draggingRef = useRef(new Set<string>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const { role } = useAuth();
  const canPlace = role === 'admin' || role === 'operator';

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
      markersRef.current.clear();
    };
  }, []);

  // Sensor markers: add / refresh / remove as the sensor list or the selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();

    sensors.forEach((s, i) => {
      seen.add(s.id);
      const placed = s.lat !== null && s.lng !== null;
      // Sensors without a saved position wait next to the DRRM office until someone drags them into place
      const pos: [number, number] = placed
        ? [s.lat as number, s.lng as number]
        : [DRRM_OFFICE.lat + 0.00035 * (i + 1), DRRM_OFFICE.lng - 0.0003];
      const selected = s.id === selectedId;
      const key = `${s.status}|${selected}|${s.name}`;

      let entry = markersRef.current.get(s.id);
      if (!entry) {
        const marker = L.marker(pos, { icon: sensorIcon(s, selected), draggable: canPlace, zIndexOffset: 1000, title: s.name }).addTo(map);
        marker.bindPopup('');
        marker.on('click', () => onSelectRef.current(s.id));
        marker.on('dragstart', () => draggingRef.current.add(s.id));
        marker.on('dragend', async () => {
          const { lat, lng } = marker.getLatLng();
          await supabase.from('sensors').update({ lat, lng }).eq('id', s.id);
          draggingRef.current.delete(s.id);
        });
        entry = { marker, key };
        markersRef.current.set(s.id, entry);
      } else {
        if (entry.key !== key) {
          entry.marker.setIcon(sensorIcon(s, selected));
          entry.key = key;
        }
        if (!draggingRef.current.has(s.id)) entry.marker.setLatLng(pos);
        if (canPlace) entry.marker.dragging?.enable();
        else entry.marker.dragging?.disable();
      }
      entry.marker.setPopupContent(sensorPopup(s, placed, canPlace));
      entry.marker.setZIndexOffset(selected ? 2000 : 1000);
    });

    markersRef.current.forEach((entry, id) => {
      if (!seen.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    });
  }, [sensors, selectedId, canPlace]);

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
              <div className="w-3 h-3 rounded-full" style={{ background: SENSOR_COLORS.online, boxShadow: '0 0 8px rgba(14, 165, 233, 0.5)' }} />
              <span className="text-white/80 text-xs">Water Sensor</span>
            </div>
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