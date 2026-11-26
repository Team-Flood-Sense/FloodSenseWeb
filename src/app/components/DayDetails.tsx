import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useEscape } from '@/app/hooks/useEscape';
import { LEVEL_COLOR, LEVEL_LABEL, hours, short, type LevelClass, type SensorInfo, type StatRow } from '@/lib/analytics';
import { classify, formatLevel } from '@/lib/water';

interface HourRow {
  sensor_id: string;
  hour: number;
  peak: number;
  average: number;
}

const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
const th = 'text-left px-4 py-3 text-ink/70 text-xs';
const td = 'px-4 py-2.5 text-ink text-sm';

function LevelChip({ level }: { level: LevelClass }) {
  return (
    <span className="inline-flex px-3 py-1 rounded-full text-xs" style={{ fontWeight: 600, color: LEVEL_COLOR[level], background: `${LEVEL_COLOR[level]}1f`, border: `1px solid ${LEVEL_COLOR[level]}55` }}>
      {LEVEL_LABEL[level]}
    </span>
  );
}

/** One day's flood details: a summary per sensor, then hour by hour while raw readings still exist. */
export function DayDetails({ day, rows, sensors, onClose }: { day: string; rows: StatRow[]; sensors: SensorInfo[]; onClose: () => void }) {
  const [hourly, setHourly] = useState<HourRow[] | null>(null);
  const [error, setError] = useState('');
  useEscape(true, onClose);

  useEffect(() => {
    let cancelled = false;
    setHourly(null);
    setError('');
    supabase.rpc('sensor_hourly_levels', { p_day: day }).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) setError(err.message);
      setHourly((data as HourRow[] | null) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [day]);

  const byId = new Map(sensors.map((s) => [s.id, s]));
  const daily = rows.filter((r) => r.day === day && byId.has(r.sensor_id));
  const hourRows = (hourly ?? []).filter((r) => byId.has(r.sensor_id));
  const title = short(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog" aria-modal="true" aria-label={`Flood details for ${title}`}
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 sm:p-8"
        style={{ background: 'rgb(var(--surface-rgb))', borderRadius: '28px', boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.25)' }}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-ink text-xl" style={{ fontWeight: 700 }}>{title}</h3>
            <p className="text-ink/55 text-sm">Flood details for this day</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="p-2 rounded-xl bg-ink/5">
            <X className="text-ink/60" size={18} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.04]">
                {['Sensor', 'Highest', 'Lowest', 'Average', 'At/above warning', 'At/above critical', 'Level'].map((h) => (
                  <th key={h} className={th} style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map((r) => {
                const s = byId.get(r.sensor_id)!;
                return (
                  <tr key={r.sensor_id} className="border-b border-ink/5">
                    <td className={td} style={{ fontWeight: 600 }}>{s.name}<div className="text-ink/50 text-xs" style={{ fontWeight: 400 }}>{s.location}</div></td>
                    <td className={td}>{formatLevel(Number(r.peak), s.unit)}</td>
                    <td className={td}>{formatLevel(Number(r.low), s.unit)}</td>
                    <td className={td}>{formatLevel(r.readings ? Number(r.sum_value) / r.readings : null, s.unit)}</td>
                    <td className={td}>{hours(r.warn_seconds / 3600)}</td>
                    <td className={td}>{hours(r.danger_seconds / 3600)}</td>
                    <td className={td}><LevelChip level={classify(Number(r.peak), s.warn, s.danger)} /></td>
                  </tr>
                );
              })}
              {daily.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-ink/55 text-sm">No readings on this day.</td></tr>}
            </tbody>
          </table>
        </div>

        <h4 className="text-ink text-base mt-6 mb-2" style={{ fontWeight: 700 }}>Hour by hour</h4>
        {error ? (
          <p className="text-sm" style={{ color: '#ef4444' }}>Couldn't load the hourly readings: {error}</p>
        ) : hourly === null ? (
          <p className="text-ink/55 text-sm">Loading…</p>
        ) : hourRows.length === 0 ? (
          <p className="text-ink/55 text-sm">No hourly readings. Individual readings are kept for about 7 days; the daily summary above is kept long term.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink/10 bg-ink/[0.04]">
                  {['Time', 'Sensor', 'Highest', 'Average', 'Level'].map((h) => (
                    <th key={h} className={th} style={{ fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hourRows.map((r) => {
                  const s = byId.get(r.sensor_id)!;
                  return (
                    <tr key={`${r.sensor_id}-${r.hour}`} className="border-b border-ink/5">
                      <td className={td}>{hourLabel(r.hour)}</td>
                      <td className={td}>{s.name}</td>
                      <td className={td}>{formatLevel(Number(r.peak), s.unit)}</td>
                      <td className={td}>{formatLevel(Number(r.average), s.unit)}</td>
                      <td className={td}><LevelChip level={classify(Number(r.peak), s.warn, s.danger)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
