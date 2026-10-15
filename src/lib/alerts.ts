import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const ALL_RESIDENTS = 'All Residents';
export const DEFAULT_AREA = 'Barangay Pamplona 3';
/** Areas a blast (or a resident) can belong to. */
export const SMS_AREAS = [ALL_RESIDENTS, DEFAULT_AREA];

export type BlastLevel = 'INFO' | 'WARNING' | 'CRITICAL';
export type Channel = 'sms' | 'email';

export const CHANNEL_LABEL: Record<Channel, string> = { sms: 'SMS', email: 'Email' };

export type BlastOutcome =
  /** The provider accepted the messages. `warning` is set when some were rejected. */
  | { kind: 'sent'; recipients: number; warning?: string }
  /** Saved in the log but not sent (provider not configured or unreachable). */
  | { kind: 'pending'; reason: string }
  | { kind: 'failed'; error: string };

/** Result per channel that was requested. */
export type BlastResult = Partial<Record<Channel, BlastOutcome>>;

// ── Phone numbers ──────────────────────────────────────────────

/** Normalises a Philippine mobile number to 639XXXXXXXXX (same rule as the database). */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (/^639\d{9}$/.test(d)) return d;
  if (/^09\d{9}$/.test(d)) return '63' + d.slice(1);
  if (/^9\d{9}$/.test(d)) return '63' + d;
  return d;
}

export const isValidPhone = (raw: string) => /^639\d{9}$/.test(normalizePhone(raw));

/** 639171234567 -> 0917 123 4567 */
export function formatPhone(phone: string): string {
  const d = normalizePhone(phone);
  return /^639\d{9}$/.test(d) ? `0${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : phone;
}

// ── Emails ─────────────────────────────────────────────────────

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();
export const isValidEmail = (raw: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw.trim());

// ── Recipients and gateway status ──────────────────────────────

/** Number of active, verified residents a blast to `area` would reach on `channel`. */
export async function countRecipients(area: string, channel: Channel): Promise<number | null> {
  let q = supabase
    .from('residents')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('is_verified', true)
    .not(channel === 'sms' ? 'phone' : 'email', 'is', null);
  if (area !== ALL_RESIDENTS) q = q.eq('area', area);
  const { count, error } = await q;
  return error ? null : count ?? 0;
}

async function isConfigured(fn: 'send-sms' | 'send-email'): Promise<boolean | null> {
  const { data, error } = await supabase.functions.invoke(fn, { body: { action: 'status' } });
  if (error) return null;
  return Boolean(data?.configured);
}

/** Whether each gateway is set up. null = could not tell (function missing or unreachable). */
export async function getGatewayStatus(): Promise<Record<Channel, boolean | null>> {
  const [sms, email] = await Promise.all([isConfigured('send-sms'), isConfigured('send-email')]);
  return { sms, email };
}

// ── Sending ────────────────────────────────────────────────────

const FUNCTION: Record<Channel, 'send-sms' | 'send-email'> = { sms: 'send-sms', email: 'send-email' };
const GATEWAY: Record<Channel, string> = { sms: 'SMS gateway', email: 'email service' };

async function errorBody(error: unknown): Promise<{ status: number; message: string; code?: string }> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context.status;
    try {
      const body = await error.context.json();
      return { status, message: body.error || body.message || `Server error (${status})`, code: body.code };
    } catch {
      return { status, message: `Server error (${status})` };
    }
  }
  return { status: 0, message: 'Could not reach the server. Check your connection.' };
}

async function sendChannel(channel: Channel, blastId: string): Promise<BlastOutcome> {
  const { data, error } = await supabase.functions.invoke(FUNCTION[channel], { body: { blast_id: blastId } });

  if (error) {
    const { status, message, code } = await errorBody(error);
    if (code === 'not_configured') {
      return { kind: 'pending', reason: `The ${GATEWAY[channel]} has not been set up yet, so nothing was sent.` };
    }
    if (status === 404) {
      return { kind: 'pending', reason: `The ${FUNCTION[channel]} function is not deployed in Supabase, so nothing was sent.` };
    }
    if (status === 0) return { kind: 'pending', reason: message };
    return { kind: 'failed', error: message };
  }

  if (data?.status === 'Sent') {
    return { kind: 'sent', recipients: data.recipients ?? 0, warning: data.error ?? undefined };
  }
  return { kind: 'failed', error: data?.error || `The ${GATEWAY[channel]} did not accept the messages.` };
}

export interface BlastInput {
  message: string;
  level: BlastLevel;
  location: string;
  sms: boolean;
  email: boolean;
  /** Email subject; a sensible default is generated when empty. */
  subject?: string;
}

/**
 * Saves a blast in the log, then asks the server to deliver it on each selected channel.
 * Throws only if the blast could not even be saved.
 */
export async function sendBlast(input: BlastInput): Promise<BlastResult> {
  if (!input.sms && !input.email) throw new Error('Select at least one channel (SMS or Email).');

  // The sender, statuses and source are stamped by the database.
  const { data: blast, error: insertError } = await supabase
    .from('sms_blasts')
    .insert({
      message: input.message,
      level: input.level,
      location: input.location,
      send_sms: input.sms,
      send_email: input.email,
      email_subject: input.email ? input.subject?.trim() || null : null,
    })
    .select('id')
    .single();
  if (insertError || !blast) throw new Error('Failed to save the blast. Please try again.');

  const channels = (['sms', 'email'] as Channel[]).filter((c) => input[c]);
  const outcomes = await Promise.all(channels.map((c) => sendChannel(c, blast.id)));

  const result: BlastResult = {};
  channels.forEach((c, i) => {
    result[c] = outcomes[i];
  });
  return result;
}

/** One-line summary of a result, e.g. "SMS: sent to 12 · Email: failed (reason)". */
export function summarizeResult(result: BlastResult): { tone: 'success' | 'warn' | 'error'; text: string } {
  const parts: string[] = [];
  let worst: 'success' | 'warn' | 'error' = 'success';
  const rank = { success: 0, warn: 1, error: 2 } as const;
  const bump = (t: 'success' | 'warn' | 'error') => {
    if (rank[t] > rank[worst]) worst = t;
  };

  (Object.keys(result) as Channel[]).forEach((c) => {
    const o = result[c]!;
    const label = CHANNEL_LABEL[c];
    if (o.kind === 'sent') {
      parts.push(`${label}: sent to ${o.recipients.toLocaleString()}${o.warning ? ` (${o.warning})` : ''}`);
      bump(o.warning ? 'warn' : 'success');
    } else if (o.kind === 'pending') {
      parts.push(`${label}: saved as Pending. ${o.reason}`);
      bump('warn');
    } else {
      parts.push(`${label}: failed. ${o.error}`);
      bump('error');
    }
  });
  return { tone: worst, text: parts.join(' · ') };
}
