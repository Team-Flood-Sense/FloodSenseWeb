import { motion, AnimatePresence } from 'motion/react';
import { Search, UserPlus, Upload, Trash2, PauseCircle, PlayCircle, X, AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useEscape } from '@/app/hooks/useEscape';
import { DEFAULT_AREA, SMS_AREAS, formatPhone, isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from '@/lib/alerts';

interface Resident {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  area: string;
  isActive: boolean;
  createdAt: Date;
}

const AREAS = SMS_AREAS.filter((a) => a !== 'All Residents');
const PAGE = 1000;

function toResident(row: any): Resident {
  return {
    id: row.id,
    name: row.name || '',
    phone: row.phone ?? null,
    email: row.email ?? null,
    area: row.area,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
  };
}

// One resident per line: any mix of name, mobile number and email, separated by commas, e.g.
//   Juan Dela Cruz, 0917 123 4567, juan@example.com
//   0917 123 4567
//   maria@example.com
function parseImport(text: string) {
  const valid: { name: string; phone: string | null; email: string | null }[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const parts = line.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean);
    const phoneIdx = parts.findIndex((p) => isValidPhone(p));
    const emailIdx = parts.findIndex((p) => p.includes('@') && isValidEmail(p));
    // A token with an "@" that is not a valid email makes the whole line invalid
    const badEmail = parts.some((p, i) => p.includes('@') && i !== emailIdx);

    if ((phoneIdx === -1 && emailIdx === -1) || badEmail) {
      invalid.push(line);
      continue;
    }

    const phone = phoneIdx === -1 ? null : normalizePhone(parts[phoneIdx]);
    const email = emailIdx === -1 ? null : normalizeEmail(parts[emailIdx]);
    if ((phone && seen.has(phone)) || (email && seen.has(email))) continue;
    if (phone) seen.add(phone);
    if (email) seen.add(email);

    const name = parts.filter((_, i) => i !== phoneIdx && i !== emailIdx).join(' ').trim();
    valid.push({ name, phone, email });
  }
  return { valid, invalid };
}

const inputStyle = {
  background: 'rgba(var(--surface-rgb), 0.6)',
  border: '1px solid rgba(46, 196, 182, 0.2)',
  borderRadius: '12px',
  padding: '10px 14px',
  width: '100%',
  color: 'rgb(var(--ink-rgb))',
  fontSize: '14px',
  outline: 'none',
} as const;

const modalShell = {
  background: 'rgba(var(--surface-rgb), 0.97)',
  borderRadius: '28px',
  boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.25)',
  border: '1px solid rgba(46, 196, 182, 0.2)',
  pointerEvents: 'all',
} as const;

function Modal({ onClose, title, subtitle, children, wide }: {
  onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(11, 60, 93, 0.5)', backdropFilter: 'blur(4px)' }}
      />
      <motion.div
        role="dialog" aria-modal="true" aria-label={title}
        initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ pointerEvents: 'none' }}
      >
        <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'} p-8 relative max-h-[90vh] overflow-y-auto`} style={modalShell}>
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-ink text-xl" style={{ fontWeight: 700 }}>{title}</h3>
              {subtitle && <p className="text-ink/50 text-sm mt-0.5">{subtitle}</p>}
            </div>
            <button type="button" aria-label="Close" onClick={onClose} className="p-2 rounded-xl" style={{ background: 'rgba(var(--ink-rgb), 0.05)' }}>
              <X className="text-ink/60" size={20} />
            </button>
          </div>
          {children}
        </div>
      </motion.div>
    </>
  );
}

