import { WATER_COLOR, WATER_LABEL, levelRanges } from '@/lib/water';
import type { Sensor } from '../hooks/useSensors';

/** What water level each status means. One row, or one per sensor group when thresholds differ. */
export function LevelRanges({ sensors }: { sensors: Sensor[] }) {
  const groups = new Map<string, { warn: number; danger: number; unit: string; names: string[] }>();
  sensors.forEach((s) => {
    const key = `${s.warnLevel}|${s.dangerLevel}|${s.unit}`;
    const group = groups.get(key) ?? { warn: s.warnLevel, danger: s.dangerLevel, unit: s.unit, names: [] };
    group.names.push(s.name);
    groups.set(key, group);
  });
  if (groups.size === 0) return null;

  return (
    <div className="rounded-2xl bg-surface/80 border border-ink/10 px-5 py-4 space-y-2">
      {[...groups.entries()].map(([key, g]) => (
        <div key={key} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink/70">
          <span className="text-ink" style={{ fontWeight: 700 }}>
            Water level status{groups.size > 1 ? ` (${g.names.join(', ')})` : ''}
          </span>
          {levelRanges(g.warn, g.danger, g.unit).map(({ level, text }) => (
            <span key={level} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ background: WATER_COLOR[level] }} />
              <span className="text-ink" style={{ fontWeight: 600 }}>{WATER_LABEL[level]}:</span> {text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
