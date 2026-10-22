import { motion, AnimatePresence } from 'motion/react';
import { Search, Calendar, Send, Cpu, User, AlertCircle, Info, AlertTriangle, X, MapPin, Clock, Users, Trash2, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CHANNEL_LABEL, SMS_AREAS, countAppDevices, countRecipients, sendBlast, summarizeResult, type BlastLevel, type Channel } from '@/lib/alerts';
import { useEscape } from '@/app/hooks/useEscape';
import { useAuth } from '@/context/AuthContext';

interface SMSBlast {
  id: string;
  displayId: string;
  createdAt: Date;
  timestamp: string;
  message: string;
  recipients: number;
  status: 'Pending' | 'Sending' | 'Sent' | 'Delivered' | 'Failed' | 'Skipped';
  level: 'CRITICAL' | 'WARNING' | 'INFO';
  triggerSource: 'System' | 'Manual';
  triggeredBy: string;
  location: string;
  errorMessage: string | null;
  sendSms: boolean;
  sendEmail: boolean;
  emailSubject: string | null;
  emailStatus: 'Pending' | 'Sending' | 'Sent' | 'Failed' | null;
  emailRecipients: number;
  emailError: string | null;
  sendApp: boolean;
  appStatus: 'Pending' | 'Sent' | 'Failed' | null;
  appRecipients: number;
  appError: string | null;
}

const MAX_CHARS = 160;
// Two concatenated SMS segments; matches the database check (480 incl. margin)
const HARD_LIMIT = 306;
// Matches the database limit on the message column
const EMAIL_LIMIT = 480;

function toBlast(row: any): SMSBlast {
  const createdAt = new Date(row.created_at);
  return {
    id: row.id,
    displayId: `BL-${String(row.id).slice(0, 8).toUpperCase()}`,
    createdAt,
    timestamp: createdAt.toLocaleString('en-PH', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }),
    message: row.message,
    recipients: row.recipients ?? 0,
    status: row.status,
    level: row.level,
    triggerSource: row.trigger_source,
    triggeredBy: row.triggered_by_name || (row.trigger_source === 'System' ? 'Auto-Detection' : 'Unknown'),
    location: row.location,
    errorMessage: row.error_message ?? null,
    sendSms: row.send_sms ?? true,
    sendEmail: row.send_email ?? false,
    emailSubject: row.email_subject ?? null,
    emailStatus: row.email_status ?? null,
    emailRecipients: row.email_recipients ?? 0,
    emailError: row.email_error ?? null,
    sendApp: row.send_app ?? false,
    appStatus: row.app_status ?? null,
    appRecipients: row.app_recipients ?? 0,
    appError: row.app_error ?? null,
  };
}

/** The channels a blast used, with each one's status. */
function channelStatuses(b: SMSBlast): { channel: Channel; status: string; count: number }[] {
  const list: { channel: Channel; status: string; count: number }[] = [];
  if (b.sendSms) list.push({ channel: 'sms', status: b.status, count: b.recipients });
  if (b.sendEmail && b.emailStatus) list.push({ channel: 'email', status: b.emailStatus, count: b.emailRecipients });
  if (b.sendApp && b.appStatus) list.push({ channel: 'app', status: b.appStatus, count: b.appRecipients });
  return list;
}

/** Nothing reached anyone on any channel the blast used, so it is safe to delete. */
const isAllFailed = (b: SMSBlast) =>
  (b.status === 'Failed' || b.status === 'Skipped') &&
  (b.emailStatus === null || b.emailStatus === 'Failed') &&
  (b.appStatus === null || b.appStatus === 'Failed');

/**
 * Admins can delete any alert that isn't mid-send; operators only alerts where nothing was
 * delivered. (The database enforces the same rules, so this just decides which controls to show.)
 */
function canDeleteAlert(b: SMSBlast, role: string | null) {
  const sending = b.status === 'Sending' || b.emailStatus === 'Sending';
  const stale = Date.now() - b.createdAt.getTime() > 10 * 60 * 1000;
  if (sending && !stale) return false;
  return role === 'admin' || (role === 'operator' && isAllFailed(b));
}

// YYYY-MM-DD in local time, to compare with <input type="date">
function localDateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const getLevelStyle = (level: string) => {
  switch (level) {
    case 'CRITICAL':
      return {
        background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.15) 0%, rgba(220, 38, 38, 0.08) 100%)',
        border: '1px solid rgba(220, 38, 38, 0.3)',
        color: '#DC2626',
        icon: AlertCircle,
        glow: '0 0 16px rgba(220, 38, 38, 0.3)',
      };
    case 'WARNING':
      return {
        background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.15) 0%, rgba(255, 107, 53, 0.08) 100%)',
        border: '1px solid rgba(255, 107, 53, 0.3)',
        color: '#FF6B35',
        icon: AlertTriangle,
        glow: '0 0 16px rgba(255, 107, 53, 0.3)',
      };
    case 'INFO':
      return {
        background: 'linear-gradient(135deg, rgba(46, 196, 182, 0.15) 0%, rgba(46, 196, 182, 0.08) 100%)',
        border: '1px solid rgba(46, 196, 182, 0.3)',
        color: '#2EC4B6',
        icon: Info,
        glow: '0 0 16px rgba(46, 196, 182, 0.3)',
      };
    default:
      return {
        background: 'linear-gradient(135deg, rgba(var(--ink-rgb), 0.15) 0%, rgba(var(--ink-rgb), 0.08) 100%)',
        border: '1px solid rgba(var(--ink-rgb), 0.3)',
        color: 'rgb(var(--ink-rgb))',
        icon: Info,
        glow: '0 0 16px rgba(var(--shadow-rgb), 0.3)',
      };
  }
};

