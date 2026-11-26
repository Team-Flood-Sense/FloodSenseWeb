// Water levels are stored in centimetres (that is what the sensors send) and shown to people
// in feet and inches. Readings in any other unit are shown unchanged.

export type WaterLevel = 'normal' | 'warning' | 'danger';

/** What people see. The database calls the highest level "danger"; the website calls it "Critical". */
export const WATER_LABEL: Record<WaterLevel, string> = { normal: 'Normal', warning: 'Warning', danger: 'Critical' };
export const WATER_COLOR: Record<WaterLevel, string> = { normal: '#2EC4B6', warning: '#FFB84D', danger: '#DC2626' };

export const CM_PER_INCH = 2.54;

export const classify = (value: number, warn: number, danger: number): WaterLevel =>
  value >= danger ? 'danger' : value >= warn ? 'warning' : 'normal';

/** 38.1 -> "1 ft 3 in". Inches keep one decimal so a reading just under a threshold doesn't round up to it. */
export function formatLevel(value: number | null, unit = 'cm'): string {
  if (value === null) return '—';
  if (unit !== 'cm') return `${Number(value.toFixed(1))} ${unit}`;
  const tenths = Math.round((Math.abs(value) / CM_PER_INCH) * 10);
  const sign = value < 0 && tenths > 0 ? '-' : '';
  const feet = Math.floor(tenths / 120);
  const inches = (tenths - feet * 120) / 10;
  if (feet === 0) return `${sign}${inches} in`;
  return inches === 0 ? `${sign}${feet} ft` : `${sign}${feet} ft ${inches} in`;
}

/** The three status ranges for a sensor with these thresholds. */
export function levelRanges(warn: number, danger: number, unit = 'cm'): { level: WaterLevel; text: string }[] {
  return [
    { level: 'normal', text: `Below ${formatLevel(warn, unit)}` },
    { level: 'warning', text: `${formatLevel(warn, unit)} to below ${formatLevel(danger, unit)}` },
    { level: 'danger', text: `${formatLevel(danger, unit)} and above` },
  ];
}
