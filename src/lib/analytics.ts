// Flood analytics: turns the per-day sensor summaries into weekly / monthly / yearly reports.
// Days are plain 'YYYY-MM-DD' strings in Philippine time, matching the database.

export type PeriodKind = 'weekly' | 'monthly' | 'yearly';
export type LevelClass = 'nodata' | 'normal' | 'warning' | 'danger';

export interface StatRow {
  sensor_id: string;
  day: string;
  peak: number;
  low: number;
  sum_value: number;
  readings: number;
  warn_seconds: number;
  danger_seconds: number;
}

export interface SensorInfo {
  id: string;
  name: string;
  location: string;
  unit: string;
  warn: number;
  danger: number;
}

export interface Bucket {
  key: string;
  label: string;
  peak: number | null;
  avg: number | null;
  warnHours: number;
  dangerHours: number;
  readings: number;
  level: LevelClass;
  peakSensor: string | null;
}

export interface Summary {
  periodsWithData: number;
  floodPeriods: number;
  dangerPeriods: number;
  highest: Bucket | null;
  warnHours: number;
  dangerHours: number;
  average: number | null;
}

export const LEVEL_LABEL: Record<LevelClass, string> = {
  nodata: 'No data',
  normal: 'Normal',
  warning: 'Warning',
  danger: 'Danger',
};
export const LEVEL_COLOR: Record<LevelClass, string> = {
  nodata: '#94A3B8',
  normal: '#2EC4B6',
  warning: '#FFB84D',
  danger: '#DC2626',
};
const RANK: Record<LevelClass, number> = { nodata: 0, normal: 1, warning: 2, danger: 3 };

// ---- dates ----------------------------------------------------------------

const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};
const short = (s: string, opts: Intl.DateTimeFormatOptions) =>
  parse(s).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

export const todayManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export interface Range {
  start: string;
  end: string;
  title: string;
}

export function periodRange(kind: PeriodKind, date: string, month: string, year: string): Range {
  if (kind === 'weekly') {
    const start = addDays(date, -6);
    return {
      start,
      end: date,
      title: `${short(start, { month: 'short', day: 'numeric' })} – ${short(date, { month: 'short', day: 'numeric', year: 'numeric' })}`,
    };
  }
  if (kind === 'monthly') {
    const [y, m] = month.split('-').map(Number);
    return {
      start: `${y}-${String(m).padStart(2, '0')}-01`,
      end: fmt(new Date(Date.UTC(y, m, 0))),
      title: short(`${y}-${String(m).padStart(2, '0')}-01`, { month: 'long', year: 'numeric' }),
    };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, title: year };
}

// ---- grouping -------------------------------------------------------------

export const classify = (peak: number, warn: number, danger: number): LevelClass =>
  peak >= danger ? 'danger' : peak >= warn ? 'warning' : 'normal';

interface Acc {
  peak: number;
  peakSensor: string | null;
  sum: number;
  readings: number;
  warnSec: number;
  dangerSec: number;
  level: LevelClass;
}

export function buildBuckets(kind: PeriodKind, range: Range, rows: StatRow[], sensors: SensorInfo[]): Bucket[] {
  const byId = new Map(sensors.map((s) => [s.id, s]));
  const keys: { key: string; label: string }[] = [];
  if (kind === 'yearly') {
    const y = range.start.slice(0, 4);
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      keys.push({ key, label: short(`${key}-01`, { month: 'short' }) });
    }
  } else {
    for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
      keys.push({
        key: d,
        label: short(d, kind === 'weekly' ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }),
      });
    }
  }

  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const s = byId.get(r.sensor_id);
    if (!s) continue;
    const key = kind === 'yearly' ? r.day.slice(0, 7) : r.day;
    const a = acc.get(key) ?? { peak: -Infinity, peakSensor: null, sum: 0, readings: 0, warnSec: 0, dangerSec: 0, level: 'normal' as LevelClass };
    const peak = Number(r.peak);
    if (peak > a.peak) {
      a.peak = peak;
      a.peakSensor = s.name;
    }
    a.sum += Number(r.sum_value);
    a.readings += r.readings;
    a.warnSec += r.warn_seconds;
    a.dangerSec += r.danger_seconds;
    const lvl = classify(peak, s.warn, s.danger);
    if (RANK[lvl] > RANK[a.level]) a.level = lvl;
    acc.set(key, a);
  }

  return keys.map(({ key, label }) => {
    const a = acc.get(key);
    if (!a) return { key, label, peak: null, avg: null, warnHours: 0, dangerHours: 0, readings: 0, level: 'nodata', peakSensor: null };
    return {
      key,
      label,
      peak: a.peak,
      avg: a.readings ? a.sum / a.readings : null,
      warnHours: a.warnSec / 3600,
      dangerHours: a.dangerSec / 3600,
      readings: a.readings,
      level: a.level,
      peakSensor: a.peakSensor,
    };
  });
}

