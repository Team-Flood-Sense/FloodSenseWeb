import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface Sensor {
  id: string;
  name: string;
  type: 'water' | 'rainfall' | 'wind' | 'temperature';
  location: string;
  status: 'online' | 'warning' | 'offline';
  reading: string;
  value: number | null;
  unit: string;
  warnLevel: number;
  battery: number | null;
  lastSync: string;
}

/** A sensor that hasn't reported for this long is shown as offline. */
const OFFLINE_AFTER_MS = 2 * 60 * 1000;
const REFRESH_MS = 10_000;

interface SensorRow {
  id: string;
  name: string;
  type: Sensor['type'];
  location: string;
  reading: number | null;
  unit: string;
  battery: number | null;
  warn_level: number;
  last_seen: string | null;
}

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'Just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function toSensor(row: SensorRow, now: number): Sensor {
  const age = row.last_seen ? now - new Date(row.last_seen).getTime() : Infinity;
  const value = row.reading === null ? null : Number(row.reading);
  const status: Sensor['status'] =
    age > OFFLINE_AFTER_MS ? 'offline' : value !== null && value >= Number(row.warn_level) ? 'warning' : 'online';
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    location: row.location,
    status,
    reading: value === null ? '—' : `${value} ${row.unit}`,
    value,
    unit: row.unit,
    warnLevel: Number(row.warn_level),
    battery: row.battery,
    lastSync: Number.isFinite(age) ? timeAgo(age) : 'Never',
  };
}

/**
 * Live sensor list from Supabase. Updates the moment a sensor reports (Realtime), re-checks
 * every few seconds so a silent sensor flips to "offline", and polls as a safety net.
 */
export function useSensors() {
  const [rows, setRows] = useState<SensorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error: err } = await supabase.from('sensors').select('*').order('name');
      if (cancelled) return;
      if (err) setError(err.message);
      else {
        setError(null);
        setRows(data as SensorRow[]);
      }
      setLoading(false);
      setNow(Date.now());
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    const channel = supabase
      .channel(`sensors-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sensors' }, load)
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Recompute ages (and offline status) between fetches.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const sensors = rows.map((r) => toSensor(r, now));
  return { sensors, loading, error };
}
