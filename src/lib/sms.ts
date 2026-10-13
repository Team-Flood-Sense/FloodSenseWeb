import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const ALL_RESIDENTS = 'All Residents';
export const DEFAULT_AREA = 'Barangay Pamplona 3';
/** Areas a blast (or a resident) can belong to. */
export const SMS_AREAS = [ALL_RESIDENTS, DEFAULT_AREA];

export type BlastLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export type BlastOutcome =
  /** The gateway accepted the messages. `warning` is set when some numbers were rejected. */
  | { kind: 'sent'; recipients: number; warning?: string }
  /** Saved in the log but not sent (gateway not configured or unreachable). */
  | { kind: 'pending'; reason: string }
  | { kind: 'failed'; error: string };

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

/** Number of active, verified residents a blast to `area` would reach. */
export async function countRecipients(area: string): Promise<number | null> {
  let q = supabase
    .from('residents')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('is_verified', true);
  if (area !== ALL_RESIDENTS) q = q.eq('area', area);
  const { count, error } = await q;
  return error ? null : count ?? 0;
}

/** Whether the SMS gateway (Semaphore key) is set up. null = could not tell. */
export async function getGatewayConfigured(): Promise<boolean | null> {
  const { data, error } = await supabase.functions.invoke('send-sms', { body: { action: 'status' } });
  if (error) return null;
  return Boolean(data?.configured);
}

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
  return { status: 0, message: 'Could not reach the SMS service. Check your connection.' };
}

/**
 * Saves a blast in the log, then asks the send-sms function to deliver it.
 * Throws only if the blast could not even be saved.
 */
export async function sendBlast(input: { message: string; level: BlastLevel; location: string }): Promise<BlastOutcome> {
  // The sender, status and source are stamped by the database.
  const { data: blast, error: insertError } = await supabase
    .from('sms_blasts')
    .insert(input)
    .select('id')
    .single();
  if (insertError || !blast) throw new Error('Failed to save the blast. Please try again.');

  const { data, error } = await supabase.functions.invoke('send-sms', { body: { blast_id: blast.id } });

  if (error) {
    const { status, message, code } = await errorBody(error);
    if (code === 'not_configured') {
      return { kind: 'pending', reason: 'The SMS gateway key has not been set up yet, so nothing was sent.' };
    }
    if (status === 404) {
      return { kind: 'pending', reason: 'The send-sms function is not deployed in Supabase, so nothing was sent.' };
    }
    if (status === 0) return { kind: 'pending', reason: message };
    return { kind: 'failed', error: message };
  }

  if (data?.status === 'Sent') {
    return { kind: 'sent', recipients: data.recipients ?? 0, warning: data.error ?? undefined };
  }
  return { kind: 'failed', error: data?.error || 'The SMS gateway did not accept the messages.' };
}
