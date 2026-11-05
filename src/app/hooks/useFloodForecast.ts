import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Sensor } from './useSensors';

export interface FloodForecast {
  /** Big text on the card */
  value: string;
  /** Small text beside it */
  unit?: string;
  /** Rate of change in cm per minute (positive = rising), or null when unknown */
  rate: number | null;
  tone: 'ok' | 'warn' | 'danger' | 'none';
}

const WINDOW_MIN = 10; // how much history the trend is fitted to
const REFRESH_MS = 10_000;
const FLAT_CM_PER_MIN = 0.1; // slower than this counts as steady
const MAX_ETA_MIN = 120; // beyond this, a straight-line projection isn't meaningful

/** Least-squares slope of value over time, in units per minute. Null if there isn't enough spread. */
function slopePerMin(points: { t: number; v: number }[]): number | null {
  if (points.length < 4) return null;
  const spanMin = (points[points.length - 1].t - points[0].t) / 60000;
  if (spanMin < 1) return null;
  const t0 = points[0].t;
  const xs = points.map((p) => (p.t - t0) / 60000);
  const ys = points.map((p) => p.v);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/**
 * Short-term flood forecast for one water-level sensor: fits a straight line to the last
 * 10 minutes of readings and projects when it will reach the sensor's warning level.
 * It's a simple extrapolation, not a weather model, so it only holds for the next hour or so.
 */
export function useFloodForecast(sensor: Sensor | null): FloodForecast {
  const [rate, setRate] = useState<number | null>(null);
  const sensorId = sensor?.id;

  useEffect(() => {
    if (!sensorId) {
      setRate(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
      const { data } = await supabase
        .from('sensor_readings')
        .select('value, created_at')
        .eq('sensor_id', sensorId)
        .gte('created_at', since)
        .order('created_at');
      if (cancelled || !data) return;
      setRate(slopePerMin(data.map((r) => ({ t: new Date(r.created_at).getTime(), v: Number(r.value) }))));
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sensorId]);

  if (!sensor || sensor.status === 'offline' || sensor.value === null) {
    return { value: 'No data', unit: undefined, rate: null, tone: 'none' };
  }
  if (sensor.value >= sensor.warnLevel) {
    return { value: 'Reached', unit: 'warning level', rate, tone: 'danger' };
  }
  if (rate === null) {
    return { value: 'Gathering', unit: 'data…', rate: null, tone: 'none' };
  }
  if (rate > FLAT_CM_PER_MIN) {
    const eta = (sensor.warnLevel - sensor.value) / rate;
    if (eta <= MAX_ETA_MIN) {
      return { value: eta < 1 ? '<1' : String(Math.round(eta)), unit: 'min to warning', rate, tone: eta <= 30 ? 'danger' : 'warn' };
    }
    return { value: 'Rising', unit: 'slowly', rate, tone: 'ok' };
  }
  if (rate < -FLAT_CM_PER_MIN) return { value: 'Falling', unit: undefined, rate, tone: 'ok' };
  return { value: 'Steady', unit: undefined, rate, tone: 'ok' };
}
