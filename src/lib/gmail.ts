import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';

const KEY = 'waypoint_gmail_token';
export const GMAIL_SCOPES =
  'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose';

export interface InboxEmail { id: string; from: string; subject: string; date: string; snippet: string; text: string }

/* Supabase only exposes Google's token right after sign-in, so keep it for this tab only. */
if (supabase) {
  const keep = (t?: string | null) => { if (t) { try { sessionStorage.setItem(KEY, t); } catch { /* ignore */ } } };
  supabase.auth.onAuthStateChange((_e, s) => keep(s?.provider_token));
  void supabase.auth.getSession().then(({ data }) => keep(data.session?.provider_token));
}

export const getGmailToken = (): string | null => { try { return sessionStorage.getItem(KEY); } catch { return null; } };

export async function connectGmail(): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: GMAIL_SCOPES,
      redirectTo: window.location.href.split('#')[0].split('?')[0],
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw error;
}

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const token = getGmailToken();
  if (!token) throw new Error('not_connected');
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured.');
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/gmail-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({ ...payload, accessToken: token }),
    });
  } catch {
    throw new Error('Could not reach the gmail-sync function. Deploy it with: supabase functions deploy gmail-sync --no-verify-jwt');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === 'token_expired' || data.error === 'missing_scope') {
      try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      throw new Error('not_connected');
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const scanInbox = async () => (await call<{ emails: InboxEmail[] }>({ action: 'scan' })).emails;
export const createGmailDraft = (to: string, subject: string, body: string) =>
  call<{ draftId: string; url: string }>({ action: 'draft', to, subject, body });
