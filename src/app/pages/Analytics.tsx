import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CalendarDays, Clock, Download, FileText, Waves } from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { useSensors } from '../hooks/useSensors';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  LEVEL_COLOR,
  LEVEL_LABEL,
  buildBuckets,
  chartSvg,
  hours,
  periodRange,
  reportHtml,
  summarize,
  todayManila,
  toCsv,
  type PeriodKind,
  type ReportOptions,
  type SensorInfo,
  type StatRow,
} from '@/lib/analytics';

const cardStyle = {
  borderRadius: '28px',
  boxShadow: '0 8px 32px rgba(var(--shadow-rgb), 0.08)',
  border: '1px solid rgba(var(--surface-rgb), 0.6)',
};
const inputClass = 'bg-ink/5 border border-ink/10 rounded-xl px-3 py-2 text-ink text-sm outline-none focus:border-ink/30';

const PERIODS: { kind: PeriodKind; label: string }[] = [
  { kind: 'weekly', label: 'Weekly' },
  { kind: 'monthly', label: 'Monthly' },
  { kind: 'yearly', label: 'Yearly' },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-ink/60" style={{ fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Analytics() {
  const { sensors } = useSensors();
  const { profile } = useAuth();

  const today = todayManila();
  const [kind, setKind] = useState<PeriodKind>('weekly');
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [area, setArea] = useState('all');
  const [sensorId, setSensorId] = useState('all');
  const [levelFilter, setLevelFilter] = useState<'all' | 'flood' | 'danger'>('all');

  const [rows, setRows] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => periodRange(kind, date || today, month || today.slice(0, 7), year || today.slice(0, 4)), [kind, date, month, year, today]);

  const areas = useMemo(() => [...new Set(sensors.map((s) => s.location))].sort(), [sensors]);
  const inArea = useMemo(() => sensors.filter((s) => area === 'all' || s.location === area), [sensors, area]);
  const selected: SensorInfo[] = useMemo(
    () =>
      inArea
        .filter((s) => sensorId === 'all' || s.id === sensorId)
        .map((s) => ({ id: s.id, name: s.name, location: s.location, unit: s.unit, warn: s.warnLevel, danger: s.dangerLevel })),
    [inArea, sensorId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('sensor_daily_stats')
      .select('*')
      .gte('day', range.start)
      .lte('day', range.end)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setError(err ? err.message : null);
        setRows(err ? [] : (data as StatRow[]));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  const buckets = useMemo(() => buildBuckets(kind, range, rows, selected), [kind, range, rows, selected]);
  const summary = useMemo(() => summarize(buckets), [buckets]);

  const unit = selected[0]?.unit ?? 'cm';
  const sameThresholds = selected.length > 0 && selected.every((s) => s.warn === selected[0].warn && s.danger === selected[0].danger);
  const warn = sameThresholds ? selected[0].warn : null;
  const danger = sameThresholds ? selected[0].danger : null;

  const shown = buckets.filter((b) =>
    levelFilter === 'all' ? true : levelFilter === 'flood' ? b.level === 'warning' || b.level === 'danger' : b.level === 'danger',
  );
  const unitWord = kind === 'yearly' ? 'Months' : 'Days';

  const options = (): ReportOptions => ({
    kind,
    range,
    area: area === 'all' ? 'All areas' : area,
    sensorNames: selected.map((s) => s.name),
    unit,
    buckets: shown,
    summary,
    warn,
    danger,
    generatedBy: profile?.name || 'FloodSense user',
  });

  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) {
      setError('Your browser blocked the report window. Allow pop-ups for this site and try again.');
      return;
    }
    w.document.write(reportHtml(options()));
    w.document.close();
  };

  const exportCsv = () => download(`floodsense-${kind}-${range.start}.csv`, toCsv(options()), 'text/csv;charset=utf-8');

  const noSensors = sensors.length === 0;

  return (
    <div className="flex-1 space-y-6 pb-2">
      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-surface/80 p-6"
        style={cardStyle}
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-ink/60" style={{ fontWeight: 600 }}>Report type</span>
            <div className="flex rounded-xl bg-ink/5 p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.kind}
                  onClick={() => setKind(p.kind)}
                  className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${kind === p.kind ? 'bg-ink text-surface' : 'text-ink/70 hover:text-ink'}`}
                  style={{ fontWeight: 600 }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {kind === 'weekly' && (
            <Field label="Week ending">
              <input type="date" className={inputClass} style={{ colorScheme: 'light dark' }} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
          {kind === 'monthly' && (
            <Field label="Month">
              <input type="month" className={inputClass} style={{ colorScheme: 'light dark' }} value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />
            </Field>
          )}
          {kind === 'yearly' && (
            <Field label="Year">
              <input type="number" className={`${inputClass} w-28`} value={year} min={2024} max={Number(today.slice(0, 4))} onChange={(e) => setYear(e.target.value)} />
            </Field>
          )}

          <Field label="Area">
            <select className={inputClass} value={area} onChange={(e) => { setArea(e.target.value); setSensorId('all'); }}>
              <option value="all">All areas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Sensor">
            <select className={inputClass} value={sensorId} onChange={(e) => setSensorId(e.target.value)}>
              <option value="all">All sensors</option>
              {inArea.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Show">
            <select className={inputClass} value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)}>
              <option value="all">All levels</option>
              <option value="flood">Warning or higher</option>
              <option value="danger">Danger only</option>
            </select>
          </Field>

          <div className="flex gap-2 ml-auto">
            <button onClick={exportCsv} disabled={noSensors} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-ink bg-ink/5 hover:bg-ink/10 disabled:opacity-40" style={{ fontWeight: 600 }}>
              <Download size={16} /> CSV
            </button>
            <button onClick={printReport} disabled={noSensors} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white disabled:opacity-40" style={{ fontWeight: 600, background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)' }}>
              <FileText size={16} /> Generate report
            </button>
          </div>
        </div>
        <p className="text-ink/50 text-xs mt-3">
          Showing {range.title}. "Generate report" opens a print-ready page; choose <em>Save as PDF</em> in the print window.
        </p>
      </motion.div>

      {error && <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(220,38,38,0.1)', color: '#DC2626' }}>{error}</div>}

      {/* Summary */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard icon={CalendarDays} label={`${unitWord} with flood levels`} value={`${summary.floodPeriods} of ${summary.periodsWithData}`} valueColor="#FF6B35" iconColor="#FF6B35" iconBg="rgba(255, 107, 53, 0.1)" />
        <StatCard icon={AlertTriangle} label={`${unitWord} at danger level`} value={summary.dangerPeriods} valueColor="#DC2626" iconColor="#DC2626" iconBg="rgba(220, 38, 38, 0.1)" />
        <StatCard icon={Waves} label="Highest level" value={summary.highest ? `${summary.highest.peak?.toFixed(1)} ${unit}` : '—'} iconColor="#0EA5E9" iconBg="rgba(14, 165, 233, 0.1)" />
        <StatCard icon={Clock} label="Time at/above warning" value={hours(summary.warnHours)} iconColor="#FFB84D" iconBg="rgba(255, 184, 77, 0.12)" />
      </div>

      {/* Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="bg-surface/80 p-6" style={cardStyle}>
        <h3 className="text-ink text-xl" style={{ fontWeight: 700 }}>Peak water level</h3>
        <p className="text-ink/60 text-sm mt-1 mb-4">Highest reading per {kind === 'yearly' ? 'month' : 'day'}, {range.title}</p>
        {noSensors ? (
          <p className="text-ink/55 text-sm py-10 text-center">No sensors yet. Reports appear once a sensor starts sending readings.</p>
        ) : loading ? (
          <p className="text-ink/55 text-sm py-10 text-center">Loading…</p>
        ) : summary.periodsWithData === 0 ? (
          <p className="text-ink/55 text-sm py-10 text-center">No readings were recorded in this period for the selected area.</p>
        ) : (
          <div className="text-ink" dangerouslySetInnerHTML={{ __html: chartSvg(buckets, unit, warn, danger) }} />
        )}
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-ink/70">
          {(['normal', 'warning', 'danger'] as const).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: LEVEL_COLOR[l] }} /> {LEVEL_LABEL[l]}
            </span>
          ))}
          {!sameThresholds && selected.length > 1 && <span>Sensors have different thresholds, so no threshold lines are drawn.</span>}
        </div>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="bg-surface/80 overflow-hidden" style={cardStyle}>
        <div className="p-6 border-b border-ink/10">
          <h3 className="text-ink text-xl" style={{ fontWeight: 700 }}>Details</h3>
          <p className="text-ink/60 text-sm mt-1">{shown.length} {kind === 'yearly' ? 'months' : 'days'} shown</p>
        </div>
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '480px' }}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.04]">
                {[kind === 'yearly' ? 'Month' : 'Day', `Peak (${unit})`, `Average (${unit})`, 'At/above warning', 'At/above danger', 'Level', 'Sensor with peak'].map((h) => (
                  <th key={h} className="text-left px-6 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.key} className="border-b border-ink/5">
                  <td className="px-6 py-3 text-ink text-sm" style={{ fontWeight: 600 }}>{b.label}</td>
                  <td className="px-6 py-3 text-ink text-sm">{b.peak === null ? '—' : b.peak.toFixed(1)}</td>
                  <td className="px-6 py-3 text-ink/80 text-sm">{b.avg === null ? '—' : b.avg.toFixed(1)}</td>
                  <td className="px-6 py-3 text-ink/80 text-sm">{b.level === 'nodata' ? '—' : hours(b.warnHours)}</td>
                  <td className="px-6 py-3 text-ink/80 text-sm">{b.level === 'nodata' ? '—' : hours(b.dangerHours)}</td>
                  <td className="px-6 py-3">
                    <span className="inline-flex px-3 py-1 rounded-full text-xs" style={{ fontWeight: 600, color: LEVEL_COLOR[b.level], background: `${LEVEL_COLOR[b.level]}1f`, border: `1px solid ${LEVEL_COLOR[b.level]}55` }}>
                      {LEVEL_LABEL[b.level]}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-ink/70 text-sm">{b.peakSensor ?? '—'}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-ink/55 text-sm">Nothing matches this filter in the selected period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
