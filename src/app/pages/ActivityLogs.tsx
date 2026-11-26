import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface LogRow {
  id: number;
  actor_id: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  details: Record<string, any>;
  created_at: string;
}

type Person = { name: string; email: string };
type Category = 'all' | 'session' | 'profile' | 'sms_blast';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'all', label: 'All activity' },
  { value: 'session', label: 'Sign-ins and sign-outs' },
  { value: 'profile', label: 'Account changes' },
  { value: 'sms_blast', label: 'Alerts' },
];
const PAGE = 100;
const inputClass = 'bg-ink/5 border border-ink/10 rounded-xl px-3 py-2 text-ink text-sm outline-none focus:border-ink/30';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

/** Turns a log row into a plain sentence. */
function describe(row: LogRow, people: Map<string, Person>): { event: string; info: string } {
  const d = row.details ?? {};
  if (row.resource === 'session') return { event: row.action === 'login' ? 'Signed in' : 'Signed out', info: '' };

  if (row.resource === 'profile') {
    const person = people.get(row.resource_id ?? '');
    const target = person?.name || person?.email || d.email || 'a removed account';
    if (row.action === 'create') return { event: 'Account created', info: `${target}${d.role ? ` as ${d.role}` : ''}` };
    if (row.action === 'delete') return { event: 'Account deleted', info: target };
    if (row.action === 'set-status') {
      const event = d.status === 'Archived' ? 'Account archived' : d.from === 'Archived' ? 'Account restored' : `Account set to ${d.status}`;
      return { event, info: target };
    }
    if (row.action === 'bootstrap-admin') return { event: 'First admin set up', info: target };
    const changes = Object.entries(d)
      .map(([field, c]: [string, any]) => (field === 'avatar' ? 'photo changed' : `${field}: "${c?.from ?? ''}" to "${c?.to ?? ''}"`))
      .join(', ');
    return { event: 'Account updated', info: changes ? `${target} (${changes})` : target };
  }

  const area = d.location ? `${d.location}` : '';
  if (row.action === 'create') return { event: 'Alert created', info: [d.level, area].filter(Boolean).join(' · ') };
  if (row.action === 'delete') return { event: 'Alert deleted', info: [d.level, area, d.message].filter(Boolean).join(' · ') };
  const channel = row.action === 'send-email' ? 'Email' : 'SMS';
  return { event: `${channel} alert ${d.status === 'Failed' ? 'failed' : 'sent'}`, info: [`${d.recipients ?? 0} recipients`, area].filter(Boolean).join(' · ') };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-ink/60" style={{ fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}

export function ActivityLogs() {
  const [category, setCategory] = useState<Category>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [people, setPeople] = useState(new Map<string, Person>());
  const [limit, setLimit] = useState(PAGE);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).order('id', { ascending: false });
    if (category !== 'all') query = query.eq('resource', category);
    // Dates are picked in Philippine time
    if (from) query = query.gte('created_at', `${from}T00:00:00+08:00`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999+08:00`);
    // One extra row tells us whether there are older entries
    const [logs, profiles] = await Promise.all([query.range(0, limit), supabase.from('profiles').select('id, name, email')]);
    if (logs.error) {
      setError('Failed to load the activity logs. Please try again.');
      setRows([]);
      setMore(false);
    } else {
      setError('');
      setRows((logs.data as LogRow[]).slice(0, limit));
      setMore(logs.data.length > limit);
    }
    setPeople(new Map((profiles.data ?? []).map((p) => [p.id, { name: p.name, email: p.email }])));
    setLoading(false);
  }, [category, from, to, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const actor = (row: LogRow) => {
    const p = people.get(row.actor_id ?? '');
    return p ? p.name || p.email : 'System';
  };

  function exportCsv() {
    // Quote every value, and stop spreadsheet programs from running one as a formula
    const q = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
    const lines = [
      ['Date and time', 'User', 'Event', 'Details'].map(q).join(','),
      ...rows.map((r) => {
        const { event, info } = describe(r, people);
        return [when(r.created_at), actor(r), event, info].map(q).join(',');
      }),
    ];
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floodsense-activity.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // A new filter starts again from the first page
  const filter = (set: () => void) => {
    set();
    setLimit(PAGE);
  };

  return (
    <div className="flex-1 pb-2">
      <div className="bg-surface/80 overflow-hidden" style={{ borderRadius: '28px', boxShadow: '0 8px 32px rgba(var(--shadow-rgb), 0.08)', border: '1px solid rgba(var(--surface-rgb), 0.6)' }}>
        <div className="p-6 border-b border-ink/10 flex flex-wrap items-end gap-4">
          <Field label="Show">
            <select className={inputClass} value={category} onChange={(e) => filter(() => setCategory(e.target.value as Category))}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="From">
            <input type="date" className={inputClass} style={{ colorScheme: 'light dark' }} value={from} max={to || undefined} onChange={(e) => filter(() => setFrom(e.target.value))} />
          </Field>
          <Field label="To">
            <input type="date" className={inputClass} style={{ colorScheme: 'light dark' }} value={to} min={from || undefined} onChange={(e) => filter(() => setTo(e.target.value))} />
          </Field>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-ink bg-ink/5 hover:bg-ink/10 disabled:opacity-40" style={{ fontWeight: 600 }}>
              <RefreshCw size={16} /> Refresh
            </button>
            <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-ink bg-ink/5 hover:bg-ink/10 disabled:opacity-40" style={{ fontWeight: 600 }}>
              <Download size={16} /> CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '560px' }}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.04]">
                {['Date and time', 'User', 'Event', 'Details'].map((h) => (
                  <th key={h} className="text-left px-6 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const { event, info } = describe(r, people);
                return (
                  <tr key={r.id} className="border-b border-ink/5">
                    <td className="px-6 py-3 text-ink/70 text-sm whitespace-nowrap">{when(r.created_at)}</td>
                    <td className="px-6 py-3 text-ink text-sm" style={{ fontWeight: 600 }}>{actor(r)}</td>
                    <td className="px-6 py-3 text-ink text-sm whitespace-nowrap">{event}</td>
                    <td className="px-6 py-3 text-ink/70 text-sm break-words" style={{ minWidth: '220px' }}>{info || '—'}</td>
                  </tr>
                );
              })}
              {(loading || error || rows.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm" style={{ color: error ? '#ef4444' : 'rgba(var(--ink-rgb), 0.55)' }}>
                    {loading ? 'Loading…' : error ? `⚠ ${error}` : 'No activity matches these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-ink/10 flex flex-wrap items-center justify-between gap-3">
          <span className="text-ink/60 text-sm">Showing {rows.length} entries (CSV exports what is shown)</span>
          {more && (
            <button type="button" onClick={() => setLimit((n) => Math.min(n + PAGE, 999))} disabled={loading || limit >= 999} className="px-4 py-2 rounded-xl text-sm text-ink bg-ink/5 hover:bg-ink/10 disabled:opacity-40" style={{ fontWeight: 600 }}>
              {limit >= 999 ? 'Use the date filters to see older entries' : 'Load older entries'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
