import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const ALL_RESIDENTS = 'All Residents';
export const DEFAULT_AREA = 'Barangay Pamplona 3';
/** Areas a blast (or a resident) can belong to. */
export const SMS_AREAS = [ALL_RESIDENTS, DEFAULT_AREA];

export type BlastLevel = 'INFO' | 'WARNING' | 'CRITICAL';
export type Channel = 'sms' | 'email' | 'app';
/** Channels delivered by an Edge Function (the app channel is handled inside the database). */
type ServerChannel = 'sms' | 'email';

export const CHANNEL_LABEL: Record<Channel, string> = { sms: 'SMS', email: 'Email', app: 'App' };

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
export async function countRecipients(area: string, channel: ServerChannel): Promise<number | null> {
  // Done in the database so staff accounts are never counted
  const { data, error } = await supabase.rpc('count_alert_recipients', { p_area: area, p_channel: channel });
  return error ? null : (data as number | null) ?? 0;
}

async function isConfigured(fn: 'send-sms' | 'send-email'): Promise<boolean | null> {
  const { data, error } = await supabase.functions.invoke(fn, { body: { action: 'status' } });
  if (error) return null;
  return Boolean(data?.configured);
}

/** Whether each gateway is set up. null = could not tell (function missing or unreachable). */
/** Number of phones registered for the mobile app's push notifications (staff only). */
export async function countAppDevices(): Promise<number | null> {
  const { data, error } = await supabase.rpc('count_app_devices');
  return error ? null : (data as number | null) ?? 0;
}

export async function getGatewayStatus(): Promise<Record<ServerChannel, boolean | null>> {
  const [sms, email] = await Promise.all([isConfigured('send-sms'), isConfigured('send-email')]);
  return { sms, email };
}

// ── Sending ────────────────────────────────────────────────────

const FUNCTION: Record<ServerChannel, 'send-sms' | 'send-email'> = { sms: 'send-sms', email: 'send-email' };
const GATEWAY: Record<ServerChannel, string> = { sms: 'SMS gateway', email: 'email service' };

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

async function sendChannel(channel: ServerChannel, blastId: string): Promise<BlastOutcome> {
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
  /** Also add the alert to the mobile app's alert list and push it to registered phones. */
  app?: boolean;
  /** Email subject; a sensible default is generated when empty. */
  subject?: string;
}

/** The App channel runs inside the database; read back how it went. */
async function appOutcome(blastId: string): Promise<BlastOutcome> {
  const { data, error } = await supabase
    .from('sms_blasts')
    .select('app_status, app_recipients, app_error')
    .eq('id', blastId)
    .single();
  if (error || !data) return { kind: 'pending', reason: 'Could not confirm that the app notification was queued.' };
  if (data.app_status === 'Failed') {
    return { kind: 'failed', error: data.app_error || 'The app notification could not be created.' };
  }
  if (data.app_status === 'Sent') {
    return {
      kind: 'sent',
      recipients: data.app_recipients ?? 0,
      warning: data.app_recipients ? undefined : 'no phones have notifications enabled yet, but it appears in the app',
    };
  }
  return { kind: 'pending', reason: 'The app notification is still being queued.' };
}

/**
 * Saves a blast in the log, then asks the server to deliver it on each selected channel.
 * Throws only if the blast could not even be saved.
 */
export async function sendBlast(input: BlastInput): Promise<BlastResult> {
  if (!input.sms && !input.email && !input.app) throw new Error('Select at least one channel (SMS, Email or App).');

  // The sender, statuses and source are stamped by the database.
  const { data: blast, error: insertError } = await supabase
    .from('sms_blasts')
    .insert({
      message: input.message,
      level: input.level,
      location: input.location,
      send_sms: input.sms,
      send_email: input.email,
      send_app: Boolean(input.app),
      email_subject: input.email ? input.subject?.trim() || null : null,
    })
    .select('id')
    .single();
  if (insertError || !blast) throw new Error('Failed to save the blast. Please try again.');

  const channels = (['sms', 'email'] as ServerChannel[]).filter((c) => input[c]);
  const outcomes = await Promise.all(channels.map((c) => sendChannel(c, blast.id)));

  const result: BlastResult = {};
  channels.forEach((c, i) => {
    result[c] = outcomes[i];
  });
  if (input.app) result.app = await appOutcome(blast.id);
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
      const unit = c === 'app' ? ` phone${o.recipients === 1 ? '' : 's'}` : '';
      parts.push(`${label}: sent to ${o.recipients.toLocaleString()}${unit}${o.warning ? ` (${o.warning})` : ''}`);
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