export function ResidentsTable() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [notice, setNotice] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [newResident, setNewResident] = useState({ name: '', phone: '', email: '', area: DEFAULT_AREA });
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importArea, setImportArea] = useState(DEFAULT_AREA);
  const [deleting, setDeleting] = useState<Resident | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const closeModals = useCallback(() => {
    setShowAdd(false);
    setShowImport(false);
    setDeleting(null);
    setModalError('');
  }, []);
  useEscape(showAdd || showImport || deleting !== null, closeModals);

  // Supabase returns at most 1000 rows per request, so page through them
  const fetchResidents = useCallback(async () => {
    const all: Resident[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('residents')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        setLoadError('Failed to load residents. Please refresh the page.');
        setLoading(false);
        return;
      }
      all.push(...(data ?? []).map(toResident));
      if (!data || data.length < PAGE) break;
    }
    setLoadError('');
    setResidents(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchResidents();
    const channel = supabase
      .channel('residents-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'residents' }, () => fetchResidents())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchResidents]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return residents;
    // Match numbers typed as 0917..., +63917... or just 917...
    const tail = q.replace(/\D/g, '').replace(/^(63|0)/, '');
    return residents.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.area.toLowerCase().includes(q) ||
      (r.email ?? '').includes(q) ||
      (tail.length >= 3 && (r.phone ?? '').includes(tail))
    );
  }, [residents, searchQuery]);

  const activeCount = residents.filter((r) => r.isActive).length;
  const withPhone = residents.filter((r) => r.isActive && r.phone).length;
  const withEmail = residents.filter((r) => r.isActive && r.email).length;
  const parsed = useMemo(() => parseImport(importText), [importText]);

  async function handleAdd() {
    setModalError('');
    const phoneText = newResident.phone.trim();
    const emailText = newResident.email.trim();
    if (!phoneText && !emailText) {
      setModalError('Enter a mobile number, an email, or both.');
      return;
    }
    if (phoneText && !isValidPhone(phoneText)) {
      setModalError('Enter a valid Philippine mobile number, e.g. 0917 123 4567.');
      return;
    }
    if (emailText && !isValidEmail(emailText)) {
      setModalError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('residents').insert({
      name: newResident.name.trim(),
      phone: phoneText ? normalizePhone(phoneText) : null,
      email: emailText ? normalizeEmail(emailText) : null,
      area: newResident.area,
    });
    setBusy(false);
    if (error) {
      setModalError(error.code === '23505' ? 'This number or email is already in the list.' : 'Failed to add the resident. Please try again.');
      return;
    }
    closeModals();
    setNewResident({ name: '', phone: '', email: '', area: DEFAULT_AREA });
    setNotice('Resident added.');
    fetchResidents();
  }

  async function handleImport() {
    setModalError('');
    if (parsed.valid.length === 0) {
      setModalError('No valid numbers or emails found. Use one resident per line, e.g. "Juan Dela Cruz, 0917 123 4567, juan@example.com".');
      return;
    }
    setBusy(true);
    // Entries already in the list (same number or same email) are skipped, not overwritten
    const { data, error } = await supabase.rpc('import_residents', { rows: parsed.valid, target_area: importArea });
    setBusy(false);
    if (error) {
      setModalError('Import failed. Please try again.');
      return;
    }
    const added = typeof data === 'number' ? data : parsed.valid.length;
    const skipped = parsed.valid.length - added;
    closeModals();
    setImportText('');
    setNotice(`Imported ${added} resident${added === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} already in the list were skipped)` : ''}.`);
    fetchResidents();
  }

  async function toggleActive(r: Resident) {
    const { error } = await supabase.from('residents').update({ is_active: !r.isActive }).eq('id', r.id);
    if (error) setNotice('Could not update that resident.');
    else fetchResidents();
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    const { error } = await supabase.from('residents').delete().eq('id', deleting.id);
    setBusy(false);
    if (error) {
      setModalError('Failed to delete. Please try again.');
      return;
    }
    closeModals();
    setNotice('Resident removed.');
    fetchResidents();
  }

  const th = 'text-left px-8 py-4 text-ink/70 text-sm';

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="relative bg-surface/80 overflow-hidden"
        style={{
          borderRadius: '28px',
          boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.12), 0 8px 32px rgba(var(--shadow-rgb), 0.08)',
          border: '1px solid rgba(var(--surface-rgb), 0.6)',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-surface/50 to-transparent pointer-events-none" style={{ borderRadius: '28px' }} />

        <div className="relative z-10">
          <div className="p-8 border-b border-ink/10">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-ink text-2xl mb-1" style={{ fontWeight: 700 }}>Residents</h3>
                <p className="text-ink/60 text-sm">People who receive SMS and email alerts. Only active, verified residents are contacted.</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setModalError(''); setShowImport(true); }}
                  className="flex items-center gap-2 px-5 py-3 rounded-full text-ink text-sm"
                  style={{ background: 'rgba(var(--ink-rgb), 0.06)', border: '1px solid rgba(var(--ink-rgb), 0.14)', fontWeight: 600 }}
                >
                  <Upload size={18} strokeWidth={2.5} /> Import
                </button>
                <motion.button
                  whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { setModalError(''); setShowAdd(true); }}
                  className="flex items-center gap-2 px-6 py-3 rounded-full"
                  style={{
                    background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)',
                    boxShadow: '0 8px 24px rgba(46, 196, 182, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  <UserPlus className="text-white" size={20} strokeWidth={2.5} />
                  <span className="text-white text-sm" style={{ fontWeight: 600 }}>Add Resident</span>
                </motion.button>
              </div>
            </div>

            <div
              className="relative max-w-md"
              style={{
                background: 'rgba(var(--surface-rgb), 0.6)',
                borderRadius: '20px',
                border: '1px solid rgba(46, 196, 182, 0.15)',
              }}
            >
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" size={20} />
              <input
                type="text"
                aria-label="Search residents"
                placeholder="Search by name, number, email or area..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-transparent text-ink placeholder:text-ink/40 text-sm outline-none"
                style={{ fontWeight: 500 }}
              />
            </div>
          </div>

          {notice && (
            <div role="status" className="mx-8 mt-4 flex items-center justify-between gap-4 px-4 py-3 rounded-2xl text-sm" style={{ background: 'rgba(46, 196, 182, 0.12)', border: '1px solid rgba(46, 196, 182, 0.35)', color: '#2EC4B6', fontWeight: 600 }}>
              <span>{notice}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setNotice('')}><X size={16} /></button>
            </div>
          )}

          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '480px' }}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink/10 bg-ink/[0.04]">
                  <th className={th} style={{ fontWeight: 600 }}>Resident</th>
                  <th className={th} style={{ fontWeight: 600 }}>Contact</th>
                  <th className={th} style={{ fontWeight: 600 }}>Area</th>
                  <th className={th} style={{ fontWeight: 600 }}>Status</th>
                  <th className={th} style={{ fontWeight: 600 }}>Added</th>
                  <th className="text-center px-8 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(loading || loadError || filtered.length === 0) && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-sm" style={{ color: loadError ? '#ef4444' : 'rgba(var(--ink-rgb), 0.4)' }}>
                      {loading ? 'Loading residents...' : loadError ? `⚠ ${loadError}` : residents.length === 0 ? 'No residents yet. Add one or import a list to start sending alerts.' : 'No residents match your search.'}
                    </td>
                  </tr>
                )}
                {!loading && !loadError && filtered.map((r) => (
                  <tr key={r.id} className="border-b border-ink/5 resident-row" style={{ opacity: r.isActive ? 1 : 0.6 }}>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm shrink-0" style={{ background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)', fontWeight: 700 }}>
                          {(r.name || '#').charAt(0).toUpperCase()}
                        </div>
                        <span className="text-ink text-sm" style={{ fontWeight: 600 }}>{r.name || 'Unnamed'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-sm">
                      {r.phone && <div className="text-ink/80" style={{ fontFamily: 'monospace' }}>{formatPhone(r.phone)}</div>}
                      {r.email && <div className="text-ink/60 text-xs break-all">{r.email}</div>}
                    </td>
                    <td className="px-8 py-4 text-ink/70 text-sm">{r.area}</td>
                    <td className="px-8 py-4">
                      <span
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                        style={{
                          background: r.isActive ? 'rgba(46, 196, 182, 0.1)' : 'rgba(107, 114, 128, 0.12)',
                          border: `1px solid ${r.isActive ? 'rgba(46, 196, 182, 0.3)' : 'rgba(107, 114, 128, 0.3)'}`,
                          color: r.isActive ? '#2EC4B6' : '#9CA3AF',
                          fontWeight: 600,
                        }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ background: r.isActive ? '#2EC4B6' : '#6B7280' }} />
                        {r.isActive ? 'Receiving' : 'Paused'}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-ink/60 text-sm">{r.createdAt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-8 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          aria-label={r.isActive ? `Pause alerts for ${r.name || r.phone || r.email}` : `Resume alerts for ${r.name || r.phone || r.email}`}
                          title={r.isActive ? 'Pause alerts' : 'Resume alerts'}
                          onClick={() => toggleActive(r)}
                          className="p-2 rounded-xl text-link"
                          style={{ background: 'rgba(29, 112, 162, 0.1)' }}
                        >
                          {r.isActive ? <PauseCircle size={16} strokeWidth={2.5} /> : <PlayCircle size={16} strokeWidth={2.5} />}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${r.name || r.phone || r.email}`}
                          onClick={() => { setModalError(''); setDeleting(r); }}
                          className="p-2 rounded-xl"
                          style={{ background: 'rgba(255, 107, 53, 0.1)' }}
                        >
                          <Trash2 className="text-[#FF6B35]" size={16} strokeWidth={2.5} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-8 py-5 border-t border-ink/10 bg-surface/40 flex flex-wrap items-center justify-between gap-3">
            <span className="text-ink/60 text-sm">Showing {filtered.length.toLocaleString()} of {residents.length.toLocaleString()} residents</span>
            <div className="flex gap-2">
              <span className="px-3 py-1.5 rounded-full text-xs" style={{ background: 'rgba(46, 196, 182, 0.1)', color: '#2EC4B6', fontWeight: 600 }}>{activeCount.toLocaleString()} receiving</span>
              <span className="px-3 py-1.5 rounded-full text-xs text-ink/70" style={{ background: 'rgba(var(--ink-rgb), 0.08)', fontWeight: 600 }}>{(residents.length - activeCount).toLocaleString()} paused</span>
              <span className="px-3 py-1.5 rounded-full text-xs text-ink/70" style={{ background: 'rgba(var(--ink-rgb), 0.08)', fontWeight: 600 }}>{withPhone.toLocaleString()} with SMS</span>
              <span className="px-3 py-1.5 rounded-full text-xs text-ink/70" style={{ background: 'rgba(var(--ink-rgb), 0.08)', fontWeight: 600 }}>{withEmail.toLocaleString()} with email</span>
            </div>
          </div>
        </div>

        <style>{`.resident-row:hover { background: linear-gradient(90deg, rgba(46,196,182,0.03) 0%, rgba(46,196,182,0.06) 50%, rgba(46,196,182,0.03) 100%); }`}</style>
      </motion.div>

      <AnimatePresence>
        {showAdd && (
          <Modal onClose={closeModals} title="Add Resident" subtitle="They will receive SMS alerts for their area">
            <form onSubmit={(e) => { e.preventDefault(); handleAdd(); }} className="space-y-4">
              <div>
                <label htmlFor="res-name" className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Name (optional)</label>
                <input id="res-name" style={inputStyle} placeholder="e.g. Juan Dela Cruz" value={newResident.name} onChange={(e) => setNewResident({ ...newResident, name: e.target.value })} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="res-phone" className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Mobile number (for SMS)</label>
                <input id="res-phone" style={inputStyle} placeholder="e.g. 0917 123 4567" inputMode="tel" value={newResident.phone} onChange={(e) => setNewResident({ ...newResident, phone: e.target.value })} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="res-email" className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Email (for email alerts)</label>
                <input id="res-email" type="email" style={inputStyle} placeholder="e.g. juan@example.com" value={newResident.email} onChange={(e) => setNewResident({ ...newResident, email: e.target.value })} autoComplete="off" />
                <p className="text-ink/45 text-xs mt-1">Enter a mobile number, an email, or both.</p>
              </div>
              <div>
                <label htmlFor="res-area" className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Area</label>
                <select id="res-area" style={inputStyle} value={newResident.area} onChange={(e) => setNewResident({ ...newResident, area: e.target.value })}>
                  {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {modalError && <p style={{ color: '#ef4444', fontSize: '13px', fontWeight: 500 }}>⚠ {modalError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModals} className="flex-1 py-3 rounded-2xl text-sm text-ink" style={{ background: 'rgba(var(--ink-rgb), 0.05)', border: '1px solid rgba(var(--ink-rgb), 0.1)', fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={busy} className="flex-1 py-3 rounded-2xl text-sm text-white disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)', boxShadow: '0 8px 24px rgba(46, 196, 182, 0.4)', fontWeight: 600 }}>{busy ? 'Adding...' : 'Add Resident'}</button>
              </div>
            </form>
          </Modal>
        )}

        {showImport && (
          <Modal onClose={closeModals} title="Import Residents" subtitle="Paste one resident per line" wide>
            <div className="space-y-4">
              <div>
                <label htmlFor="imp-text" className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Residents</label>
                <textarea
                  id="imp-text"
                  rows={7}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' }}
                  placeholder={'Juan Dela Cruz, 0917 123 4567, juan@example.com\nMaria Santos, +63 918 765 4321\npedro@example.com'}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <p className="text-ink/45 text-xs mt-1">Each line can have a name, a mobile number, an email, or any mix. Numbers: 09XX, +639XX or 9XX. Anyone already in the list is skipped.</p>
              </div>
              <div>
                <label htmlFor="imp-area" className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Area for everyone imported</label>
                <select id="imp-area" style={inputStyle} value={importArea} onChange={(e) => setImportArea(e.target.value)}>
                  {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {importText.trim() && (
                <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(var(--ink-rgb), 0.04)', border: '1px solid rgba(var(--ink-rgb), 0.1)', fontWeight: 600 }}>
                  <span style={{ color: '#2EC4B6' }}>{parsed.valid.length} valid ({parsed.valid.filter((v) => v.phone).length} with SMS, {parsed.valid.filter((v) => v.email).length} with email)</span>
                  {parsed.invalid.length > 0 && (
                    <span style={{ color: '#EF4444' }}> · {parsed.invalid.length} not recognised: <span style={{ fontWeight: 500 }}>{parsed.invalid.slice(0, 3).join(' | ')}{parsed.invalid.length > 3 ? ' …' : ''}</span></span>
                  )}
                </div>
              )}
              {modalError && <p style={{ color: '#ef4444', fontSize: '13px', fontWeight: 500 }}>⚠ {modalError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModals} className="flex-1 py-3 rounded-2xl text-sm text-ink" style={{ background: 'rgba(var(--ink-rgb), 0.05)', border: '1px solid rgba(var(--ink-rgb), 0.1)', fontWeight: 600 }}>Cancel</button>
                <button type="button" onClick={handleImport} disabled={busy || parsed.valid.length === 0} className="flex-1 py-3 rounded-2xl text-sm text-white disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)', boxShadow: '0 8px 24px rgba(46, 196, 182, 0.4)', fontWeight: 600 }}>
                  {busy ? 'Importing...' : `Import ${parsed.valid.length || ''}`.trim()}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {deleting && (
          <Modal onClose={closeModals} title="Remove Resident">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-2xl" style={{ background: 'rgba(255, 107, 53, 0.1)' }}>
                <AlertTriangle className="text-[#FF6B35]" size={32} />
              </div>
            </div>
            <p className="text-ink/70 text-sm text-center mb-6">
              Remove <span className="text-ink" style={{ fontWeight: 700 }}>{deleting.name || (deleting.phone ? formatPhone(deleting.phone) : deleting.email)}</span> from the alert list? They will stop receiving SMS and email alerts. To keep them but stop alerts, use Pause instead.
            </p>
            {modalError && <p className="text-center mb-3" style={{ color: '#ef4444', fontSize: '13px', fontWeight: 500 }}>⚠ {modalError}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={closeModals} className="flex-1 py-3 rounded-2xl text-sm text-ink" style={{ background: 'rgba(var(--ink-rgb), 0.05)', border: '1px solid rgba(var(--ink-rgb), 0.1)', fontWeight: 600 }}>Cancel</button>
              <button type="button" onClick={handleDelete} disabled={busy} className="flex-1 py-3 rounded-2xl text-sm text-white disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)', boxShadow: '0 8px 24px rgba(255, 107, 53, 0.4)', fontWeight: 600 }}>{busy ? 'Removing...' : 'Remove'}</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