const getStatusStyle = (status: string) => {
  switch (status) {
    case 'Sending':
      return { background: 'rgba(29, 112, 162, 0.12)', border: '1px solid rgba(29, 112, 162, 0.35)', color: 'var(--link)' };
    case 'Sent':
    case 'Delivered':
      return { background: 'rgba(46, 196, 182, 0.1)', border: '1px solid rgba(46, 196, 182, 0.3)', color: '#2EC4B6' };
    case 'Pending':
      return { background: 'rgba(255, 184, 77, 0.1)', border: '1px solid rgba(255, 184, 77, 0.3)', color: '#FFB84D' };
    case 'Failed':
      return { background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)', color: '#DC2626' };
    default:
      return { background: 'rgba(var(--ink-rgb), 0.1)', border: '1px solid rgba(var(--ink-rgb), 0.3)', color: 'rgb(var(--ink-rgb))' };
  }
};

function ChannelChip({ channel, status }: { channel: Channel; status: string }) {
  const style = getStatusStyle(status);
  const Icon = channel === 'sms' ? MessageSquare : channel === 'email' ? Mail : Smartphone;
  const busy = status === 'Pending' || status === 'Sending';
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={style}
      title={`${CHANNEL_LABEL[channel]}: ${status}`}
    >
      <Icon size={12} strokeWidth={2.5} />
      <span className="text-xs" style={{ fontWeight: 600, animation: busy ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none' }}>
        {status}
      </span>
    </div>
  );
}

export function SMSBlastTable() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [blasts, setBlasts] = useState<SMSBlast[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState('');
  const [counts, setCounts] = useState<{ sms: number | null; email: number | null; app: number | null }>({ sms: null, email: null, app: null });
  const [channels, setChannels] = useState<{ sms: boolean; email: boolean; app: boolean }>({ sms: true, email: false, app: false });
  const [subject, setSubject] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'warn' | 'error'; text: string } | null>(null);

  // Compose modal
  const [showComposeModal, setShowComposeModal] = useState(false);
  const { role } = useAuth();
  // Rows ticked for bulk delete
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // What is waiting for delete confirmation: one alert, the ticked ones, or every failed one
  const [deleteTarget, setDeleteTarget] = useState<SMSBlast | 'selected' | 'failed' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [newBlast, setNewBlast] = useState<{ level: BlastLevel; location: string; message: string }>({ level: 'INFO', location: '', message: '' });

  // View Details modal
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedBlast, setSelectedBlast] = useState<SMSBlast | null>(null);

  // ✅ Load blasts from Supabase and keep them live with Realtime
  const fetchBlasts = useCallback(async () => {
    const { data, error } = await supabase
      .from('sms_blasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      setLoadError('Failed to load SMS blast logs. Please refresh the page.');
    } else {
      setLoadError('');
      setBlasts((data ?? []).map(toBlast));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBlasts();
    const channel = supabase
      .channel('sms-blasts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_blasts' }, () => {
        fetchBlasts();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchBlasts]);

  const closeModals = useCallback(() => {
    setShowDetailsModal(false);
    setShowComposeModal(false);
  }, []);
  const closeDelete = useCallback(() => {
    setDeleteTarget(null);
    setDeleteError('');
  }, []);
  useEscape(showDetailsModal || showComposeModal, closeModals);
  useEscape(deleteTarget !== null, closeDelete);

  const failedCount = blasts.filter(isAllFailed).length;

  // Forget ticked rows that no longer exist (deleted, or removed by someone else)
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(blasts.map((b) => b.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [blasts]);

  const deliveredInDelete =
    deleteTarget === null || deleteTarget === 'failed'
      ? 0
      : deleteTarget === 'selected'
      ? blasts.filter((b) => selected.has(b.id) && !isAllFailed(b)).length
      : isAllFailed(deleteTarget) ? 0 : 1;

  // The database decides what may actually be deleted; the count tells us if anything was skipped
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');

    const base = supabase.from('sms_blasts').delete();
    let requested: number;
    let q;
    if (deleteTarget === 'failed') {
      q = base.in('status', ['Failed', 'Skipped']).or('email_status.is.null,email_status.eq.Failed');
      requested = failedCount;
    } else if (deleteTarget === 'selected') {
      q = base.in('id', [...selected]);
      requested = selected.size;
    } else {
      q = base.eq('id', deleteTarget.id);
      requested = 1;
    }
    const { data, error } = await q.select('id');
    setDeleting(false);

    if (error) {
      setDeleteError('Failed to delete. Please try again.');
      return;
    }
    const n = data?.length ?? 0;
    setDeleteTarget(null);
    setSelected(new Set());
    setNotice(
      n === 0
        ? { tone: 'warn', text: 'Nothing was deleted. Alerts that are still sending, or that only an admin may delete, are kept.' }
        : n < requested
        ? { tone: 'warn', text: `Deleted ${n} of ${requested} alerts. The rest are still sending or can only be deleted by an admin.` }
        : { tone: 'success', text: `Deleted ${n} alert${n === 1 ? '' : 's'}.` },
    );
    fetchBlasts();
  }

  useEffect(() => {
    if (!showComposeModal || !newBlast.location) {
      setCounts({ sms: null, email: null, app: null });
      return;
    }
    let cancelled = false;
    setCounts({ sms: null, email: null, app: null });
    Promise.all([
      countRecipients(newBlast.location, 'sms'),
      countRecipients(newBlast.location, 'email'),
      countAppDevices(),
    ]).then(([sms, email, app]) => {
      if (!cancelled) setCounts({ sms, email, app });
    });
    return () => {
      cancelled = true;
    };
  }, [showComposeModal, newBlast.location]);

  const reach = (channels.sms ? counts.sms ?? 0 : 0) + (channels.email ? counts.email ?? 0 : 0);
  const countsReady = counts.sms !== null && counts.email !== null;
  const messageLimit = channels.sms ? HARD_LIMIT : EMAIL_LIMIT;
  const counterLimit = channels.sms ? MAX_CHARS : EMAIL_LIMIT;

  const query = searchQuery.toLowerCase();
  const filteredBlasts = blasts.filter(blast =>
    (!selectedDate || localDateKey(blast.createdAt) === selectedDate) &&
    (blast.message.toLowerCase().includes(query) ||
      blast.location.toLowerCase().includes(query) ||
      blast.triggeredBy.toLowerCase().includes(query))
  );

  const deletable = filteredBlasts.filter((b) => canDeleteAlert(b, role));
  const allTicked = deletable.length > 0 && deletable.every((b) => selected.has(b.id));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allTicked ? new Set() : new Set(deletable.map((b) => b.id)));

  async function handleSendBlast() {
    setComposeError('');
    const message = newBlast.message.trim();
    if (!channels.sms && !channels.email && !channels.app) {
      setComposeError('Select at least one channel: SMS, Email or App.');
      return;
    }
    if (!newBlast.location) {
      setComposeError('Please select a target location.');
      return;
    }
    if (!message) {
      setComposeError('Please enter a message.');
      return;
    }
    if (message.length > messageLimit) {
      setComposeError(`Message is too long (max ${messageLimit} characters${channels.sms ? ' for SMS' : ''}).`);
      return;
    }
    if (channels.sms && counts.sms === 0) {
      setComposeError('No active, verified residents with a mobile number in this area. Add residents or untick SMS.');
      return;
    }
    if (channels.email && counts.email === 0) {
      setComposeError('No active, verified residents with an email in this area. Add emails or untick Email.');
      return;
    }

    setSending(true);
    try {
      const result = await sendBlast({
        message,
        level: newBlast.level,
        location: newBlast.location,
        sms: channels.sms,
        email: channels.email,
        app: channels.app,
        subject,
      });
      setShowComposeModal(false);
      setNewBlast({ level: 'INFO', location: '', message: '' });
      setSubject('');
      setNotice(summarizeResult(result));
      fetchBlasts();
    } catch (err) {
      setComposeError((err as Error).message);
    } finally {
      setSending(false);
    }
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
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative bg-surface/80 overflow-hidden"
        style={{
          borderRadius: '28px',
          boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.12), 0 8px 32px rgba(var(--shadow-rgb), 0.08)',
          border: '1px solid rgba(var(--surface-rgb), 0.6)',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-surface/50 to-transparent pointer-events-none" style={{ borderRadius: '28px' }} />

        <div className="relative z-10">
          {/* Header */}
          <div className="p-8 border-b border-ink/10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-ink text-2xl mb-1" style={{ fontWeight: 700 }}>Alert Logs</h3>
                <p className="text-ink/60 text-sm">Audit trail of every SMS, email and app alert</p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setComposeError(''); setShowComposeModal(true); }}
                className="flex items-center gap-2 px-6 py-3 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)',
                  boxShadow: '0 8px 24px rgba(46, 196, 182, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                <Send className="text-white" size={20} strokeWidth={2.5} />
                <span className="text-white text-sm" style={{ fontWeight: 600 }}>Compose Alert</span>
              </motion.button>
            </div>

            {/* Control Bar */}
            <div className="flex items-center gap-4">
              <div
                className="relative flex-1"
                style={{
                  background: 'rgba(var(--surface-rgb), 0.6)',
                  borderRadius: '20px',
                  boxShadow: 'inset 0 0 1px 1px rgba(46, 196, 182, 0.2), 0 4px 16px rgba(var(--shadow-rgb), 0.05)',
                  border: '1px solid rgba(46, 196, 182, 0.15)',
                }}
              >
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-ink/40" size={20} />
                <input
                  type="text"
                  placeholder="Search by message, location, or user..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-transparent text-ink placeholder:text-ink/40 text-sm outline-none"
                  style={{ fontWeight: 500 }}
                />
              </div>
              <div
                className="relative"
                style={{
                  background: 'rgba(var(--surface-rgb), 0.6)',
                  borderRadius: '20px',
                  boxShadow: 'inset 0 0 1px 1px rgba(46, 196, 182, 0.2), 0 4px 16px rgba(var(--shadow-rgb), 0.05)',
                  border: '1px solid rgba(46, 196, 182, 0.15)',
                }}
              >
                <Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 text-ink/40" size={20} />
                <input
                  type="date"
                  aria-label="Filter by date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="pl-12 pr-4 py-3 bg-transparent text-ink text-sm outline-none"
                  style={{ fontWeight: 500, minWidth: '200px' }}
                />
              </div>
            </div>
          </div>

          {notice && (
            <div
              role="status"
              className="mx-8 mt-4 flex items-start justify-between gap-4 px-4 py-3 rounded-2xl text-sm"
              style={{
                background: notice.tone === 'success' ? 'rgba(46, 196, 182, 0.12)' : notice.tone === 'warn' ? 'rgba(255, 184, 77, 0.14)' : 'rgba(220, 38, 38, 0.1)',
                border: `1px solid ${notice.tone === 'success' ? 'rgba(46, 196, 182, 0.35)' : notice.tone === 'warn' ? 'rgba(255, 184, 77, 0.4)' : 'rgba(220, 38, 38, 0.3)'}`,
                color: notice.tone === 'success' ? '#2EC4B6' : notice.tone === 'warn' ? '#E0A030' : '#EF4444',
                fontWeight: 600,
              }}
            >
              <span>{notice.text}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="shrink-0 opacity-70 hover:opacity-100">
                <X size={16} />
              </button>
            </div>
          )}

          {selected.size > 0 && (
            <div
              className="mx-8 mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl text-sm"
              style={{ background: 'rgba(var(--ink-rgb), 0.05)', border: '1px solid rgba(var(--ink-rgb), 0.12)' }}
            >
              <span className="text-ink" style={{ fontWeight: 600 }}>{selected.size} selected</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="px-4 py-1.5 rounded-full text-xs text-ink"
                  style={{ background: 'rgba(var(--ink-rgb), 0.06)', border: '1px solid rgba(var(--ink-rgb), 0.12)', fontWeight: 600 }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteError(''); setDeleteTarget('selected'); }}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs"
                  style={{ background: 'rgba(255, 107, 53, 0.12)', border: '1px solid rgba(255, 107, 53, 0.35)', color: '#FF6B35', fontWeight: 700 }}
                >
                  <Trash2 size={14} strokeWidth={2.5} />
                  Delete selected
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '480px' }}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink/10 bg-ink/[0.04]">
                  <th className="pl-8 pr-0 py-4 w-6">
                    {deletable.length > 0 && (
                      <input
                        type="checkbox"
                        aria-label="Select all deletable alerts"
                        checked={allTicked}
                        onChange={toggleAll}
                        className="w-4 h-4 cursor-pointer accent-[#2EC4B6]"
                      />
                    )}
                  </th>
                  <th className="text-left px-8 py-4 text-ink/70 text-xs" style={{ fontWeight: 600 }}>BLAST ID</th>
                  <th className="text-left px-8 py-4 text-ink/70 text-xs" style={{ fontWeight: 600 }}>TIMESTAMP</th>
                  <th className="text-left px-8 py-4 text-ink/70 text-xs" style={{ fontWeight: 600 }}>MESSAGE</th>
                  <th className="text-left px-8 py-4 text-ink/70 text-xs" style={{ fontWeight: 600 }}>RECIPIENTS</th>
                  <th className="text-left px-8 py-4 text-ink/70 text-xs" style={{ fontWeight: 600 }}>LEVEL</th>
                  <th className="text-left px-8 py-4 text-ink/70 text-xs" style={{ fontWeight: 600 }}>TRIGGER</th>
                  <th className="text-left px-8 py-4 text-ink/70 text-xs" style={{ fontWeight: 600 }}>STATUS</th>
                  <th className="text-left px-8 py-4 text-ink/70 text-xs" style={{ fontWeight: 600 }}>LOCATION</th>
                  <th className="text-center px-8 py-4 text-ink/70 text-xs" style={{ fontWeight: 600 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {(loading || loadError || filteredBlasts.length === 0) && (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-sm" style={{ color: loadError ? '#ef4444' : 'rgba(var(--ink-rgb), 0.4)' }}>
                      {loading ? 'Loading alert logs...' : loadError ? `⚠ ${loadError}` : 'No alerts found.'}
                    </td>
                  </tr>
                )}
                {!loading && !loadError && filteredBlasts.map((blast, index) => {
                  const levelStyle = getLevelStyle(blast.level);
                  const LevelIcon = levelStyle.icon;
                  return (
                    <motion.tr
                      key={blast.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}
                      className="border-b border-ink/5 sms-row group"
                      style={{ transition: 'all 0.3s ease' }}
                      onClick={() => {
                        setSelectedBlast(blast);
                        setShowDetailsModal(true);
                      }}
                    >
                      <td className="pl-8 pr-0 py-4 w-6" onClick={(e) => e.stopPropagation()}>
                        {canDeleteAlert(blast, role) && (
                          <input
                            type="checkbox"
                            aria-label={`Select alert ${blast.displayId}`}
                            checked={selected.has(blast.id)}
                            onChange={() => toggleOne(blast.id)}
                            className="w-4 h-4 cursor-pointer accent-[#2EC4B6]"
                          />
                        )}
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-ink text-xs" style={{ fontWeight: 700, fontFamily: 'monospace' }}>{blast.displayId}</span>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-ink/70 text-xs" style={{ fontFamily: 'monospace' }}>{blast.timestamp}</span>
                      </td>
                      <td className="px-8 py-4" style={{ maxWidth: '300px' }}>
                        <div className="text-ink text-xs line-clamp-2" style={{ fontWeight: 500 }}>{blast.message}</div>
                        <span className="text-[#2EC4B6] text-xs mt-0.5 block" style={{ fontWeight: 600 }}>Click to view full message</span>
                      </td>
                      <td className="px-8 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                          {channelStatuses(blast).map(({ channel, status, count }) => (
                            <div key={channel} className="px-3 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: 'rgba(var(--ink-rgb), 0.08)', border: '1px solid rgba(var(--ink-rgb), 0.15)' }}>
                              <span className="text-ink/50 text-xs" style={{ fontWeight: 600 }}>{CHANNEL_LABEL[channel]}</span>
                              <span className="text-ink text-xs" style={{ fontWeight: 700 }}>{status === 'Pending' || status === 'Sending' ? '—' : count.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ ...levelStyle, boxShadow: levelStyle.glow, fontWeight: 700 }}>
                          <LevelIcon size={14} strokeWidth={3} />
                          <span className="text-xs">{blast.level}</span>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="p-2 rounded-xl"
                            style={{
                              background: blast.triggerSource === 'System'
                                ? 'linear-gradient(135deg, rgba(46, 196, 182, 0.1) 0%, rgba(46, 196, 182, 0.05) 100%)'
                                : 'linear-gradient(135deg, rgba(29, 112, 162, 0.1) 0%, rgba(29, 112, 162, 0.05) 100%)',
                              boxShadow: blast.triggerSource === 'System'
                                ? '0 2px 8px rgba(46, 196, 182, 0.15), inset 0 1px 2px rgba(var(--surface-rgb), 0.8)'
                                : '0 2px 8px rgba(29, 112, 162, 0.15), inset 0 1px 2px rgba(var(--surface-rgb), 0.8)',
                            }}
                          >
                            {blast.triggerSource === 'System'
                              ? <Cpu className="text-[#2EC4B6]" size={16} strokeWidth={2.5} />
                              : <User className="text-link" size={16} strokeWidth={2.5} />
                            }
                          </div>
                          <div className="flex flex-col">
                            <span className="text-ink text-xs" style={{ fontWeight: 600 }}>{blast.triggerSource}</span>
                            <span className="text-ink/60 text-xs">{blast.triggeredBy}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                          {channelStatuses(blast).map(({ channel, status }) => (
                            <ChannelChip key={channel} channel={channel} status={status} />
                          ))}
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-ink/70 text-xs">{blast.location}</span>
                      </td>
                      <td className="px-8 py-4 text-center">
                        {canDeleteAlert(blast, role) && (
                          <button
                            type="button"
                            aria-label={`Delete alert ${blast.displayId}`}
                            title="Delete this alert"
                            onClick={(e) => { e.stopPropagation(); setDeleteError(''); setDeleteTarget(blast); }}
                            className="p-2 rounded-xl"
                            style={{ background: 'rgba(255, 107, 53, 0.1)' }}
                          >
                            <Trash2 className="text-[#FF6B35]" size={16} strokeWidth={2.5} />
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer Stats */}
          <div className="px-8 py-5 border-t border-ink/10 bg-surface/40">
            <div className="flex items-center justify-between">
              <span className="text-ink/60 text-sm">
                Showing {filteredBlasts.length} of {blasts.length} blast logs
              </span>
              {failedCount > 0 && (
                <button
                  type="button"
                  onClick={() => { setDeleteError(''); setDeleteTarget('failed'); }}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs"
                  style={{ background: 'rgba(255, 107, 53, 0.1)', border: '1px solid rgba(255, 107, 53, 0.3)', color: '#FF6B35', fontWeight: 700 }}
                >
                  <Trash2 size={14} strokeWidth={2.5} />
                  Delete {failedCount} failed
                </button>
              )}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(220, 38, 38, 0.1)' }}>
                  <div className="w-2 h-2 rounded-full bg-[#DC2626]" />
                  <span className="text-xs text-[#DC2626]" style={{ fontWeight: 600 }}>{blasts.filter(b => b.level === 'CRITICAL').length} Critical</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255, 107, 53, 0.1)' }}>
                  <div className="w-2 h-2 rounded-full bg-[#FF6B35]" />
                  <span className="text-xs text-[#FF6B35]" style={{ fontWeight: 600 }}>{blasts.filter(b => b.level === 'WARNING').length} Warning</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(46, 196, 182, 0.1)' }}>
                  <div className="w-2 h-2 rounded-full bg-[#2EC4B6]" />
                  <span className="text-xs text-[#2EC4B6]" style={{ fontWeight: 600 }}>{blasts.filter(b => b.level === 'INFO').length} Info</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          .sms-row { cursor: pointer; }
          .sms-row:hover {
            background: linear-gradient(90deg, rgba(29, 112, 162, 0.04) 0%, rgba(29, 112, 162, 0.08) 50%, rgba(29, 112, 162, 0.04) 100%);
            box-shadow: inset 0 1px 2px rgba(29, 112, 162, 0.15);
          }
          .line-clamp-2 {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
        `}</style>
      </motion.div>

      {/* ===================== DELETE ALERTS MODAL ===================== */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeDelete}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(11, 60, 93, 0.5)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              role="dialog" aria-modal="true" aria-label="Delete failed blasts"
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ pointerEvents: 'none' }}
            >
              <div
                className="w-full max-w-sm p-8 relative"
                style={{
                  background: 'rgba(var(--surface-rgb), 0.97)',
                  borderRadius: '28px',
                  boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.25)',
                  border: '1px solid rgba(255, 107, 53, 0.25)',
                  pointerEvents: 'all',
                }}
              >
                <div className="flex justify-center mb-4">
                  <div className="p-4 rounded-2xl" style={{ background: 'rgba(255, 107, 53, 0.1)' }}>
                    <AlertTriangle className="text-[#FF6B35]" size={32} strokeWidth={2} />
                  </div>
                </div>
                <h3 className="text-ink text-xl text-center mb-2" style={{ fontWeight: 700 }}>
                  {deleteTarget === 'failed' ? 'Delete All Failed Alerts' : deleteTarget === 'selected' ? 'Delete Selected Alerts' : 'Delete Alert'}
                </h3>
                <p className="text-ink/60 text-sm text-center mb-2">
                  {deleteTarget === 'failed'
                    ? `Delete all ${failedCount} failed alert${failedCount === 1 ? '' : 's'} from the log?`
                    : deleteTarget === 'selected'
                    ? `Delete the ${selected.size} selected alert${selected.size === 1 ? '' : 's'} from the log?`
                    : `Delete alert ${deleteTarget.displayId} from the log?`}
                </p>
                <p className="text-ink/45 text-xs text-center mb-6">
                  {deliveredInDelete > 0
                    ? `${deliveredInDelete} of these ${deliveredInDelete === 1 ? 'was' : 'were'} delivered to residents. Deleting only removes the entry from this log; the audit log keeps a record of who sent it and who deleted it.`
                    : 'Nothing was delivered for these. Each deletion is recorded in the audit log.'}
                </p>
                {deleteError && (
                  <p className="text-center mb-3" style={{ color: '#ef4444', fontSize: '13px', fontWeight: 500 }}>⚠ {deleteError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeDelete}
                    className="flex-1 py-3 rounded-2xl text-sm text-ink"
                    style={{ background: 'rgba(var(--ink-rgb), 0.05)', border: '1px solid rgba(var(--ink-rgb), 0.1)', fontWeight: 600 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-3 rounded-2xl text-sm text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)', boxShadow: '0 8px 24px rgba(255, 107, 53, 0.4)', fontWeight: 600 }}
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===================== VIEW DETAILS MODAL ===================== */}
      <AnimatePresence>
        {showDetailsModal && selectedBlast && (() => {
          const levelStyle = getLevelStyle(selectedBlast.level);
          const LevelIcon = levelStyle.icon;
          return (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowDetailsModal(false)}
                className="fixed inset-0 z-40"
                style={{ background: 'rgba(var(--ink-rgb), 0.5)', backdropFilter: 'blur(4px)' }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ pointerEvents: 'none' }}
              >
                <div
                  className="w-full max-w-lg p-8 relative"
                  style={{
                    background: 'rgba(var(--surface-rgb), 0.95)',
                    borderRadius: '28px',
                    boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.2)',
                    border: `1px solid ${levelStyle.color}33`,
                    pointerEvents: 'all',
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl" style={{ background: levelStyle.background, border: levelStyle.border }}>
                        <LevelIcon style={{ color: levelStyle.color }} size={20} strokeWidth={2.5} />
                      </div>
                      <div>
                        <h3 className="text-ink text-xl" style={{ fontWeight: 700 }}>Blast Details</h3>
                        <p className="text-ink/50 text-xs mt-0.5" style={{ fontFamily: 'monospace' }}>{selectedBlast.displayId}</p>
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowDetailsModal(false)}
                      className="p-2 rounded-xl"
                      style={{ background: 'rgba(var(--ink-rgb), 0.05)' }}
                    >
                      <X className="text-ink/60" size={20} />
                    </motion.button>
                  </div>

                  {/* Full Message */}
                  <div
                    className="p-4 rounded-2xl mb-5"
                    style={{ background: levelStyle.background, border: levelStyle.border }}
                  >
                    <p className="text-xs mb-2" style={{ color: levelStyle.color, fontWeight: 700 }}>
                      FULL MESSAGE
                    </p>
                    <p className="text-ink text-sm leading-relaxed">
                      {selectedBlast.message}
                    </p>
                  </div>

                  {(selectedBlast.errorMessage || selectedBlast.emailError || selectedBlast.appError) && (
                    <div className="p-3 rounded-2xl mb-5 text-xs" style={{ background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)', color: '#EF4444', fontWeight: 600 }}>
                      {selectedBlast.errorMessage && <div>SMS: {selectedBlast.errorMessage}</div>}
                      {selectedBlast.emailError && <div>Email: {selectedBlast.emailError}</div>}
                      {selectedBlast.appError && <div>App: {selectedBlast.appError}</div>}
                    </div>
                  )}

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-3">

                    {/* Timestamp */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(var(--ink-rgb), 0.03)', border: '1px solid rgba(var(--ink-rgb), 0.08)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Clock size={14} className="text-ink/40" />
                        <span className="text-ink/50 text-xs" style={{ fontWeight: 600 }}>TIMESTAMP</span>
                      </div>
                      <p className="text-ink text-xs" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {selectedBlast.timestamp}
                      </p>
                    </div>

                    {/* Recipients */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(var(--ink-rgb), 0.03)', border: '1px solid rgba(var(--ink-rgb), 0.08)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Users size={14} className="text-ink/40" />
                        <span className="text-ink/50 text-xs" style={{ fontWeight: 600 }}>RECIPIENTS</span>
                      </div>
                      <div className="space-y-0.5">
                        {channelStatuses(selectedBlast).map(({ channel, status, count }) => (
                          <p key={channel} className="text-ink text-sm" style={{ fontWeight: 700 }}>
                            <span className="text-ink/50 text-xs mr-1.5" style={{ fontWeight: 600 }}>{CHANNEL_LABEL[channel]}</span>
                            {status === 'Pending' || status === 'Sending' ? 'Not sent yet' : `${count.toLocaleString()} ${channel === 'app' ? 'phones' : 'residents'}`}
                          </p>
                        ))}
                      </div>
                    </div>

                    {/* Location */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(var(--ink-rgb), 0.03)', border: '1px solid rgba(var(--ink-rgb), 0.08)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin size={14} className="text-ink/40" />
                        <span className="text-ink/50 text-xs" style={{ fontWeight: 600 }}>LOCATION</span>
                      </div>
                      <p className="text-ink text-xs" style={{ fontWeight: 600 }}>
                        {selectedBlast.location}
                      </p>
                    </div>

                    {/* Triggered By */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(var(--ink-rgb), 0.03)', border: '1px solid rgba(var(--ink-rgb), 0.08)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        {selectedBlast.triggerSource === 'System'
                          ? <Cpu size={14} className="text-ink/40" />
                          : <User size={14} className="text-ink/40" />
                        }
                        <span className="text-ink/50 text-xs" style={{ fontWeight: 600 }}>TRIGGERED BY</span>
                      </div>
                      <p className="text-ink text-xs" style={{ fontWeight: 600 }}>
                        {selectedBlast.triggeredBy}
                      </p>
                      <p className="text-ink/50 text-xs">{selectedBlast.triggerSource}</p>
                    </div>

                    {/* Level */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(var(--ink-rgb), 0.03)', border: '1px solid rgba(var(--ink-rgb), 0.08)' }}>
                      <span className="text-ink/50 text-xs block mb-2" style={{ fontWeight: 600 }}>ALERT LEVEL</span>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ ...levelStyle, boxShadow: levelStyle.glow, fontWeight: 700 }}>
                        <LevelIcon size={12} strokeWidth={3} />
                        <span className="text-xs">{selectedBlast.level}</span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="p-3 rounded-2xl" style={{ background: 'rgba(var(--ink-rgb), 0.03)', border: '1px solid rgba(var(--ink-rgb), 0.08)' }}>
                      <span className="text-ink/50 text-xs block mb-2" style={{ fontWeight: 600 }}>DELIVERY STATUS</span>
                      <div className="flex flex-col items-start gap-1.5">
                        {channelStatuses(selectedBlast).map(({ channel, status }) => (
                          <ChannelChip key={channel} channel={channel} status={status} />
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* Close Button */}
                  <button
                    onClick={() => setShowDetailsModal(false)}
                    className="w-full mt-6 py-3 rounded-2xl text-sm transition-all"
                    style={{
                      background: 'rgba(var(--ink-rgb), 0.05)',
                      color: 'rgb(var(--ink-rgb))',
                      fontWeight: 600,
                      border: '1px solid rgba(var(--ink-rgb), 0.1)',
                    }}
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* ===================== COMPOSE NEW BLAST MODAL ===================== */}
      <AnimatePresence>
        {showComposeModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowComposeModal(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(var(--ink-rgb), 0.5)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ pointerEvents: 'none' }}
            >
              <div
                className="w-full max-w-lg p-8 relative"
                style={{
                  background: 'rgba(var(--surface-rgb), 0.95)',
                  borderRadius: '28px',
                  boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.2)',
                  border: '1px solid rgba(46, 196, 182, 0.2)',
                  pointerEvents: 'all',
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-ink text-xl" style={{ fontWeight: 700 }}>Compose Alert</h3>
                    <p className="text-ink/50 text-sm mt-0.5">Send a manual alert by SMS, email, app notification, or any mix</p>
                  </div>
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={() => setShowComposeModal(false)} className="p-2 rounded-xl" style={{ background: 'rgba(var(--ink-rgb), 0.05)' }}>
                    <X className="text-ink/60" size={20} />
                  </motion.button>
                </div>

                <div className="space-y-4">
                  {/* Alert Level */}
                  <div>
                    <label className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Alert Level</label>
                    <div className="flex gap-3">
                      {(['INFO', 'WARNING', 'CRITICAL'] as const).map((level) => {
                        const style = getLevelStyle(level);
                        const Icon = style.icon;
                        const isSelected = newBlast.level === level;
                        return (
                          <button
                            key={level}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setNewBlast({ ...newBlast, level })}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs transition-all"
                            style={{
                              background: isSelected ? style.background : 'rgba(var(--ink-rgb), 0.03)',
                              border: isSelected ? style.border : '1px solid rgba(var(--ink-rgb), 0.1)',
                              color: isSelected ? style.color : 'rgb(var(--ink-rgb))',
                              fontWeight: 700,
                              boxShadow: isSelected ? style.glow : 'none',
                            }}
                          >
                            <Icon size={14} strokeWidth={3} />
                            {level}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Channels */}
                  <div>
                    <span className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Send by</span>
                    <div className="flex gap-3">
                      {([
                        { key: 'sms', label: 'SMS', Icon: MessageSquare },
                        { key: 'email', label: 'Email', Icon: Mail },
                        { key: 'app', label: 'App', Icon: Smartphone },
                      ] as const).map(({ key, label, Icon }) => {
                        const on = channels[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => setChannels((c) => ({ ...c, [key]: !c[key] }))}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs transition-all"
                            style={{
                              background: on ? 'rgba(46, 196, 182, 0.15)' : 'rgba(var(--ink-rgb), 0.03)',
                              border: on ? '1px solid rgba(46, 196, 182, 0.45)' : '1px solid rgba(var(--ink-rgb), 0.1)',
                              color: on ? '#2EC4B6' : 'rgb(var(--ink-rgb))',
                              fontWeight: 700,
                            }}
                          >
                            <Icon size={14} strokeWidth={2.5} />
                            {label}
                            {on && <span aria-hidden="true">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Location */}
                  <div>
                    <label htmlFor="blast-location" className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Target Location</label>
                    <select id="blast-location" value={newBlast.location} onChange={(e) => setNewBlast({ ...newBlast, location: e.target.value })} style={inputStyle}>
                      <option value="">Select location...</option>
                      {SMS_AREAS.map((area) => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                    {newBlast.location && (
                      <div className="mt-1.5 space-y-0.5">
                        {(['sms', 'email', 'app'] as const).filter((k) => channels[k]).map((k) => {
                          const n = counts[k];
                          const bad = n === 0 && k !== 'app';
                          const noun = k === 'sms' ? 'a mobile number' : 'an email';
                          return (
                            <p key={k} className="text-xs" style={{ fontWeight: 600, color: bad ? '#EF4444' : 'rgba(var(--ink-rgb), 0.55)' }}>
                              {n === null
                                ? `Counting ${CHANNEL_LABEL[k]} recipients...`
                                : k === 'app'
                                ? n === 0
                                  ? 'No phones have app notifications enabled yet. The alert will still appear in the app.'
                                  : `${n.toLocaleString()} phone${n === 1 ? '' : 's'} will get an app notification (all registered phones, not just this area).`
                                : n === 0
                                ? `No active, verified residents with ${noun} here. Add them on the Residents page.`
                                : `${n.toLocaleString()} resident${n === 1 ? '' : 's'} will receive this by ${CHANNEL_LABEL[k]}.`}
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Message */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="blast-message" className="block text-ink text-sm" style={{ fontWeight: 600 }}>Message</label>
                      <span className="text-xs" style={{ color: newBlast.message.length > counterLimit ? '#DC2626' : 'rgb(var(--ink-rgb))', opacity: 0.5, fontWeight: 600 }}>
                        {newBlast.message.length}/{counterLimit}
                      </span>
                    </div>
                    <textarea
                      id="blast-message"
                      maxLength={messageLimit}
                      placeholder="Type your emergency message here..."
                      value={newBlast.message}
                      onChange={(e) => setNewBlast({ ...newBlast, message: e.target.value })}
                      rows={4}
                      style={{ ...inputStyle, resize: 'none', lineHeight: '1.5' }}
                    />
                    <p className="text-ink/40 text-xs mt-1">
                      {channels.sms
                        ? `Standard SMS is 160 characters. Longer messages are split into multiple SMS (max ${HARD_LIMIT}).`
                        : `Emails can be up to ${EMAIL_LIMIT} characters.`}
                    </p>
                  </div>

                  {/* Email subject */}
                  {channels.email && (
                    <div>
                      <label htmlFor="blast-subject" className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Email subject (optional)</label>
                      <input
                        id="blast-subject"
                        maxLength={150}
                        placeholder="Leave blank for an automatic subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  )}

                  {/* Preview */}
                  {newBlast.message && channels.sms && (
                    <div className="p-4 rounded-2xl" style={{ background: 'rgba(var(--ink-rgb), 0.03)', border: '1px solid rgba(var(--ink-rgb), 0.08)' }}>
                      <p className="text-ink/50 text-xs mb-1" style={{ fontWeight: 600 }}>SMS PREVIEW</p>
                      <p className="text-ink text-sm">[FloodSense] {newBlast.message}</p>
                    </div>
                  )}
                </div>

                {composeError && (
                  <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '12px', fontWeight: 500 }}>⚠ {composeError}</p>
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowComposeModal(false)}
                    className="flex-1 py-3 rounded-2xl text-sm transition-all"
                    style={{ background: 'rgba(var(--ink-rgb), 0.05)', color: 'rgb(var(--ink-rgb))', fontWeight: 600, border: '1px solid rgba(var(--ink-rgb), 0.1)' }}
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSendBlast}
                    disabled={sending || (!channels.sms && !channels.email && !channels.app) || (countsReady && reach === 0 && !channels.app)}
                    className="flex-1 py-3 rounded-2xl text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)', boxShadow: '0 8px 24px rgba(46, 196, 182, 0.4)', fontWeight: 600 }}
                  >
                    <Send size={16} strokeWidth={2.5} />
                    {sending ? 'Sending...' : 'Send alert'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}