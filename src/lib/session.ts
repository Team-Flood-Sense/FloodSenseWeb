import { supabase } from './supabase';

/** Adds a sign-in or sign-out to the activity log. A logging problem never blocks the user. */
export async function logSession(event: 'login' | 'logout') {
  const { error } = await supabase.rpc('log_session_event', { p_event: event });
  if (error) console.warn(`Could not record the ${event}:`, error.message);
}

/** Records the sign-out (while the session still exists), then ends the session. */
export async function signOut() {
  await logSession('logout');
  await supabase.auth.signOut();
}