export function summarize(buckets: Bucket[]): Summary {
  const withData = buckets.filter((b) => b.level !== 'nodata');
  const readings = withData.reduce((n, b) => n + b.readings, 0);
  const sum = withData.reduce((n, b) => n + (b.avg ?? 0) * b.readings, 0);
  return {
    periodsWithData: withData.length,
    floodPeriods: withData.filter((b) => b.level === 'warning' || b.level === 'danger').length,
    dangerPeriods: withData.filter((b) => b.level === 'danger').length,
    highest: withData.reduce<Bucket | null>((best, b) => (!best || (b.peak ?? 0) > (best.peak ?? 0) ? b : best), null),
    warnHours: withData.reduce((n, b) => n + b.warnHours, 0),
    dangerHours: withData.reduce((n, b) => n + b.dangerHours, 0),
    average: readings ? sum / readings : null,
  };
}

// ---- output ---------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const num = (n: number | null, digits = 1) => (n === null ? '—' : n.toFixed(digits));
export const hours = (h: number) => (h === 0 ? '0 h' : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);

/** Bar chart of the peak level per period, as SVG markup. Text uses currentColor so it follows the theme. */
export function chartSvg(buckets: Bucket[], unit: string, warn: number | null, danger: number | null): string {
  const W = 760;
  const H = 280;
  const m = { l: 48, r: 16, t: 16, b: 40 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const top = Math.max(1, ...buckets.map((b) => b.peak ?? 0), danger ?? 0) * 1.12;
  const y = (v: number) => m.t + ph - (v / top) * ph;
  const slot = pw / buckets.length;
  const bw = Math.max(3, Math.min(48, slot * 0.7));
  const every = Math.ceil(buckets.length / 12);

  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Peak water level per period" font-family="inherit" font-size="11">`;
  for (let i = 0; i <= 4; i++) {
    const v = (top / 4) * i;
    out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity="0.12"/>`;
    out += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" fill="currentColor" fill-opacity="0.6">${Math.round(v)}</text>`;
  }
  out += `<text x="12" y="${m.t + ph / 2}" transform="rotate(-90 12 ${m.t + ph / 2})" text-anchor="middle" fill="currentColor" fill-opacity="0.6">Peak level (${esc(unit)})</text>`;

  buckets.forEach((b, i) => {
    const cx = m.l + slot * i + slot / 2;
    if (b.peak !== null) {
      const h = Math.max(1, (b.peak / top) * ph);
      out += `<rect x="${cx - bw / 2}" y="${m.t + ph - h}" width="${bw}" height="${h}" rx="3" fill="${LEVEL_COLOR[b.level]}"><title>${esc(b.label)}: ${num(b.peak)} ${esc(unit)} (${LEVEL_LABEL[b.level]})</title></rect>`;
    }
    if (i % every === 0) {
      out += `<text x="${cx}" y="${H - m.b + 16}" text-anchor="middle" fill="currentColor" fill-opacity="0.7">${esc(b.label.replace(/^\w+, /, ''))}</text>`;
    }
  });

  const line = (v: number, color: string, text: string) =>
    `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 4"/>` +
    `<text x="${W - m.r}" y="${y(v) - 4}" text-anchor="end" fill="${color}">${text} ${v}</text>`;
  if (warn !== null) out += line(warn, LEVEL_COLOR.warning, 'Warning');
  if (danger !== null) out += line(danger, LEVEL_COLOR.danger, 'Danger');
  return out + '</svg>';
}

export interface ReportOptions {
  kind: PeriodKind;
  range: Range;
  area: string;
  sensorNames: string[];
  unit: string;
  buckets: Bucket[];
  summary: Summary;
  warn: number | null;
  danger: number | null;
  generatedBy: string;
}

const periodWord = (k: PeriodKind) => ({ weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' })[k];
const periodColumn = (k: PeriodKind) => (k === 'yearly' ? 'Month' : 'Day');

export function toCsv(o: ReportOptions): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    [periodColumn(o.kind), `Peak (${o.unit})`, `Average (${o.unit})`, 'Hours at/above warning', 'Hours at/above danger', 'Level', 'Sensor with peak', 'Readings'].map(q).join(','),
    ...o.buckets.map((b) =>
      [b.key, b.peak === null ? '' : num(b.peak, 2), b.avg === null ? '' : num(b.avg, 2), b.warnHours.toFixed(2), b.dangerHours.toFixed(2), LEVEL_LABEL[b.level], b.peakSensor ?? '', b.readings].map(q).join(','),
    ),
  ];
  return lines.join('\r\n');
}

/** A standalone, print-friendly page; the browser's Print dialog can save it as a PDF. */
export function reportHtml(o: ReportOptions): string {
  const s = o.summary;
  const rows = o.buckets
    .map(
      (b) => `<tr>
        <td>${esc(b.label)}</td>
        <td class="n">${num(b.peak)}</td>
        <td class="n">${num(b.avg)}</td>
        <td class="n">${b.level === 'nodata' ? '—' : hours(b.warnHours)}</td>
        <td class="n">${b.level === 'nodata' ? '—' : hours(b.dangerHours)}</td>
        <td><span class="chip" style="background:${LEVEL_COLOR[b.level]}22;color:${b.level === 'warning' ? '#8a5a00' : LEVEL_COLOR[b.level]};border-color:${LEVEL_COLOR[b.level]}">${LEVEL_LABEL[b.level]}</span></td>
        <td>${esc(b.peakSensor ?? '—')}</td>
      </tr>`,
    )
    .join('');
  const highest = s.highest ? `${num(s.highest.peak)} ${esc(o.unit)} (${esc(s.highest.label)}, ${esc(s.highest.peakSensor ?? '')})` : '—';

  return `<!doctype html><html><head><meta charset="utf-8"><title>FloodSense ${periodWord(o.kind)} Flood Report – ${esc(o.range.title)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Segoe UI,Arial,sans-serif;color:#111;margin:32px;max-width:900px}
  h1{margin:0 0 4px;font-size:24px} h2{font-size:16px;margin:28px 0 8px} .muted{color:#555;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}
  .card{border:1px solid #ccd;border-radius:10px;padding:10px 12px}.card b{display:block;font-size:20px;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12.5px} th,td{padding:6px 8px;border-bottom:1px solid #e3e3ea;text-align:left}
  th{background:#f3f5f8} .n{text-align:right;font-variant-numeric:tabular-nums}
  .chip{display:inline-block;border:1px solid;border-radius:99px;padding:1px 9px;font-size:11.5px;font-weight:600}
  .chart{color:#222;border:1px solid #e3e3ea;border-radius:10px;padding:8px}
  footer{margin-top:24px;font-size:11.5px;color:#666}
  @media print{body{margin:12mm} tr,.card{break-inside:avoid}}
</style></head><body>
<h1>${periodWord(o.kind)} Flood Report</h1>
<div class="muted">FloodSense Command Center · Barangay Pamplona 3, Las Piñas City</div>
<div class="muted"><b>Period:</b> ${esc(o.range.title)} &nbsp; <b>Area:</b> ${esc(o.area)} &nbsp; <b>Sensors:</b> ${esc(o.sensorNames.join(', ') || 'none')}</div>
<div class="grid">
  <div class="card">${o.kind === 'yearly' ? 'Months' : 'Days'} with flood levels<b>${s.floodPeriods} of ${s.periodsWithData}</b></div>
  <div class="card">${o.kind === 'yearly' ? 'Months' : 'Days'} at danger level<b>${s.dangerPeriods}</b></div>
  <div class="card">Highest level<b style="font-size:15px">${highest}</b></div>
  <div class="card">Time at/above warning<b>${hours(s.warnHours)}</b></div>
  <div class="card">Time at/above danger<b>${hours(s.dangerHours)}</b></div>
  <div class="card">Average level<b>${num(s.average)} ${esc(o.unit)}</b></div>
</div>
<h2>Peak water level</h2>
<div class="chart">${chartSvg(o.buckets, o.unit, o.warn, o.danger)}</div>
<h2>Details</h2>
<table><thead><tr><th>${periodColumn(o.kind)}</th><th class="n">Peak (${esc(o.unit)})</th><th class="n">Average (${esc(o.unit)})</th><th class="n">At/above warning</th><th class="n">At/above danger</th><th>Level</th><th>Sensor with peak</th></tr></thead><tbody>${rows}</tbody></table>
<footer>Generated ${esc(new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))} by ${esc(o.generatedBy)}. Levels compare each sensor's daily peak with its warning and danger thresholds. Times are estimated from reading intervals.</footer>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script>
</body></html>`;
}
